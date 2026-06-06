import logging
import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Neo4jClient
from services.ai_agent import generate_forensic_response
from services.evtx_parser import parse_and_store_evtx

import pandas as pd
import io
from flask import send_file
from services.ai_agent import generate_forensic_response, generate_report_narrative

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

db_client = Neo4jClient(
    uri=os.getenv("NEO4J_URI"),
    user=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD")
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
             
        ai_reply = generate_forensic_response(timeline, chat_history)
        return jsonify({"reply": ai_reply}), 200
        
    except Exception as e:
        logger.error(f"AI Chat processing error: {e}")
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
    
@app.route('/api/generate-forensic-report', methods=['POST'])
def generate_forensic_report():
    try:
        data = request.json
        red_nodes = data.get('nodes', [])
        red_links = data.get('links', [])

        # 1. יצירת מילון לתרגום ID של Node לשם האמיתי שלו (למשל powershell.exe)
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

        # 4. בניית קובץ האקסל בזיכרון (בלי לשמור אותו על השרת)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            
            # טאב 1: סיכום מנהלים ונרטיב
            summary_df = pd.DataFrame([{"AI Forensic Narrative": ai_narrative}])
            summary_df.to_excel(writer, sheet_name='Executive Summary', index=False)
            
            # עיצוב הטאב הראשון (טקסט עוטף ושורה רחבה)
            workbook = writer.book
            worksheet = writer.sheets['Executive Summary']
            format_wrap = workbook.add_format({'text_wrap': True, 'valign': 'top'})
            worksheet.set_column('A:A', 120, format_wrap)
            
            # טאב 2: הראיות הגולמיות
            if evidence_list:
                evidence_df = pd.DataFrame(evidence_list)
                evidence_df.to_excel(writer, sheet_name='Raw Evidence', index=False)
                worksheet_ev = writer.sheets['Raw Evidence']
                worksheet_ev.set_column('A:E', 25) # הרחבת עמודות למראה מסודר

        # שליחת הקובץ בחזרה ל-React להורדה
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

if __name__ == '__main__':
    logger.info("ForensiFlow API Server starting on port 8000...")
    app.run(debug=True, port=8000)

