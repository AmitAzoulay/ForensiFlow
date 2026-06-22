import ast
import importlib
import logging
import os
import re
import sys
import uuid
from pathlib import Path
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Neo4jClient
from services.ai_agent import (
    classify_intent, run_handler_agent, run_query_agent,
    generate_forensic_response, generate_report_narrative,
    generate_event_handler, translate_single_log, generate_log_translation
)
from services.handlers import deregister_handler
from services.evtx_parser import parse_and_store_evtx
import pandas as pd
import io
from flask import send_file

load_dotenv()

_REL_RE = re.compile(
    r'_insert_graph_relationship\([^,]+,\s*[^,]+,\s*"(\w+)",[^,]+,\s*"(\w+)",[^,]+,\s*"([A-Z_]+)"'
)

def _extract_reasoning(code: str) -> str:
    """Extract the leading # comment block from generated handler code."""
    lines = []
    for line in code.split('\n'):
        stripped = line.strip()
        if stripped.startswith('#'):
            lines.append(stripped[1:].strip())
        elif stripped == '' and lines:
            continue
        else:
            break
    return '\n'.join(lines).strip()


def _summarize_handler(code: str, event_id: str) -> str:
    matches = _REL_RE.findall(code)
    lines = [f"Handler for event {event_id} registered."]
    if matches:
        lines.append("Relationships that will be created:")
        for src_label, tgt_label, rel_type in matches:
            lines.append(f"  {src_label} —[{rel_type}]→ {tgt_label}")
    return "\n".join(lines)


_ALLOWED_FROM_IMPORTS = {
    'services.handlers._shared': {'ENTITY_RESOLVERS', '_insert_graph_relationship'},
    'services.handlers': {'register_handler'},
}

_SAFE_BUILTINS = frozenset([
    # type constructors
    'str', 'int', 'float', 'bool', 'bytes',
    'list', 'dict', 'tuple', 'set', 'frozenset',
    # iteration / sequence
    'len', 'range', 'enumerate', 'zip', 'map', 'filter',
    'sorted', 'reversed', 'min', 'max', 'sum', 'abs', 'round',
    # introspection
    'isinstance', 'hasattr', 'callable',
    # logic
    'any', 'all',
    # text
    'repr', 'chr', 'ord', 'hex', 'bin', 'oct',
    # output (useful for debugging handlers)
    'print',
])

_SAFE_ATTR_METHODS = frozenset([
    # str
    'lower', 'upper', 'strip', 'lstrip', 'rstrip', 'title', 'capitalize',
    'startswith', 'endswith', 'replace', 'split', 'rsplit', 'splitlines',
    'join', 'format', 'format_map', 'encode', 'decode',
    'isdigit', 'isalpha', 'isalnum', 'isspace', 'isupper', 'islower',
    'count', 'find', 'rfind', 'index', 'rindex', 'zfill', 'center',
    'ljust', 'rjust', 'expandtabs', 'partition', 'rpartition',
    # dict
    'get', 'keys', 'values', 'items', 'update', 'pop', 'setdefault',
    'copy', 'clear', 'popitem',
    # list / set
    'append', 'extend', 'insert', 'remove', 'sort', 'reverse',
    'index', 'discard', 'add', 'union', 'intersection', 'difference',
    # general
    'strip',
])

_KNOWN_RESOLVERS = frozenset([
    'user', 'process', 'computer', 'file', 'registry', 'service', 'task', 'group',
])

def _validate_handler_ast(code: str, event_id: str | None) -> str:
    """
    Whitelist-based AST validator. Raises ValueError if the code does anything
    beyond registering a single handler using the approved API.

    Allowed at module level:
      - from services.handlers._shared import ENTITY_RESOLVERS, _insert_graph_relationship
      - from services.handlers import register_handler
      - function definitions (def)
      - exactly one register_handler(...) call

    Allowed calls anywhere in the tree:
      - _insert_graph_relationship(...)
      - register_handler(...)
      - functions defined within the file itself
      - ENTITY_RESOLVERS['key'](...)   (subscript call)
      - .get() .lower() .strip() etc.  (safe string/dict methods)

    Everything else — bare imports, exec, eval, open, dunder access, arbitrary
    attribute methods — is rejected before the file is written to disk.
    """
    tree = ast.parse(code)  # raises SyntaxError if invalid

    defined_funcs = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
    allowed_call_names = {'_insert_graph_relationship', 'register_handler'} | defined_funcs | _SAFE_BUILTINS

    register_calls = []

    # 1. Module-level structure
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            module = node.module or ''
            allowed_names = _ALLOWED_FROM_IMPORTS.get(module)
            if allowed_names is None:
                raise ValueError(f"Import from disallowed module: '{module}'")
            for alias in node.names:
                if alias.name not in allowed_names:
                    raise ValueError(f"Disallowed name '{alias.name}' imported from '{module}'")
                if alias.asname is not None:
                    raise ValueError(f"Import aliases not allowed: '{alias.name} as {alias.asname}'")

        elif isinstance(node, ast.Import):
            raise ValueError("'import' statements are not allowed")

        elif isinstance(node, ast.FunctionDef):
            pass  # internals checked via ast.walk below

        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            func = node.value.func
            if isinstance(func, ast.Name) and func.id == 'register_handler':
                register_calls.append(node.value)
            else:
                name = func.id if isinstance(func, ast.Name) else ast.dump(func)
                raise ValueError(f"Unexpected top-level call: '{name}'")

        else:
            raise ValueError(f"Disallowed statement at module level: {type(node).__name__}")

    # 2. Exactly one register_handler call
    if len(register_calls) != 1:
        raise ValueError(f"Expected exactly one register_handler() call, got {len(register_calls)}")

    # 3. First arg must be a 4-5 digit string literal; if event_id was specified it must match
    call = register_calls[0]
    if not call.args or not isinstance(call.args[0], ast.Constant):
        raise ValueError("register_handler first argument must be a string literal event ID")
    detected_id = str(call.args[0].value)
    if not detected_id.isdigit() or not (4 <= len(detected_id) <= 5):
        raise ValueError(f"register_handler event ID must be 4-5 digits, got '{detected_id}'")
    if event_id and detected_id != event_id:
        raise ValueError(f"register_handler first argument must be '{event_id}', got '{detected_id}'")

    # 4. Walk every node: whitelist calls, block dunder attribute access
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                if func.id not in allowed_call_names:
                    raise ValueError(f"Call to disallowed name: '{func.id}'")
            elif isinstance(func, ast.Subscript):
                if not (isinstance(func.value, ast.Name) and func.value.id == 'ENTITY_RESOLVERS'):
                    raise ValueError("Subscript calls only allowed on ENTITY_RESOLVERS")
                key = func.slice
                if not isinstance(key, ast.Constant) or key.value not in _KNOWN_RESOLVERS:
                    bad = key.value if isinstance(key, ast.Constant) else ast.dump(key)
                    raise ValueError(
                        f"Unknown resolver '{bad}'. "
                        f"Available: {', '.join(sorted(_KNOWN_RESOLVERS))}"
                    )
            elif isinstance(func, ast.Attribute):
                if func.attr not in _SAFE_ATTR_METHODS:
                    raise ValueError(f"Method call not allowed: '.{func.attr}()'")
            else:
                raise ValueError(f"Disallowed call expression: {ast.dump(func)}")

        if isinstance(node, ast.Attribute):
            if node.attr.startswith('__') and node.attr.endswith('__'):
                raise ValueError(f"Dunder attribute access not allowed: '.{node.attr}'")

    return detected_id

logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

db_client = Neo4jClient(
    uri=os.getenv("NEO4J_URI"),
    user=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD"),
    trust_all=os.getenv("NEO4J_TRUST_ALL_CERTS", "false").strip().lower() in {"1", "true", "yes", "on"},
    database=os.getenv("NEO4J_DATABASE") or None,
)

@app.route('/api/investigations', methods=['GET'])
def get_investigations():
    try:
        investigations = db_client.get_all_investigations()
        return jsonify(investigations), 200
    except Exception as e:
        return jsonify({"error": "Failed to fetch investigations"}), 500

@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():
    case_id = request.args.get('case_id')
    if not case_id:
        return jsonify({"error": "Missing case_id parameter"}), 400
    
    try:
        graph_data = db_client.get_case_graph(case_id)
        return jsonify(graph_data), 200
    except Exception as e:
        return jsonify({"error": "Failed to fetch graph data"}), 500

@app.route('/api/parse-evtx', methods=['POST'])
def upload_and_parse_evtx():
    if 'evtxFile' not in request.files: 
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['evtxFile']
    inv_name = request.form.get('invName', 'Investigation') 
    
    if file.filename == '': 
        return jsonify({"error": "No selected file"}), 400

    if file:
        safe_inv_name = "".join([c for c in inv_name if c.isalnum() or c in ('_', '-')]).rstrip()
        if not safe_inv_name: 
            safe_inv_name = "Inv"

        case_id = str(uuid.uuid4())
        new_filename = f"{safe_inv_name}_{case_id}.evtx"
        filepath = os.path.join(UPLOAD_FOLDER, new_filename)
        file.save(filepath)
        
        try:
            parse_and_store_evtx(filepath, case_id, inv_name, db_client)
            return jsonify({
                "status": "success", 
                "filename": new_filename, 
                "case_id": case_id
            }), 200
        except Exception as e:
            logger.error(f"Parsing failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500
        
@app.route('/api/translate-log', methods=['POST'])
def process_log_translation():
    data = request.json
    log_details = data.get('log_details')

    if not log_details:
        return jsonify({"error": "Missing log details"}), 400

    try:
        translation = translate_single_log(log_details)
        return jsonify({"reply": translation}), 200
    except Exception as e:
        if str(e) == "RATE_LIMIT":
            return jsonify({"reply": "AI rate limit reached. Please wait a minute."}), 429
        logger.error(f"Translation error: {e}")
        return jsonify({"error": "Failed to translate log"}), 500

@app.route('/api/ai-chat', methods=['POST'])
def process_ai_chat():
    data = request.json
    case_id = data.get('case_id')
    chat_history = data.get('history', [])

    if not case_id or not chat_history:
        return jsonify({"error": "Missing case_id or chat history"}), 400

    try:
        timeline = db_client.get_investigation_timeline(case_id)
        if not timeline:
             return jsonify({"reply": "No data in the current graph to analyze. Load an EVTX file first."})
             
        if len(chat_history) > 20:
            chat_history = chat_history[-20:]

        compressed_timeline = []
        for item in timeline:
            if not isinstance(item, dict):
                compressed_timeline.append(str(item).replace('\n', ' '))
                continue
            
            flat_item = {}
            def flatten(d, prefix=''):
                for k, v in d.items():
                    new_key = f"{prefix}{k}" if prefix else k
                    if isinstance(v, dict):
                        flatten(v, f"{new_key}_")
                    else:
                        flat_item[new_key] = v
            
            flatten(item)
            
            parts = []
            for k, v in flat_item.items():
                if "id" not in k.lower() and "label" not in k.lower() and v not in [None, "", [], {}]:
                    parts.append(f"{k}: {v}")
            
            compressed_timeline.append(" | ".join(parts))

        logger.info(f"Sending request to AI with {len(compressed_timeline)} log lines and {len(chat_history)} chat messages.")

        ai_reply = generate_forensic_response(compressed_timeline, chat_history)
        return jsonify({"reply": ai_reply}), 200
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            return jsonify({"reply": "AI is overloaded right now. Please wait 60 seconds."}), 429
        return jsonify({"error": "Failed to process AI request"}), 500
    except Exception as e:
        if "429" in str(e) or "RATE_LIMIT" in str(e):
            return jsonify({"reply": "AI rate limit reached. Please wait 60 seconds."}), 429
        logger.error(f"AI Chat processing error: {e}")
        if "429" in str(e) or "RATE_LIMIT" in str(e) or "quota" in str(e).lower():
             return jsonify({"reply": "AI quota has been reached. Please wait a minute and try again."}), 429
        return jsonify({"error": "Failed to process AI request"}), 500


def _exec_add_handler(event_id: str | None, description: str, name: str) -> dict:
    event_id = str(event_id or '').strip() or None
    if event_id and not event_id.isdigit():
        event_id = None
    safe_name = re.sub(r'[^a-z0-9_]', '', str(name or '').lower().replace('-', '_').replace(' ', '_'))
    safe_name = re.sub(r'_+', '_', safe_name).strip('_')
    try:
        code = generate_event_handler(event_id, description)
        code = re.sub(r'^```(?:python)?\s*\n?', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*$', '', code, flags=re.MULTILINE).strip()
        try:
            ast.parse(code)
        except SyntaxError:
            if 'register_handler' not in code and 'def ' not in code:
                return {"status": "error", "message": code}
            raise
        detected_id = _validate_handler_ast(code, event_id)
        if not safe_name:
            safe_name = f'handler_{detected_id}'
        file_stem = f'event_{detected_id}_{safe_name}'
        handler_dir = Path(__file__).parent / 'services' / 'handlers' / 'ai_generated'
        handler_dir.mkdir(exist_ok=True)
        (handler_dir / f'{file_stem}.py').write_text(code)
        module_name = f'services.handlers.ai_generated.{file_stem}'
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])
        else:
            importlib.import_module(module_name)
        summary = _summarize_handler(code, detected_id)
        reasoning = _extract_reasoning(code)
        return {"status": "ok", "event_id": detected_id, "stem": file_stem, "summary": summary, "reasoning": reasoning}
    except (SyntaxError, ValueError) as e:
        logger.error(f"Handler validation failed: {e}")
        return {"status": "error", "message": f"Validation failed: {e}"}
    except Exception as e:
        logger.error(f"Handler generation failed: {e}")
        return {"status": "error", "message": str(e)}


def _exec_remove_handler(name_query: str) -> dict:
    name_query = (name_query or '').lower().strip()
    handler_dir = Path(__file__).parent / 'services' / 'handlers' / 'ai_generated'
    files = sorted(handler_dir.glob('event_*_*.py'))
    if not name_query:
        return {"status": "error", "message": "Please specify which handler to remove."}
    matches = [f for f in files if name_query in f.stem.lower()]
    if not matches:
        return {"status": "error", "message": f"No handler found matching '{name_query}'."}
    if len(matches) > 1:
        names = ", ".join(f.stem for f in matches)
        return {"status": "error", "message": f"Multiple matches: {names}. Be more specific."}
    target = matches[0]
    module_name = f'services.handlers.ai_generated.{target.stem}'
    deregister_handler(module_name)
    if module_name in sys.modules:
        del sys.modules[module_name]
    target.unlink()
    logger.info(f"Removed handler: {target.stem}")
    return {"status": "ok", "message": f"Handler '{target.stem}' removed."}


def _exec_list_handlers() -> dict:
    handler_dir = Path(__file__).parent / 'services' / 'handlers' / 'ai_generated'
    files = sorted(handler_dir.glob('event_*_*.py'))
    if not files:
        return {"status": "ok", "message": "No AI-generated handlers are currently registered."}
    lines = ["Registered AI-generated handlers:"]
    for f in files:
        parts = f.stem.split('_', 2)
        event_id_part = parts[1] if len(parts) > 1 else '?'
        name_part = parts[2].replace('_', ' ') if len(parts) > 2 else f.stem
        lines.append(f"  • Event {event_id_part}: {name_part}  [{f.stem}]")
    return {"status": "ok", "message": "\n".join(lines)}


def _exec_explain_handler(name_query: str) -> dict:
    name_query = (name_query or '').lower().strip()
    handler_dir = Path(__file__).parent / 'services' / 'handlers' / 'ai_generated'
    files = sorted(handler_dir.glob('event_*_*.py'))
    if not name_query:
        return {"status": "error", "message": "Which handler would you like explained?"}
    matches = [f for f in files if name_query in f.stem.lower()]
    if not matches:
        return {"status": "error", "message": f"No handler found matching '{name_query}'."}
    if len(matches) > 1:
        names = ", ".join(f.stem for f in matches)
        return {"status": "error", "message": f"Multiple matches: {names}. Be more specific."}
    code = matches[0].read_text()
    reasoning = _extract_reasoning(code)
    if not reasoning:
        return {"status": "error", "message": f"No reasoning comment in '{matches[0].stem}'."}
    return {"status": "ok", "message": reasoning}


_BUILTIN_RELATIONS = [
    "ADDED_TO_GROUP", "AUDIT_LOG_CLEARED", "EXPLICIT_CREDS_USED",
    "FAILED_LOGON", "LOGGED_IN", "MODIFIED_GROUP", "NETWORK_CONNECTION",
    "OBJECT_ACCESSED_APPEND", "OBJECT_ACCESSED_DELETE", "OBJECT_ACCESSED_EXECUTE",
    "OBJECT_ACCESSED_READ", "OBJECT_ACCESSED_WRITE", "PRIV_LOGON",
    "PROCESS_CREATED", "REMOTE_ACCESS", "REQUESTED_HANDLE",
    "SERVICE_INSTALLED", "TASK_CREATED", "TICKET_REQUESTED",
    "TOKEN_ASSIGNED", "USED_IP_FOR_TICKET", "USER_CREATED", "USER_DELETED",
]


def _get_available_relations() -> list:
    relations = list(_BUILTIN_RELATIONS)
    handler_dir = Path(__file__).parent / 'services' / 'handlers' / 'ai_generated'
    for f in sorted(handler_dir.glob('event_*_*.py')):
        for _, _, rel_type in _REL_RE.findall(f.read_text()):
            if rel_type not in relations:
                relations.append(rel_type)
    return relations


def _tool_executor(name: str, args: dict) -> dict:
    if name == "add_handler":
        return _exec_add_handler(args.get("event_id"), args.get("description", ""), args.get("name", ""))
    if name == "remove_handler":
        return _exec_remove_handler(args.get("name", ""))
    if name == "list_handlers":
        return _exec_list_handlers()
    if name == "explain_handler":
        return _exec_explain_handler(args.get("name", ""))
    return {"status": "error", "message": f"Unknown tool: {name}"}


@app.route('/api/chat', methods=['POST'])
def unified_chat():
    data = request.json
    case_id = data.get('case_id')
    history = data.get('history', [])
    handler_history = data.get('handler_history', [])

    if not history and not handler_history:
        return jsonify({"error": "No message provided"}), 400

    last_message = (handler_history or history)[-1].get('content', '')

    try:
        intent_data = classify_intent(last_message, handler_history)
    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        intent_data = {"intent": "forensic"}

    intent = intent_data.get('intent', 'forensic')

    if intent == 'handler_agent':
        try:
            result = run_handler_agent(last_message, handler_history, _tool_executor)
            return jsonify({
                "intent": "handler_agent",
                "summary": result["summary"],
                "needs_reparse": result["needs_reparse"],
                "results": result["results"],
            }), 200
        except Exception as e:
            logger.error(f"Handler agent failed: {e}")
            return jsonify({
                "intent": "handler_agent",
                "summary": f"Error: {e}",
                "needs_reparse": False,
                "results": [],
            }), 200

    elif intent == 'query_agent':
        try:
            relations = _get_available_relations()
            result = run_query_agent(last_message, handler_history, relations)
            return jsonify({
                "intent": "query_agent",
                "query": result["query"],
                "label": result["label"],
            }), 200
        except Exception as e:
            logger.error(f"Query agent failed: {e}")
            return jsonify({"intent": "query_agent", "query": "", "label": ""}), 200

    else:  # forensic
        if not case_id:
            return jsonify({"intent": "forensic", "reply": "Load a case first to analyze the investigation."}), 200
        try:
            timeline = db_client.get_investigation_timeline(case_id)
            if not timeline:
                return jsonify({"intent": "forensic", "reply": "No data in the current graph to analyze. Load an EVTX file first."})
            reply = generate_forensic_response(timeline, history)
            return jsonify({"intent": "forensic", "reply": reply}), 200
        except Exception as e:
            logger.error(f"Forensic chat failed: {e}")
            return jsonify({"error": "Failed to process AI request"}), 500


@app.route('/api/investigations/<case_id>', methods=['DELETE'])
def delete_investigation(case_id):
    try:
        db_client.delete_investigation(case_id)
        return jsonify({"status": "success", "message": "Investigation deleted successfully"}), 200
    except Exception as e:
        logger.error(f"Failed to delete investigation: {e}")
        return jsonify({"error": "Failed to delete investigation"}), 500

@app.route('/api/save-edited', methods=['POST'])
def save_edited_investigation():
    data = request.json
    original_case_id = data.get('old_case_id')
    new_name = data.get('new_name')
    nodes = data.get('nodes')
    links = data.get('links')
    
    new_case_id = str(uuid.uuid4())
    
    try:
        db_client.save_edited_graph(original_case_id, new_case_id, new_name, nodes, links)
        return jsonify({"status": "success", "case_id": new_case_id}), 200
    except Exception as e:
        logger.error(f"Save edited failed: {e}")
        return jsonify({"error": "Failed to save edited investigation"}), 500
    
@app.route('/api/generate-handler', methods=['POST'])
def generate_handler_route():
    data = request.json
    event_id = (data.get('event_id') or '').strip()
    description = (data.get('description') or '').strip()

    if not event_id or not event_id.isdigit():
        return jsonify({'error': 'A numeric event_id is required'}), 400

    try:
        code = generate_event_handler(event_id, description)

        code = re.sub(r'^```(?:python)?\s*\n?', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*$', '', code, flags=re.MULTILINE).strip()
        event_id = _validate_handler_ast(code, event_id)

        handler_dir = Path(__file__).parent / 'services' / 'handlers' / 'ai_generated'
        handler_dir.mkdir(exist_ok=True)
        (handler_dir / f'event_{event_id}.py').write_text(code)

        module_name = f'services.handlers.ai_generated.event_{event_id}'
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])
        else:
            importlib.import_module(module_name)

        return jsonify({'code': code, 'event_id': event_id}), 200

    except (SyntaxError, ValueError) as e:
        logger.error(f"Handler validation failed: {e}")
        return jsonify({'error': f'Handler validation failed: {e}'}), 500
    except Exception as e:
        logger.error(f"Handler generation failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/reparse/<case_id>', methods=['POST'])
def reparse_case(case_id):
    try:
        matches = list(Path(UPLOAD_FOLDER).glob(f"*_{case_id}.evtx"))
        if not matches:
            return jsonify({'error': 'Original EVTX file not found for this case'}), 404
        filepath = str(matches[0])

        case_name = db_client.get_investigation_name(case_id)
        db_client.delete_investigation(case_id)
        parse_and_store_evtx(filepath, case_id, case_name, db_client)

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        logger.error(f"Reparse failed for case {case_id}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-forensic-report', methods=['POST'])
def generate_forensic_report():
    try:
        data = request.json
        red_nodes = data.get('nodes', [])
        red_links = data.get('links', [])

        node_map = {}
        for n in red_nodes:
            node_id = n.get('id')
            props = n.get('properties', {})
            name = props.get('name') or n.get('name') or node_id
            node_map[node_id] = name

        # 2. הכנת רשימת הראיות בצורה קריאה
        evidence_list = []
        for l in red_links:
            # משיכת השמות של המקור והיעד
            src_id = l['source']['id'] if isinstance(l.get('source'), dict) else l.get('source')
            tgt_id = l['target']['id'] if isinstance(l.get('target'), dict) else l.get('target')
            
            src_name = node_map.get(src_id, str(src_id))
            tgt_name = node_map.get(tgt_id, str(tgt_id))
            
            details = l.get('details', {})
            event_id = details.get('event_id') or details.get('EventID') or l.get('type')
            
            # חיפוש זמן האירוע
            timestamp = details.get('timestamp') or details.get('System', {}).get('TimeCreated', {}).get('SystemTime') or "Unknown Time"

            evidence_list.append({
                "Timestamp": timestamp,
                "Source Entity": src_name,
                "Action/Type": l.get('type'),
                "Target Entity": tgt_name,
                "Event ID": event_id
            })

        # מיון לפי זמן כדי שהסיפור יהיה כרונולוגי
        evidence_list.sort(key=lambda x: str(x['Timestamp']))

        # 3. הפקת הסיפור בעזרת ה-AI שלנו
        ai_narrative = generate_report_narrative(evidence_list)

        # 4. בניית קובץ האקסל בזיכרון עם העיצוב המקצועי
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            workbook = writer.book
            
            # --- עיצובים (Styles) ---
            title_format = workbook.add_format({'bold': True, 'font_size': 16, 'font_color': '#ffffff', 'bg_color': '#1e293b', 'align': 'left', 'valign': 'vcenter', 'indent': 1})
            header_format = workbook.add_format({'bold': True, 'font_size': 12, 'font_color': '#ef4444', 'bottom': 1})
            text_format = workbook.add_format({'text_wrap': True, 'valign': 'top', 'font_size': 11})
            meta_format = workbook.add_format({'bold': True, 'font_color': '#64748b', 'font_size': 10})

            # --- טאב 1: סיכום מנהלים ונרטיב (בנייה ידנית למראה מסמך) ---
            worksheet_summary = workbook.add_worksheet('Executive Summary')
            worksheet_summary.set_column('A:A', 120) # עמודה רחבה מאוד
            worksheet_summary.hide_gridlines(2) # העלמת קווי הרשת של האקסל למראה נקי

            # כותרת ראשית
            worksheet_summary.write('A1', 'ForensiFlow - Automated Incident Report', title_format)
            worksheet_summary.set_row(0, 30) # גובה שורת הכותרת

            # מטא-דאטה (זמן הפקה וכמות ממצאים)
            import datetime
            generation_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            worksheet_summary.write('A2', f"Generated on: {generation_time} | Flagged Events: {len(evidence_list)}", meta_format)
            worksheet_summary.set_row(1, 20)

            # פיצול וכתיבת הנרטיב
            parts = ai_narrative.split('\n\n')
            current_row = 4
            for part in parts:
                if "Executive Summary" in part or "Chronological Narrative" in part:
                    worksheet_summary.write(current_row, 0, part.strip(), header_format)
                else:
                    worksheet_summary.write(current_row, 0, part.strip(), text_format)
                    estimated_height = (len(part) / 100) * 15
                    worksheet_summary.set_row(current_row, max(30, estimated_height))
                current_row += 2
                
            # --- טאב 2: הראיות הגולמיות ---
            if evidence_list:
                evidence_df = pd.DataFrame(evidence_list)
                evidence_df.to_excel(writer, sheet_name='Raw Evidence', index=False)
                worksheet_ev = writer.sheets['Raw Evidence']
                
                table_header_format = workbook.add_format({'bold': True, 'bg_color': '#334155', 'font_color': 'white'})
                for col_num, value in enumerate(evidence_df.columns.values):
                    worksheet_ev.write(0, col_num, value, table_header_format)
                
                worksheet_ev.set_column('A:A', 25) 
                worksheet_ev.set_column('B:D', 35) 
                worksheet_ev.set_column('E:E', 15) 
                worksheet_ev.autofilter(0, 0, len(evidence_list), len(evidence_df.columns) - 1)

        # --- השורות שהיו חסרות! שולחים את הקובץ ל-React ---
        output.seek(0)
        return send_file(
            output, 
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True, 
            download_name="ForensiFlow_Incident_Report.xlsx"
        )

    except Exception as e:
        print(f"Error generating report: {e}")
        return {"error": str(e)}, 500
    
@app.route('/api/translate-log', methods=['POST'])
def translate_log():
    data = request.json
    log_details = data.get('details')
    
    if not log_details:
        return jsonify({"error": "Missing log details"}), 400

    try:
        # שליחה רק של פרטי הלוג הספציפי ללא ההיסטוריה
        translation = generate_log_translation(str(log_details))
        return jsonify({"reply": translation}), 200
    except Exception as e:
        logger.error(f"Translation route error: {e}")
        return jsonify({"error": "Failed to translate log"}), 500

if __name__ == '__main__':
    logger.info("ForensiFlow API Server starting on port 8000...")
    app.run(debug=True, port=8000, exclude_patterns=['*/ai_generated/*'])

