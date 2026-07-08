import logging
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request
from services.evtx_parser import parse_and_store_evtx

logger = logging.getLogger(__name__)

_UPLOAD_FOLDER = Path(__file__).parent.parent / 'uploads'


def create_blueprint(db_client):
    bp = Blueprint('evtx', __name__)

    @bp.route('/api/parse-evtx', methods=['POST'])
    def upload_and_parse_evtx():
        if 'evtxFile' not in request.files:
            return jsonify({"error": "No file part"}), 400

        file = request.files['evtxFile']
        inv_name = request.form.get('invName', 'Investigation')

        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        safe_inv_name = "".join(c for c in inv_name if c.isalnum() or c in ('_', '-')).rstrip()
        if not safe_inv_name:
            safe_inv_name = "Inv"

        case_id = str(uuid.uuid4())
        new_filename = f"{safe_inv_name}_{case_id}.evtx"
        filepath = str(_UPLOAD_FOLDER / new_filename)
        file.save(filepath)

        try:
            parse_and_store_evtx(filepath, case_id, inv_name, db_client)
            return jsonify({"status": "success", "filename": new_filename, "case_id": case_id}), 200
        except Exception as e:
            logger.error(f"Parsing failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

    return bp
