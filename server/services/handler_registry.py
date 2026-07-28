import ast
import importlib
import logging
import re
import sys
from pathlib import Path

from services.ai_agent import generate_event_handler
from services.handler_validator import validate_handler_ast
from services.handlers import EVENT_HANDLERS, deregister_handler

logger = logging.getLogger(__name__)

HANDLER_DIR = Path(__file__).parent / 'handlers' / 'ai_generated'

_REL_RE = re.compile(
    r'_insert_graph_relationship\([^,]+,\s*[^,]+,\s*"(\w+)",[^,]+,\s*"(\w+)",[^,]+,\s*"([A-Z_]+)"'
)

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


def get_available_relations() -> list:
    seen = set()
    relations = []

    for f in sorted(HANDLER_DIR.parent.glob('*.py')):
        if f.name in ('__init__.py', '_shared.py'):
            continue
        for _, _, rel_type in _REL_RE.findall(f.read_text()):
            if rel_type not in seen:
                seen.add(rel_type)
                relations.append(rel_type)

    HANDLER_DIR.mkdir(exist_ok=True)
    for f in sorted(HANDLER_DIR.glob('event_*_*.py')):
        for _, _, rel_type in _REL_RE.findall(f.read_text()):
            if rel_type not in seen:
                seen.add(rel_type)
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
