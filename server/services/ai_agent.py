import json
import os
import requests
import logging

logger = logging.getLogger(__name__)

_INTENT_SYSTEM_PROMPT = """You are an intent classifier for ForensiFlow, a Windows EVTX forensics tool.

Classify the user message as one of three intents. Respond with JSON only — no explanation, no markdown.

INTENTS:
- "handler_agent": user wants to manage event handlers (add, remove, list, explain)
- "query_agent": user wants to CHANGE WHAT IS VISIBLE IN THE GRAPH — filter nodes/edges, highlight specific events, search for a specific user/process/action. The result is a visual change to the graph, not a text answer.
- "forensic": user wants a TEXT ANSWER from the AI — analysis, explanation, summary, investigation insights, answers to "why", "what happened", "is this suspicious", etc.

THE KEY DISTINCTION:
- If the user's request is best served by filtering the graph to show them something → "query_agent"
- If the user's request is best served by the AI writing a text response → "forensic"

EXAMPLES of "query_agent" (result = graph filter applied):
  "show me all failed logons"
  "find all enabled accounts"
  "filter for remote access events"
  "search for processes created by admin"
  "give me all network connections"
  "highlight logons from IP 10.0.0.1"
  "list all process creation events"
  "find lateral movement events"

EXAMPLES of "forensic" (result = AI writes a text response):
  "what happened in this investigation?"
  "explain the attack"
  "why did this logon fail?"
  "summarize the lateral movement"
  "is this user suspicious?"
  "what should I look for next?"

CRITICAL RULE: Any message with "add a handler", "create a handler", "generate a handler", "make a handler", "build a handler", "write a handler", "add handler", "remove handler", "list handlers", "remove the", or "delete handler" is ALWAYS "handler_agent".

Response format (pick exactly one):
{"intent": "handler_agent"}
{"intent": "query_agent"}
{"intent": "forensic"}"""


def classify_intent(message: str, handler_history: list | None = None) -> dict:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"

    contents = []
    for msg in (handler_history or [])[-6:]:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "systemInstruction": {"parts": [{"text": _INTENT_SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.0},
    }

    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    response.raise_for_status()

    raw = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(f"Intent classifier returned non-JSON: {raw!r} — falling back to forensic")
        return {"intent": "forensic"}


_QUERY_AGENT_SYSTEM_PROMPT = """You are a query generator for ForensiFlow, a Windows EVTX forensics tool.

The user wants to filter the investigation graph. Generate a query string in the ForensiFlow search language.

QUERY SYNTAX:
  RELATION_TYPE                     — all edges of this type (e.g. FAILED_LOGON)
  RELATION_TYPE.src==name           — source node name contains "name" (case-insensitive, partial)
  RELATION_TYPE.dst==name           — target node name contains "name" (case-insensitive, partial)
  RELATION_TYPE.FieldName==value    — detail field contains "value" (case-insensitive, partial)
  *.FieldName==value                — any relation type, match on field
  A AND B  /  A OR B  /  NOT A      — boolean operators
  (...)                             — grouping

Common Windows event field names:
  SubjectUserName, TargetUserName    — who performed / who was affected
  SubjectDomainName, TargetDomainName
  LogonType                          — 2=Interactive 3=Network 10=RemoteInteractive
  IpAddress, IpPort                  — source IP for network logons
  ProcessName, NewProcessName        — executable path
  CommandLine                        — full command line
  Status, SubStatus                  — NTSTATUS failure codes (shown with human-readable prefix)
  ObjectName                         — file or registry path

Respond with JSON only — no explanation, no markdown:
{"query": "FAILED_LOGON", "label": "Failed Logons"}

"query" = the search string. "label" = a 2-4 word human-readable name for the saved tab.
If you cannot produce a meaningful query, return: {"query": "", "label": ""}
"""


def run_query_agent(message: str, handler_history: list, available_relations: list) -> dict:
    """
    Translates a natural-language filter request into a ForensiFlow search query string.
    Returns {"query": str, "label": str}.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    relations_text = "\n".join(f"  - {r}" for r in sorted(available_relations))
    system = _QUERY_AGENT_SYSTEM_PROMPT + f"\nAVAILABLE RELATION TYPES:\n{relations_text}"

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"

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

    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    response.raise_for_status()

    raw = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        data = json.loads(raw)
        return {"query": str(data.get("query", "")), "label": str(data.get("label", "AI Query"))}
    except json.JSONDecodeError:
        logger.warning(f"Query agent returned non-JSON: {raw!r}")
        return {"query": "", "label": ""}


_HANDLER_TOOLS = [
    {
        "functionDeclarations": [
            {
                "name": "add_handler",
                "description": "Generate and register a new Windows event handler. Call once per handler — call multiple times for multiple handlers.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "event_id": {"type": "STRING", "description": "4-5 digit Windows Event ID, or omit to let the generator decide"},
                        "description": {"type": "STRING", "description": "Full description of what behaviour to detect"},
                        "name": {"type": "STRING", "description": "Short snake_case name (2-4 words) derived from the relationships the handler creates — NOT from the user's words. Example: a handler creating ACCOUNT_ENABLED edges → 'user_account_enabled'"}
                    },
                    "required": ["description", "name"]
                }
            },
            {
                "name": "remove_handler",
                "description": "Remove a registered AI-generated handler by name, event ID, or stem fragment. Call once per handler to remove.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING", "description": "Handler name, event ID number, or file stem fragment to match"}
                    },
                    "required": ["name"]
                }
            },
            {
                "name": "list_handlers",
                "description": "List all currently registered AI-generated event handlers.",
                "parameters": {"type": "OBJECT", "properties": {}}
            },
            {
                "name": "explain_handler",
                "description": "Return the reasoning from a specific handler's source code.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING", "description": "Handler name, event ID, or stem fragment"}
                    },
                    "required": ["name"]
                }
            }
        ]
    }
]

_AGENT_SYSTEM_PROMPT = """You are a handler management agent for ForensiFlow, a Windows EVTX forensics tool.

The user may ask you to add, remove, list, or explain event handlers. Call multiple tools in one response when needed — "add handlers for events 4624 and 4688" should result in two add_handler calls.

For handler names: derive the name from the RELATIONSHIPS the handler creates, not the user's words.

After all tool calls complete, give a brief plain-English summary of what was done."""


def run_handler_agent(message: str, handler_history: list, tool_executor) -> dict:
    """
    Runs a multi-turn Gemini tool-calling loop for handler management.
    Phase 1: forced tool-call rounds (mode=ANY) until no more calls come back.
    Phase 2: one text-only call to get a plain-English summary.
    Returns {"summary": str, "needs_reparse": bool, "results": list}.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}

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
            "systemInstruction": {"parts": [{"text": _AGENT_SYSTEM_PROMPT}]},
            "contents": contents,
            "tools": _HANDLER_TOOLS,
            "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
            "generationConfig": {"temperature": 0.0},
        }

        resp = requests.post(url, json=payload, headers=headers)
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
        "systemInstruction": {"parts": [{"text": _AGENT_SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.2},
    }
    summary_resp = requests.post(url, json=summary_payload, headers=headers)
    summary_resp.raise_for_status()
    summary_parts = summary_resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
    final_text = "\n".join(p["text"] for p in summary_parts if "text" in p).strip() or "Done."

    return {
        "summary": final_text,
        "needs_reparse": needs_reparse,
        "results": all_results,
    }

_HANDLER_SYSTEM_PROMPT = """You are an expert Windows security engineer and Python developer.
Generate a Python event handler for the ForensiFlow EVTX forensics tool.

AVAILABLE IMPORTS (use exactly these, nothing else):
  from services.handlers._shared import ENTITY_RESOLVERS, _insert_graph_relationship
  from services.handlers import register_handler

ENTITY_RESOLVERS — these are the ONLY eight resolvers available. Use no others.
Call signature: resolver(data_map, name_key, id_key, lookup_map)

  'user'     → str          name_key=username field, id_key=SID field, lookup_map=sid_map
  'process'  → tuple(id,name)  name_key=image path field, id_key=PID field, lookup_map=proc_map
  'computer' → str          name_key=None to use the event host, or a hostname field; lookup_map={}
  'file'     → str          name_key=path field (e.g. 'ObjectName', 'ShareName'); lookup_map={}
  'registry' → str          auto-combines ObjectName+ObjectValueName; lookup_map={}
  'service'  → str          name_key=service name field; lookup_map={}
  'task'     → str          name_key=task name field; lookup_map={}
  'group'    → str          name_key=group name field; lookup_map={}

If the entities involved in an event cannot be adequately represented by any of these eight
resolvers, do not invent a new one. Instead, respond with a plain English explanation of
why you cannot map the request — no code, no formatting, just a natural sentence or two.

_insert_graph_relationship(tx, case_id, src_label, src_data, tgt_label, tgt_data, rel_type, log['details'])
  src_label / tgt_label — one of: User, Computer, Process, Registry, Task, Service, File, Group
  rel_type — UPPER_SNAKE_CASE describing the action (e.g. DCSYNC, KERBEROASTING, OBJECT_ACCESS)
  src_data / tgt_data — value returned by an ENTITY_RESOLVERS call

REQUIRED HEADER — every file must start with this comment block (fill in the fields):

# EVENT: <event ID and its official Windows name>
# REASONING: <why this event was chosen, what attacker behaviour it captures>
# RELATIONSHIPS: <one line per relationship: SrcLabel -[REL_TYPE]-> TgtLabel — and why>

TEMPLATE — follow this structure exactly (header first, then imports):

from services.handlers._shared import ENTITY_RESOLVERS, _insert_graph_relationship
from services.handlers import register_handler

def _ctx(data_map, sid_map, proc_map):
    return {
        'src': ENTITY_RESOLVERS['user'](data_map, 'SubjectUserName', 'SubjectUserSid', sid_map),
        'dst': ENTITY_RESOLVERS['computer'](data_map, None, None, {}),
    }

def _rule_name(tx, case_id, log, ctx):
    # optional early-return condition:
    # if 'some_guid' not in (log['data_map'].get('Properties') or '').lower(): return
    _insert_graph_relationship(tx, case_id, "User", ctx['src'], "Computer", ctx['dst'], "REL_TYPE", log['details'])

register_handler('XXXX', _ctx, [_rule_name])

SECURITY CONSTRAINTS — the generated code is validated by a strict AST whitelist before it is saved.
Violating any rule causes the handler to be rejected entirely.

ALLOWED imports (exactly these two lines, no others, no aliases):
  from services.handlers._shared import ENTITY_RESOLVERS, _insert_graph_relationship
  from services.handlers import register_handler

ALLOWED calls:
  - _insert_graph_relationship(...)
  - register_handler(...)
  - ENTITY_RESOLVERS['key'](...) where key is one of: user, process, computer, file, registry, service, task, group
  - Functions you define yourself in the file
  - Safe builtins: str, int, float, bool, bytes, list, dict, tuple, set, frozenset,
    len, range, enumerate, zip, map, filter, sorted, reversed, min, max, sum, abs,
    round, isinstance, hasattr, callable, any, all, repr, chr, ord, hex, bin, oct, print
  - Safe string/dict/list methods: lower, upper, strip, lstrip, rstrip, title,
    startswith, endswith, replace, split, rsplit, splitlines, join, format, encode,
    isdigit, isalpha, isalnum, isspace, count, find, rfind, index, get, keys, values,
    items, update, pop, setdefault, copy, clear, append, extend, insert, remove,
    sort, reverse, discard, add, and other standard data-structure methods

FORBIDDEN (will cause rejection):
  - Any import not listed above (import os, from subprocess import ..., etc.)
  - exec, eval, open, __import__, compile, getattr, setattr, delattr
  - globals, locals, vars, breakpoint, input
  - Any dunder attribute access (.__class__, .__dict__, .__subclasses__, etc.)
  - Calling any method not in the allowed list above
  - Top-level statements other than imports, def, and the single register_handler call
  - Aliases on imports (from services.handlers import register_handler as rh)

RULES:
- Output ONLY valid Python. No markdown, no code fences, no explanation.
- Use real Windows event field names based on your knowledge of the event.
- Multiple rule functions are allowed — pass them all in the list.
- Each rule handles exactly one relationship type.
- Conditions (e.g. GUID checks, value filters) belong inside the rule function as an early return.
"""


def translate_single_log(log_details):
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        return "API Key is missing."

    system_prompt = "INSTRUCTION: Briefly explain this Windows event log in one simple sentence in English. No technical jargon. CRITICAL: Do not suggest next steps."
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": f"Telemetry: {log_details}"}]}],
        "generationConfig": {"temperature": 0.2}
    }

    try:
        response = requests.post(url, json=payload, headers=headers)

        if response.status_code == 429:
            raise Exception("RATE_LIMIT")

        response.raise_for_status()
        response_data = response.json()

        return response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating translation.").strip()

    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during single log translation: {e}")
        raise

def generate_forensic_response(timeline_lines, chat_history, context_label='the investigation timeline'):
    """
    Generates an AI response based on the forensic timeline and user chat history.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Returning mock response.")
        return "**[MOCK AI RESPONSE]**\n\nNo API Key found. Please add GEMINI_API_KEY to your .env file."

    # Build the context from the database timeline
    context_story = "\n".join(timeline_lines)

    system_prompt = f"""You are 'ForensiFlow AI', an expert DFIR assistant.
Review the following event logs from {context_label}:

{context_story}

INSTRUCTIONS:
1. Base your answers ONLY on the logs provided for {context_label}.
2. If the user asks for a summary, provide a SINGLE, dense, concise paragraph. No bullet points.
3. For all other chat messages, answer naturally like a helpful forensic analyst discussing the case.
4. Focus on anomalies, lateral movement, and persistence.
5. When asked what you can do or how you can help, briefly list your practical capabilities too: summarizing investigations, explaining suspicious activity, spotting anomalies, tracing lateral movement and persistence, generating graph filters for searches, and managing event handlers by adding, removing, listing, or explaining them.
6. Keep the answer grounded in the provided logs and the current investigation context.

"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}
    
    # Format chat history for the Gemini API format
    contents = []
    for msg in chat_history:
        role = "model" if msg.get("role") == "ai" else "user"
        contents.append({
            "role": role,
            "parts": [{"text": msg.get("content", "")}]
        })
    
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.2}
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        response_data = response.json()
        ai_reply = response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating response.")
        usage = response_data.get("usageMetadata", {})
        logger.info(f"AI Token Usage - Input: {usage.get('promptTokenCount')}, Output: {usage.get('candidatesTokenCount')}, Total: {usage.get('totalTokenCount')}")
        
        return ai_reply.strip()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during AI generation: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during AI generation: {e}")
        raise


def generate_event_handler(event_id: str | None, description: str) -> str:
    """
    Generates Python handler code for a Windows event ID.
    If event_id is None the model picks the most appropriate event ID itself.
    Uses an isolated context — no timeline, no chat history.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    if event_id:
        prompt = f"Generate a handler for Windows Security Event ID {event_id}. {description}"
    else:
        prompt = (
            f"Task: {description}\n"
            "Choose the single most appropriate Windows Security Event ID for this detection, "
            "then generate the handler for it."
        )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    payload = {
        "systemInstruction": {"parts": [{"text": _HANDLER_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1},
    }

    response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
    response.raise_for_status()
    code = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return code.strip()


def generate_report_narrative(evidence_list):
    """
    Generates an executive summary and narrative report based on flagged (red) events.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Returning mock narrative.")
        return "**[MOCK NARRATIVE]**\n\nThe AI could not generate a narrative because the API key is missing."

    # 1. ממירים את רשימת המילונים (הראיות) לטקסט קריא עבור ה-AI
    evidence_text = ""
    for i, ev in enumerate(evidence_list, 1):
        evidence_text += f"Event {i}: [{ev.get('Timestamp', 'N/A')}] {ev.get('Source Entity', 'Unknown')} -> {ev.get('Action/Type', 'Unknown')} -> {ev.get('Target Entity', 'Unknown')} (Event ID: {ev.get('Event ID', 'N/A')})\n"

    # 2. מגדירים ל-AI בדיוק מה התפקיד שלו בדוח הזה
    system_prompt = """You are an elite DFIR analyst. 
Your task is to write an "Executive Summary & Chronological Narrative" based on the provided flagged logs.
1. Start with a short paragraph summarizing the suspected attack (e.g., Lateral Movement, Persistence).
2. Write a chronological story of what happened based on the events. 
3. Keep it professional, objective, and easy to read for management. Do not use Markdown formatting (like ** or #), just plain text with line breaks."""

    user_prompt = f"Here are the flagged events in chronological order:\n\n{evidence_text}\n\nPlease generate the narrative report."

    # 3. מכינים את הבקשה ל-Gemini API (בדיוק כמו בפונקציה השנייה שלך)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2}
    }
    
    # 4. שולחים את הבקשה ומחזירים את הטקסט
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        response_data = response.json()
        narrative = response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating narrative.")
        
        return narrative.strip()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during narrative generation: {e}")
        return "Error: Could not generate narrative due to API connection issue."
    except Exception as e:
        logger.error(f"Unexpected error during narrative generation: {e}")
        return "Error: An unexpected error occurred while generating the narrative."


def generate_log_translation(log_details):
    """
    Generates a simple, single-sentence translation of a raw log without graph context.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Returning mock translation.")
        return "Error: API Key missing."

    system_prompt = "You are an expert DFIR analyst. Explain this Windows event log telemetry in one simple sentence in English. No technical jargon. Do not suggest next steps. Just explain what happened."
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": f"Telemetry: {log_details}"}]}],
        "generationConfig": {"temperature": 0.1}
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        
        response_data = response.json()
        
        # Avoid logging response-derived usage fields to prevent sensitive-data exposure via taint flow
        usage = response_data.get("usageMetadata", {})
        logger.info("Translation request completed successfully.")
        
        translation = response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error").strip()
        return translation
        
    except Exception as e:
        logger.error(f"Log translation failed: {e}")
        return "Failed to translate log due to an error."