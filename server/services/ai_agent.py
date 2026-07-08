import json
import logging
import os

import requests

from services.prompts import (
    HANDLER_AGENT_SYSTEM_PROMPT,
    HANDLER_GENERATION_SYSTEM_PROMPT,
    HANDLER_TOOLS,
    INTENT_SYSTEM_PROMPT,
    LOG_TRANSLATION_SYSTEM_PROMPT,
    QUERY_AGENT_SYSTEM_PROMPT,
    REPORT_NARRATIVE_SYSTEM_PROMPT,
    forensic_system_prompt,
)

logger = logging.getLogger(__name__)

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
_HEADERS = {"Content-Type": "application/json"}


def _url() -> str:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")
    return f"{_GEMINI_URL}?key={key}"


def _extract_text(response: requests.Response) -> str:
    return (
        response.json()
        .get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )


def classify_intent(message: str, handler_history: list | None = None) -> dict:
    contents = []
    for msg in (handler_history or [])[-6:]:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "systemInstruction": {"parts": [{"text": INTENT_SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.0},
    }

    response = requests.post(_url(), json=payload, headers=_HEADERS)
    response.raise_for_status()

    raw = _extract_text(response).strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"Intent classifier returned non-JSON: {raw!r} — falling back to forensic")
        return {"intent": "forensic"}


def run_query_agent(message: str, handler_history: list, available_relations: list) -> dict:
    relations_text = "\n".join(f"  - {r}" for r in sorted(available_relations))
    system = QUERY_AGENT_SYSTEM_PROMPT + f"\nAVAILABLE RELATION TYPES:\n{relations_text}"

    contents = []
    for msg in (handler_history or [])[-6:]:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json"},
    }

    response = requests.post(_url(), json=payload, headers=_HEADERS)
    response.raise_for_status()

    raw = _extract_text(response).strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        data = json.loads(raw)
        return {"query": str(data.get("query", "")), "label": str(data.get("label", "AI Query"))}
    except json.JSONDecodeError:
        logger.warning(f"Query agent returned non-JSON: {raw!r}")
        return {"query": "", "label": ""}


def run_handler_agent(message: str, handler_history: list, tool_executor) -> dict:
    """
    Runs a multi-turn Gemini tool-calling loop for handler management.
    Phase 1: forced tool-call rounds (mode=ANY) until no more calls come back.
    Phase 2: one text-only call to get a plain-English summary.
    Returns {"summary": str, "needs_reparse": bool, "results": list}.
    """
    contents = []
    for msg in (handler_history or [])[-10:]:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    all_results = []
    needs_reparse = False

    # Phase 1 — force tool calls until Gemini stops requesting them
    for _ in range(5):
        payload = {
            "systemInstruction": {"parts": [{"text": HANDLER_AGENT_SYSTEM_PROMPT}]},
            "contents": contents,
            "tools": HANDLER_TOOLS,
            "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
            "generationConfig": {"temperature": 0.0},
        }

        resp = requests.post(_url(), json=payload, headers=_HEADERS)
        resp.raise_for_status()

        parts = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
        function_calls = [p["functionCall"] for p in parts if "functionCall" in p]

        if not function_calls:
            break

        function_responses = []
        for call in function_calls:
            result = tool_executor(call["name"], call.get("args", {}))
            all_results.append({"tool": call["name"], "args": call.get("args", {}), **result})
            if call["name"] in ("add_handler", "remove_handler") and result.get("status") == "ok":
                needs_reparse = True
            function_responses.append({
                "functionResponse": {"name": call["name"], "response": result}
            })

        contents.append({"role": "model", "parts": [{"functionCall": c["functionCall"]} for c in parts if "functionCall" in c]})
        contents.append({"role": "user", "parts": function_responses})

    # Phase 2 — one text-only call to produce the human-readable summary
    summary_payload = {
        "systemInstruction": {"parts": [{"text": HANDLER_AGENT_SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.2},
    }
    summary_resp = requests.post(_url(), json=summary_payload, headers=_HEADERS)
    summary_resp.raise_for_status()
    summary_parts = summary_resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
    final_text = "\n".join(p["text"] for p in summary_parts if "text" in p).strip() or "Done."

    return {"summary": final_text, "needs_reparse": needs_reparse, "results": all_results}


def generate_forensic_response(timeline_lines, chat_history, context_label='the investigation timeline'):
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Returning mock response.")
        return "**[MOCK AI RESPONSE]**\n\nNo API Key found. Please add GEMINI_API_KEY to your .env file."

    system_prompt = forensic_system_prompt(context_label, "\n".join(timeline_lines))

    contents = []
    for msg in chat_history:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.2},
    }

    try:
        response = requests.post(_url(), json=payload, headers=_HEADERS)
        response.raise_for_status()
        response_data = response.json()
        usage = response_data.get("usageMetadata", {})
        logger.info(f"AI Token Usage - Input: {usage.get('promptTokenCount')}, Output: {usage.get('candidatesTokenCount')}, Total: {usage.get('totalTokenCount')}")
        return _extract_text(response).strip()
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during AI generation: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during AI generation: {e}")
        raise


def generate_event_handler(event_id: str | None, description: str) -> str:
    if event_id:
        prompt = f"Generate a handler for Windows Security Event ID {event_id}. {description}"
    else:
        prompt = (
            f"Task: {description}\n"
            "Choose the single most appropriate Windows Security Event ID for this detection, "
            "then generate the handler for it."
        )

    payload = {
        "systemInstruction": {"parts": [{"text": HANDLER_GENERATION_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1},
    }

    response = requests.post(_url(), json=payload, headers=_HEADERS)
    response.raise_for_status()
    return _extract_text(response).strip()


def generate_report_narrative(evidence_list) -> str:
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Returning mock narrative.")
        return "**[MOCK NARRATIVE]**\n\nThe AI could not generate a narrative because the API key is missing."

    evidence_text = "".join(
        f"Event {i}: [{ev.get('Timestamp', 'N/A')}] {ev.get('Source Entity', 'Unknown')} -> {ev.get('Action/Type', 'Unknown')} -> {ev.get('Target Entity', 'Unknown')} (Event ID: {ev.get('Event ID', 'N/A')})\n"
        for i, ev in enumerate(evidence_list, 1)
    )
    user_prompt = f"Here are the flagged events in chronological order:\n\n{evidence_text}\n\nPlease generate the narrative report."

    payload = {
        "systemInstruction": {"parts": [{"text": REPORT_NARRATIVE_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2},
    }

    try:
        response = requests.post(_url(), json=payload, headers=_HEADERS)
        response.raise_for_status()
        return _extract_text(response).strip()
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during narrative generation: {e}")
        return "Error: Could not generate narrative due to API connection issue."
    except Exception as e:
        logger.error(f"Unexpected error during narrative generation: {e}")
        return "Error: An unexpected error occurred while generating the narrative."


def generate_log_translation(log_details) -> str:
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Returning mock translation.")
        return "Error: API Key missing."

    payload = {
        "systemInstruction": {"parts": [{"text": LOG_TRANSLATION_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": f"Telemetry: {log_details}"}]}],
        "generationConfig": {"temperature": 0.1},
    }

    try:
        response = requests.post(_url(), json=payload, headers=_HEADERS)
        response.raise_for_status()
        logger.info("Translation request completed successfully.")
        return _extract_text(response).strip()
    except Exception as e:
        logger.error(f"Log translation failed: {e}")
        return "Failed to translate log due to an error."
