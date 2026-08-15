import json
import logging
import os

import services.gemini_client as gemini
from constants.prompts import (
    FORENSIC_SYSTEM_PROMPT,
    HANDLER_AGENT_SYSTEM_PROMPT,
    HANDLER_GENERATION_SYSTEM_PROMPT,
    HANDLER_TOOLS,
    INTENT_SYSTEM_PROMPT,
    LOG_TRANSLATION_SYSTEM_PROMPT,
    QUERY_AGENT_SYSTEM_PROMPT,
    REPORT_NARRATIVE_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


def _history_to_contents(history: list, limit: int = 6) -> list:
    contents = []
    for msg in (history or [])[-limit:]:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    return contents


def classify_intent(message: str, handler_history: list | None = None) -> dict:
    contents = _history_to_contents(handler_history) + [
        {"role": "user", "parts": [{"text": message}]}
    ]
    raw = gemini.generate(INTENT_SYSTEM_PROMPT, contents, temperature=0.0)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"Intent classifier returned non-JSON: {raw!r} — falling back to forensic")
        return {"intent": "forensic"}


def run_query_agent(message: str, handler_history: list, available_relations: list) -> dict:
    relations_text = "\n".join(f"  - {r}" for r in sorted(available_relations))
    system = QUERY_AGENT_SYSTEM_PROMPT + f"\nAVAILABLE RELATION TYPES:\n{relations_text}"
    contents = _history_to_contents(handler_history) + [
        {"role": "user", "parts": [{"text": message}]}
    ]
    raw = gemini.generate(system, contents, temperature=0.0, mime_type="application/json")
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(raw)
        return {"query": str(data.get("query", "")), "label": str(data.get("label", "AI Query"))}
    except json.JSONDecodeError:
        logger.warning(f"Query agent returned non-JSON: {raw!r}")
        return {"query": "", "label": ""}


def run_handler_agent(message: str, handler_history: list, tool_executor) -> dict:
    """
    Multi-turn Gemini tool-calling loop for handler management.
    Phase 1: forced tool-call rounds until no more calls come back.
    Phase 2: one text-only call for the plain-English summary.
    Returns {"summary": str, "needs_reparse": bool, "results": list}.
    """
    contents = _history_to_contents(handler_history, limit=10) + [
        {"role": "user", "parts": [{"text": message}]}
    ]
    all_results = []
    needs_reparse = False

    for i in range(5):
        parts = gemini.generate_with_tools(HANDLER_AGENT_SYSTEM_PROMPT, contents, HANDLER_TOOLS, force=i == 0)
        function_calls = [p["functionCall"] for p in parts if "functionCall" in p]
        if not function_calls:
            break

        function_responses = []
        for call in function_calls:
            result = tool_executor(call["name"], call.get("args", {}))
            all_results.append({"tool": call["name"], "args": call.get("args", {}), **result})
            if call["name"] in ("add_handler", "remove_handler") and result.get("status") == "ok":
                needs_reparse = True
            function_responses.append({"functionResponse": {"name": call["name"], "response": result}})

        contents.append({"role": "model", "parts": [p for p in parts if "functionCall" in p]})
        contents.append({"role": "user", "parts": function_responses})

    final_text = gemini.generate(HANDLER_AGENT_SYSTEM_PROMPT, contents, temperature=0.2) or "Done."
    return {"summary": final_text, "needs_reparse": needs_reparse, "results": all_results}


def generate_forensic_response(timeline_lines: list, chat_history: list, context_label: str = 'the investigation timeline') -> str:
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Returning mock response.")
        return "**[MOCK AI RESPONSE]**\n\nNo API Key found. Please add GEMINI_API_KEY to your .env file."

    # Timeline injected as the first user turn so the system prompt stays static
    contents = [
        {"role": "user", "parts": [{"text": f"Investigation data ({context_label}):\n\n" + "\n".join(timeline_lines)}]},
        {"role": "model", "parts": [{"text": "Understood. I have the investigation data loaded and am ready to assist."}]},
    ]
    contents += _history_to_contents(chat_history, limit=len(chat_history))

    return gemini.generate(FORENSIC_SYSTEM_PROMPT, contents, temperature=0.2)


def generate_event_handler(event_id: str | None, description: str) -> str:
    if event_id:
        prompt = f"Generate a handler for Windows Security Event ID {event_id}. {description}"
    else:
        prompt = (
            f"Task: {description}\n"
            "Choose the single most appropriate Windows Security Event ID for this detection, "
            "then generate the handler for it."
        )
    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    return gemini.generate(HANDLER_GENERATION_SYSTEM_PROMPT, contents, temperature=0.1)


def generate_report_narrative(evidence_list: list) -> str:
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Returning mock narrative.")
        return "**[MOCK NARRATIVE]**\n\nThe AI could not generate a narrative because the API key is missing."

    evidence_text = "".join(
        f"Event {i}: [{ev.get('Timestamp', 'N/A')}] {ev.get('Source Entity', 'Unknown')} -> "
        f"{ev.get('Action/Type', 'Unknown')} -> {ev.get('Target Entity', 'Unknown')} "
        f"(Event ID: {ev.get('Event ID', 'N/A')})\n"
        for i, ev in enumerate(evidence_list, 1)
    )
    user_prompt = f"Here are the flagged events in chronological order:\n\n{evidence_text}\n\nPlease generate the narrative report."
    contents = [{"role": "user", "parts": [{"text": user_prompt}]}]

    return gemini.generate(REPORT_NARRATIVE_SYSTEM_PROMPT, contents, temperature=0.2)


def generate_log_translation(log_details) -> str:
    if not os.getenv("GEMINI_API_KEY"):
        logger.warning("GEMINI_API_KEY is not set. Returning mock translation.")
        return "Error: API Key missing."

    contents = [{"role": "user", "parts": [{"text": f"Telemetry: {log_details}"}]}]
    result = gemini.generate(LOG_TRANSLATION_SYSTEM_PROMPT, contents, temperature=0.1)
    logger.info("Translation request completed successfully.")
    return result
