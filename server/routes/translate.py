import logging

from flask import Blueprint, jsonify, request

from services.ai_agent import generate_log_translation

logger = logging.getLogger(__name__)


def create_blueprint():
    bp = Blueprint('translate', __name__)

    @bp.route('/api/translate-log', methods=['POST'])
    def translate_log():
        data = request.json
        # Accept both field names: LogPanel.tsx sends 'log_details', api.ts sends 'details'
        log_details = data.get('log_details') or data.get('details')

        if not log_details:
            return jsonify({"error": "Missing log details"}), 400

        try:
            translation = generate_log_translation(str(log_details))
            return jsonify({"reply": translation}), 200
        except Exception as e:
            logger.error(f"Translation route error: {e}")
            return jsonify({"error": "Failed to translate log"}), 500

    return bp
