import importlib
import logging
import re
import sys

from flask import Blueprint, jsonify, request

from services.ai_agent import generate_event_handler
from services.handler_manager import HANDLER_DIR, validate_handler_ast
from services.handlers import EVENT_HANDLERS, _STATIC_HANDLERS

logger = logging.getLogger(__name__)


def create_blueprint():
    bp = Blueprint('handlers', __name__)

    @bp.route('/api/generate-handler', methods=['POST'])
    def generate_handler_route():
        data = request.json
        event_id = (data.get('event_id') or '').strip()
        description = (data.get('description') or '').strip()

        if not event_id or not event_id.isdigit():
            return jsonify({'error': 'A numeric event_id is required'}), 400

        if event_id in EVENT_HANDLERS:
            return jsonify({'error': f'Event ID {event_id} already exists in the system. No new handler was added.'}), 400

        try:
            code = generate_event_handler(event_id, description)
            code = re.sub(r'^```(?:python)?\s*\n?', '', code, flags=re.MULTILINE)
            code = re.sub(r'^```\s*$', '', code, flags=re.MULTILINE).strip()
            event_id = validate_handler_ast(code, event_id)

            if event_id in _STATIC_HANDLERS:
                return jsonify({'error': f'Event ID {event_id} already exists in the system. No new handler was added.'}), 400

            HANDLER_DIR.mkdir(exist_ok=True)
            (HANDLER_DIR / f'event_{event_id}.py').write_text(code)

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

    return bp
