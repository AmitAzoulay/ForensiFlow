import logging
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request
from services.evtx_parser import parse_and_store_evtx

logger = logging.getLogger(__name__)

_UPLOAD_FOLDER = Path(__file__).parent.parent / 'uploads'


def create_blueprint(db_client):
    bp = Blueprint('investigations', __name__)

    @bp.route('/api/investigations', methods=['GET'])
    def get_investigations():
        try:
            return jsonify(db_client.get_all_investigations()), 200
        except Exception:
            return jsonify({"error": "Failed to fetch investigations"}), 500

    @bp.route('/api/investigations', methods=['POST'])
    def create_investigation():
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
        filepath = str(_UPLOAD_FOLDER / f"{safe_inv_name}_{case_id}.evtx")
        file.save(filepath)

        try:
            parse_and_store_evtx(filepath, case_id, inv_name, db_client)
            return jsonify({"status": "success", "case_id": case_id}), 201
        except Exception as e:
            logger.error(f"Parsing failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

    @bp.route('/api/investigations/<case_id>', methods=['DELETE'])
    def delete_investigation(case_id):
        try:
            db_client.delete_investigation(case_id)
            return jsonify({"status": "success", "message": "Investigation deleted successfully"}), 200
        except Exception as e:
            logger.error(f"Failed to delete investigation: {e}")
            return jsonify({"error": "Failed to delete investigation"}), 500

    @bp.route('/api/graph-data', methods=['GET'])
    def get_graph_data():
        case_id = request.args.get('case_id')
        if not case_id:
            return jsonify({"error": "Missing case_id parameter"}), 400
        try:
            return jsonify(db_client.get_case_graph(case_id)), 200
        except Exception:
            return jsonify({"error": "Failed to fetch graph data"}), 500

    @bp.route('/api/save-edited', methods=['POST'])
    def save_edited_investigation():
        data = request.json
        new_case_id = str(uuid.uuid4())
        try:
            db_client.save_edited_graph(
                data.get('old_case_id'),
                new_case_id,
                data.get('new_name'),
                data.get('nodes'),
                data.get('links'),
            )
            return jsonify({"status": "success", "case_id": new_case_id}), 200
        except Exception as e:
            logger.error(f"Save edited failed: {e}")
            return jsonify({"error": "Failed to save edited investigation"}), 500

    @bp.route('/api/reparse/<case_id>', methods=['POST'])
    def reparse_case(case_id):
        try:
            matches = list(_UPLOAD_FOLDER.glob(f"*_{case_id}.evtx"))
            if not matches:
                return jsonify({'error': 'Original EVTX file not found for this case'}), 404
            case_name = db_client.get_investigation_name(case_id)
            db_client.delete_investigation(case_id)
            parse_and_store_evtx(str(matches[0]), case_id, case_name, db_client)
            return jsonify({'status': 'success'}), 200
        except Exception as e:
            logger.error(f"Reparse failed for case {case_id}: {e}")
            return jsonify({'error': str(e)}), 500

    return bp
