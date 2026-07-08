import json
import logging

import requests
from flask import Blueprint, Response, jsonify, request, stream_with_context

from services.ai_agent import (
    classify_intent,
    generate_forensic_response,
    run_handler_agent,
    run_query_agent,
)
from services.handler_manager import get_available_relations, tool_executor

logger = logging.getLogger(__name__)


def create_blueprint(db_client):
    bp = Blueprint('chat', __name__)

    @bp.route('/api/ai-chat', methods=['POST'])
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
                parts = [
                    f"{k}: {v}" for k, v in flat_item.items()
                    if "id" not in k.lower() and "label" not in k.lower() and v not in [None, "", [], {}]
                ]
                compressed_timeline.append(" | ".join(parts))

            logger.info(f"Sending request to AI with {len(compressed_timeline)} log lines and {len(chat_history)} chat messages.")
            ai_reply = generate_forensic_response(compressed_timeline, chat_history)
            return jsonify({"reply": ai_reply}), 200

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                return jsonify({"reply": "AI is overloaded right now. Please wait 60 seconds."}), 429
            return jsonify({"error": "Failed to process AI request"}), 500
        except Exception as e:
            if "429" in str(e) or "RATE_LIMIT" in str(e) or "quota" in str(e).lower():
                return jsonify({"reply": "AI rate limit reached. Please wait 60 seconds."}), 429
            logger.error(f"AI Chat processing error: {e}")
            return jsonify({"error": "Failed to process AI request"}), 500

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
                try:
                    yield f"data: {json.dumps({'type': 'step', 'content': 'Processing handler commands...'})}\n\n"
                    result = run_handler_agent(last_message, handler_history, tool_executor)
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'handler_agent', 'summary': result['summary'], 'needs_reparse': result['needs_reparse'], 'results': result['results']})}\n\n"
                except Exception as e:
                    logger.error(f"Handler agent failed: {e}")
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'handler_agent', 'summary': f'Error: {e}', 'needs_reparse': False, 'results': []})}\n\n"

            elif intent == 'query_agent':
                try:
                    yield f"data: {json.dumps({'type': 'step', 'content': 'Analyzing your request...'})}\n\n"
                    yield f"data: {json.dumps({'type': 'step', 'content': 'Generating graph filter...'})}\n\n"
                    result = run_query_agent(last_message, handler_history, get_available_relations())
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'query_agent', 'query': result['query'], 'label': result['label']})}\n\n"
                except Exception as e:
                    logger.error(f"Query agent failed: {e}")
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'query_agent', 'query': '', 'label': '', 'error': str(e)})}\n\n"

            else:  # forensic
                if not case_id:
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'forensic', 'reply': 'Load a case first to analyze the investigation.'})}\n\n"
                    return
                try:
                    summary_request = any(kw in last_message.lower() for kw in ['summarize', 'summary', 'summarise'])
                    use_current_view = bool(view_context) and summary_request
                    context_label = 'the current graph view' if use_current_view else 'the investigation timeline'

                    if not use_current_view:
                        yield f"data: {json.dumps({'type': 'step', 'content': 'Retrieving investigation timeline...'})}\n\n"
                        timeline = db_client.get_investigation_timeline(case_id)
                        if not timeline:
                            yield f"data: {json.dumps({'type': 'response', 'intent': 'forensic', 'reply': 'No data in the current graph to analyze. Load an EVTX file first.'})}\n\n"
                            return
                        context_lines = timeline
                    else:
                        yield f"data: {json.dumps({'type': 'step', 'content': 'Using the current graph view...'})}\n\n"
                        context_lines = [line for line in view_context.split('\n') if line.strip()]

                    yield f"data: {json.dumps({'type': 'step', 'content': 'Classifying your question...'})}\n\n"
                    yield f"data: {json.dumps({'type': 'step', 'content': 'Analyzing investigation events...'})}\n\n"
                    reply = generate_forensic_response(context_lines, history, context_label=context_label)
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'forensic', 'reply': reply})}\n\n"
                except Exception as e:
                    logger.error(f"Forensic chat failed: {e}")
                    yield f"data: {json.dumps({'type': 'response', 'intent': 'forensic', 'error': 'Failed to process AI request'})}\n\n"

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
