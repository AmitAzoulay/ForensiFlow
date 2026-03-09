import logging
import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Neo4jClient
from services.ai_agent import generate_forensic_response
# NOTE: We will extract the EVTX logic into services/evtx_parser.py in the next step
from services.evtx_parser import parse_and_store_evtx

load_dotenv()

logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize database client
db_client = Neo4jClient(
    uri=os.getenv("NEO4J_URI"),
    user=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD")
)

@app.route('/api/investigations', methods=['GET'])
def get_investigations():
    """Endpoint to fetch all available investigation cases."""
    try:
        investigations = db_client.get_all_investigations()
        return jsonify(investigations), 200
    except Exception as e:
        return jsonify({"error": "Failed to fetch investigations"}), 500

@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():
    """Endpoint to fetch node and link data for the UI graph."""
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
        
@app.route('/api/ai-chat', methods=['POST'])
def process_ai_chat():
    """Endpoint to handle AI assistant interactions."""
    data = request.json
    case_id = data.get('case_id')
    chat_history = data.get('history', [])

    if not case_id or not chat_history:
        return jsonify({"error": "Missing case_id or chat history"}), 400

    try:
        timeline = db_client.get_investigation_timeline(case_id)
        if not timeline:
             return jsonify({"reply": "No data in the current graph to analyze. Load an EVTX file first."})
             
        ai_reply = generate_forensic_response(timeline, chat_history)
        return jsonify({"reply": ai_reply}), 200
        
    except Exception as e:
        logger.error(f"AI Chat processing error: {e}")
        return jsonify({"error": "Failed to process AI request"}), 500

if __name__ == '__main__':
    logger.info("ForensiFlow API Server starting on port 8000...")
    app.run(debug=True, port=8000)