import json
import os
import requests
import logging

logger = logging.getLogger(__name__)

_INTENT_SYSTEM_PROMPT = """You are an intent classifier for ForensiFlow, a Windows EVTX forensics tool.

Classify the user message into exactly one intent and respond with JSON only — no explanation, no markdown, no code fences.

Intents:
- "handler": user wants to add, create, or generate an event handler for any Windows security behaviour — even if they do not mention a specific Event ID
- "list_handlers": user wants to see all currently registered AI-generated handlers
- "remove_handler": user wants to delete or remove a specific AI-generated handler
- "handler_explain": user wants to understand why a handler was built the way it was — e.g. why a certain event ID or relationship type was chosen
- "forensic": user wants to analyze, investigate, summarize, or ask about the current case

For "handler" intent:
- Extract the Windows Event ID if the user stated one explicitly (4-5 digits); otherwise leave event_id as null and let the handler generator pick the right event.
- Write a full description of what the handler should detect.
- Choose a short snake_case name for the handler (2-4 words, lowercase, alphanumeric + underscores only, no leading/trailing underscores).

For "remove_handler" intent, extract the name or description the user gave to identify the handler.

Response format for handler with explicit event ID:
{"intent": "handler", "event_id": "4688", "description": "detect suspicious process creation", "name": "suspicious_process_creation"}

Response format for handler without explicit event ID:
{"intent": "handler", "event_id": null, "description": "detect process injection techniques", "name": "process_injection"}

Response format for list_handlers:
{"intent": "list_handlers"}

Response format for remove_handler:
{"intent": "remove_handler", "name": "dcsync"}

Response format for handler_explain:
{"intent": "handler_explain", "name": "password"}

Response format for forensic:
{"intent": "forensic"}"""


def classify_intent(message: str, handler_history: list | None = None) -> dict:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"

    # Include recent handler management turns so the classifier can resolve
    # references like "remove the last one" or "list them again".
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

def generate_forensic_response(timeline_lines, chat_history):
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
Review the following chronological event logs from the graph:

{context_story}

INSTRUCTIONS:
1. Base your answers ONLY on the logs provided.
2. If the user asks for a summary, provide a SINGLE, dense, concise paragraph. No bullet points.
3. For all other chat messages, answer naturally like a helpful forensic analyst discussing the case.
4. Focus on anomalies, lateral movement, and persistence.
5. ALWAYS end your response with a "🔍 Suggested Next Steps:" section, offering 1-2 concrete investigative actions the user can take within a graph database based on the current context.
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