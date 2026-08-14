import json
import logging

from flask import Blueprint, Response, jsonify, request, stream_with_context

from services.ai_agent import (
    classify_intent,
    generate_forensic_response,
    run_handler_agent,
    run_query_agent,
)
from services.handler_registry import get_available_relations, tool_executor

logger = logging.getLogger(__name__)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _stream_handler_agent(message: str, handler_history: list):
    try:
        yield _sse({'type': 'step', 'content': 'Processing handler commands...'})
        result = run_handler_agent(message, handler_history, tool_executor)
        yield _sse({
            'type': 'response',
            'intent': 'handler_agent',
            'summary': result['summary'],
            'needs_reparse': result['needs_reparse'],
            'results': result['results'],
        })
    except Exception as e:
        logger.error(f"Handler agent failed: {e}")
        yield _sse({'type': 'response', 'intent': 'handler_agent', 'summary': f'Error: {e}', 'needs_reparse': False, 'results': []})


def _stream_query_agent(message: str, handler_history: list):
    try:
        yield _sse({'type': 'step', 'content': 'Analyzing your request...'})
        yield _sse({'type': 'step', 'content': 'Generating graph filter...'})
        result = run_query_agent(message, handler_history, get_available_relations())
        yield _sse({'type': 'response', 'intent': 'query_agent', 'query': result['query'], 'label': result['label']})
    except Exception as e:
        logger.error(f"Query agent failed: {e}")
        yield _sse({'type': 'response', 'intent': 'query_agent', 'query': '', 'label': '', 'error': str(e)})


def _stream_forensic(message: str, history: list, case_id: str | None, view_context: str, db_client):
    if not case_id:
        yield _sse({'type': 'response', 'intent': 'forensic', 'reply': 'Load a case first to analyze the investigation.'})
        return
    try:
        use_current_view = bool(view_context)
        context_label = 'the current graph view' if use_current_view else 'the investigation timeline'

        if not use_current_view:
            yield _sse({'type': 'step', 'content': 'Retrieving investigation timeline...'})
            timeline = db_client.get_investigation_timeline(case_id)
            if not timeline:
                yield _sse({'type': 'response', 'intent': 'forensic', 'reply': 'No data in the current graph to analyze. Load an EVTX file first.'})
                return
            context_lines = timeline
        else:
            yield _sse({'type': 'step', 'content': 'Using the current graph view...'})
            context_lines = [line for line in view_context.split('\n') if line.strip()]

        yield _sse({'type': 'step', 'content': 'Classifying your question...'})
        yield _sse({'type': 'step', 'content': 'Analyzing investigation events...'})
        reply = generate_forensic_response(context_lines, history, context_label=context_label)
        yield _sse({'type': 'response', 'intent': 'forensic', 'reply': reply})
    except Exception as e:
        logger.error(f"Forensic chat failed: {e}")
        yield _sse({'type': 'response', 'intent': 'forensic', 'error': 'Failed to process AI request'})


def create_blueprint(db_client):
    bp = Blueprint('chat', __name__)

    @bp.route('/api/chat', methods=['POST'])
    def unified_chat():
        data = request.json
        case_id = data.get('case_id')
        history = data.get('history', [])
        handler_history = data.get('handler_history', [])
        view_context = data.get('view_context', '')

        if not history and not handler_history:
            return jsonify({"error": "No message provided"}), 400

        last_message = (handler_history or history)[-1].get('content', '')

        def event_stream():
            try:
                intent_data = classify_intent(last_message, handler_history)
            except Exception as e:
                logger.error(f"Intent classification failed: {e}")
                intent_data = {"intent": "forensic"}

            intent = intent_data.get('intent', 'forensic')

            if intent == 'handler_agent':
                yield from _stream_handler_agent(last_message, handler_history)
            elif intent == 'query_agent':
                yield from _stream_query_agent(last_message, handler_history)
            else:
                yield from _stream_forensic(last_message, history, case_id, view_context, db_client)

        return Response(
            stream_with_context(event_stream()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        )

    return bp
