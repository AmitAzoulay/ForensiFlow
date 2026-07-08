import ast
import importlib
import logging
import re
import sys
from pathlib import Path

from services.ai_agent import generate_event_handler
from services.handlers import deregister_handler, EVENT_HANDLERS

logger = logging.getLogger(__name__)

HANDLER_DIR = Path(__file__).parent / 'handlers' / 'ai_generated'

_REL_RE = re.compile(
    r'_insert_graph_relationship\([^,]+,\s*[^,]+,\s*"(\w+)",[^,]+,\s*"(\w+)",[^,]+,\s*"([A-Z_]+)"'
)

_ALLOWED_FROM_IMPORTS = {
    'services.handlers._shared': {'ENTITY_RESOLVERS', '_insert_graph_relationship'},
    'services.handlers': {'register_handler'},
}

_SAFE_BUILTINS = frozenset([
    'str', 'int', 'float', 'bool', 'bytes',
    'list', 'dict', 'tuple', 'set', 'frozenset',
    'len', 'range', 'enumerate', 'zip', 'map', 'filter',
    'sorted', 'reversed', 'min', 'max', 'sum', 'abs', 'round',
    'isinstance', 'hasattr', 'callable',
    'any', 'all',
    'repr', 'chr', 'ord', 'hex', 'bin', 'oct',
    'print',
])

_SAFE_ATTR_METHODS = frozenset([
    'lower', 'upper', 'strip', 'lstrip', 'rstrip', 'title', 'capitalize',
    'startswith', 'endswith', 'replace', 'split', 'rsplit', 'splitlines',
    'join', 'format', 'format_map', 'encode', 'decode',
    'isdigit', 'isalpha', 'isalnum', 'isspace', 'isupper', 'islower',
    'count', 'find', 'rfind', 'index', 'rindex', 'zfill', 'center',
    'ljust', 'rjust', 'expandtabs', 'partition', 'rpartition',
    'get', 'keys', 'values', 'items', 'update', 'pop', 'setdefault',
    'copy', 'clear', 'popitem',
    'append', 'extend', 'insert', 'remove', 'sort', 'reverse',
    'discard', 'add', 'union', 'intersection', 'difference',
])

_KNOWN_RESOLVERS = frozenset([
    'user', 'process', 'computer', 'file', 'registry', 'service', 'task', 'group',
])

_BUILTIN_RELATIONS = [
    "ADDED_TO_GROUP", "AUDIT_LOG_CLEARED", "EXPLICIT_CREDS_USED",
    "FAILED_LOGON", "LOGGED_IN", "MODIFIED_GROUP", "NETWORK_CONNECTION",
    "OBJECT_ACCESSED_APPEND", "OBJECT_ACCESSED_DELETE", "OBJECT_ACCESSED_EXECUTE",
    "OBJECT_ACCESSED_READ", "OBJECT_ACCESSED_WRITE", "PRIV_LOGON",
    "PROCESS_CREATED", "REMOTE_ACCESS", "REQUESTED_HANDLE",
    "SERVICE_INSTALLED", "TASK_CREATED", "TICKET_REQUESTED",
    "TOKEN_ASSIGNED", "USED_IP_FOR_TICKET", "USER_CREATED", "USER_DELETED",
]


def extract_reasoning(code: str) -> str:
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


def summarize_handler(code: str, event_id: str) -> str:
    matches = _REL_RE.findall(code)
    lines = [f"Handler for event {event_id} registered."]
    if matches:
        lines.append("Relationships that will be created:")
        for src_label, tgt_label, rel_type in matches:
            lines.append(f"  {src_label} —[{rel_type}]→ {tgt_label}")
    return "\n".join(lines)


def validate_handler_ast(code: str, event_id: str | None) -> str:
    tree = ast.parse(code)

    defined_funcs = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
    allowed_call_names = {'_insert_graph_relationship', 'register_handler'} | defined_funcs | _SAFE_BUILTINS

    register_calls = []

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
            pass

        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            func = node.value.func
            if isinstance(func, ast.Name) and func.id == 'register_handler':
                register_calls.append(node.value)
            else:
                name = func.id if isinstance(func, ast.Name) else ast.dump(func)
                raise ValueError(f"Unexpected top-level call: '{name}'")

        else:
            raise ValueError(f"Disallowed statement at module level: {type(node).__name__}")

    if len(register_calls) != 1:
        raise ValueError(f"Expected exactly one register_handler() call, got {len(register_calls)}")

    call = register_calls[0]
    if not call.args or not isinstance(call.args[0], ast.Constant):
        raise ValueError("register_handler first argument must be a string literal event ID")
    detected_id = str(call.args[0].value)
    if not detected_id.isdigit() or not (4 <= len(detected_id) <= 5):
        raise ValueError(f"register_handler event ID must be 4-5 digits, got '{detected_id}'")
    if event_id and detected_id != event_id:
        raise ValueError(f"register_handler first argument must be '{event_id}', got '{detected_id}'")

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


def get_available_relations() -> list:
    relations = list(_BUILTIN_RELATIONS)
    HANDLER_DIR.mkdir(exist_ok=True)
    for f in sorted(HANDLER_DIR.glob('event_*_*.py')):
        for _, _, rel_type in _REL_RE.findall(f.read_text()):
            if rel_type not in relations:
                relations.append(rel_type)
    return relations


def exec_add_handler(event_id: str | None, description: str, name: str) -> dict:
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
        detected_id = validate_handler_ast(code, event_id)
        if detected_id in EVENT_HANDLERS:
            return {"status": "error", "message": f"Event ID {detected_id} already exists in the system. No new handler was added."}
        if not safe_name:
            safe_name = f'handler_{detected_id}'
        file_stem = f'event_{detected_id}_{safe_name}'
        HANDLER_DIR.mkdir(exist_ok=True)
        (HANDLER_DIR / f'{file_stem}.py').write_text(code)
        module_name = f'services.handlers.ai_generated.{file_stem}'
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])
        else:
            importlib.import_module(module_name)
        summary = summarize_handler(code, detected_id)
        reasoning = extract_reasoning(code)
        return {"status": "ok", "event_id": detected_id, "stem": file_stem, "summary": summary, "reasoning": reasoning}
    except (SyntaxError, ValueError) as e:
        logger.error(f"Handler validation failed: {e}")
        return {"status": "error", "message": f"Validation failed: {e}"}
    except Exception as e:
        logger.error(f"Handler generation failed: {e}")
        return {"status": "error", "message": str(e)}


def exec_remove_handler(name_query: str) -> dict:
    name_query = (name_query or '').lower().strip()
    files = sorted(HANDLER_DIR.glob('event_*_*.py'))
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


def exec_list_handlers() -> dict:
    files = sorted(HANDLER_DIR.glob('event_*_*.py'))
    if not files:
        return {"status": "ok", "message": "No AI-generated handlers are currently registered."}
    lines = ["Registered AI-generated handlers:"]
    for f in files:
        parts = f.stem.split('_', 2)
        event_id_part = parts[1] if len(parts) > 1 else '?'
        name_part = parts[2].replace('_', ' ') if len(parts) > 2 else f.stem
        lines.append(f"  • Event {event_id_part}: {name_part}  [{f.stem}]")
    return {"status": "ok", "message": "\n".join(lines)}


def exec_explain_handler(name_query: str) -> dict:
    name_query = (name_query or '').lower().strip()
    files = sorted(HANDLER_DIR.glob('event_*_*.py'))
    if not name_query:
        return {"status": "error", "message": "Which handler would you like explained?"}
    matches = [f for f in files if name_query in f.stem.lower()]
    if not matches:
        return {"status": "error", "message": f"No handler found matching '{name_query}'."}
    if len(matches) > 1:
        names = ", ".join(f.stem for f in matches)
        return {"status": "error", "message": f"Multiple matches: {names}. Be more specific."}
    code = matches[0].read_text()
    reasoning = extract_reasoning(code)
    if not reasoning:
        return {"status": "error", "message": f"No reasoning comment in '{matches[0].stem}'."}
    return {"status": "ok", "message": reasoning}


def tool_executor(name: str, args: dict) -> dict:
    if name == "add_handler":
        return exec_add_handler(args.get("event_id"), args.get("description", ""), args.get("name", ""))
    if name == "remove_handler":
        return exec_remove_handler(args.get("name", ""))
    if name == "list_handlers":
        return exec_list_handlers()
    if name == "explain_handler":
        return exec_explain_handler(args.get("name", ""))
    return {"status": "error", "message": f"Unknown tool: {name}"}
