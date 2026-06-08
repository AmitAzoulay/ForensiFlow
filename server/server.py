import logging
import os
import uuid
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Neo4jClient
from services.ai_agent import generate_forensic_response, generate_report_narrative, translate_single_log
import pandas as pd
import io
from flask import send_file
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
        
@app.route('/api/translate-log', methods=['POST'])
def process_log_translation():
    data = request.json
    log_details = data.get('log_details')

    if not log_details:
        return jsonify({"error": "Missing log details"}), 400

    try:
        translation = translate_single_log(log_details)
        return jsonify({"reply": translation}), 200
    except Exception as e:
        if str(e) == "RATE_LIMIT":
            return jsonify({"reply": "AI rate limit reached. Please wait a minute."}), 429
        logger.error(f"Translation error: {e}")
        return jsonify({"error": "Failed to translate log"}), 500

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
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 429:
            return jsonify({"reply": "AI is overloaded right now. Please wait 60 seconds."}), 429
        return jsonify({"error": "Failed to process AI request"}), 500
    except Exception as e:
        if "429" in str(e) or "RATE_LIMIT" in str(e):
            return jsonify({"reply": "AI rate limit reached. Please wait 60 seconds."}), 429
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

        # 4. בניית קובץ האקסל בזיכרון עם העיצוב המקצועי
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            workbook = writer.book
            
            # --- עיצובים (Styles) ---
            title_format = workbook.add_format({'bold': True, 'font_size': 16, 'font_color': '#ffffff', 'bg_color': '#1e293b', 'align': 'left', 'valign': 'vcenter', 'indent': 1})
            header_format = workbook.add_format({'bold': True, 'font_size': 12, 'font_color': '#ef4444', 'bottom': 1})
            text_format = workbook.add_format({'text_wrap': True, 'valign': 'top', 'font_size': 11})
            meta_format = workbook.add_format({'bold': True, 'font_color': '#64748b', 'font_size': 10})

            # --- טאב 1: סיכום מנהלים ונרטיב (בנייה ידנית למראה מסמך) ---
            worksheet_summary = workbook.add_worksheet('Executive Summary')
            worksheet_summary.set_column('A:A', 120) # עמודה רחבה מאוד
            worksheet_summary.hide_gridlines(2) # העלמת קווי הרשת של האקסל למראה נקי

            # כותרת ראשית
            worksheet_summary.write('A1', 'ForensiFlow - Automated Incident Report', title_format)
            worksheet_summary.set_row(0, 30) # גובה שורת הכותרת

            # מטא-דאטה (זמן הפקה וכמות ממצאים)
            import datetime
            generation_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            worksheet_summary.write('A2', f"Generated on: {generation_time} | Flagged Events: {len(evidence_list)}", meta_format)
            worksheet_summary.set_row(1, 20)

            # פיצול וכתיבת הנרטיב
            parts = ai_narrative.split('\n\n')
            current_row = 4
            for part in parts:
                if "Executive Summary" in part or "Chronological Narrative" in part:
                    worksheet_summary.write(current_row, 0, part.strip(), header_format)
                else:
                    worksheet_summary.write(current_row, 0, part.strip(), text_format)
                    estimated_height = (len(part) / 100) * 15
                    worksheet_summary.set_row(current_row, max(30, estimated_height))
                current_row += 2
                
            # --- טאב 2: הראיות הגולמיות ---
            if evidence_list:
                evidence_df = pd.DataFrame(evidence_list)
                evidence_df.to_excel(writer, sheet_name='Raw Evidence', index=False)
                worksheet_ev = writer.sheets['Raw Evidence']
                
                table_header_format = workbook.add_format({'bold': True, 'bg_color': '#334155', 'font_color': 'white'})
                for col_num, value in enumerate(evidence_df.columns.values):
                    worksheet_ev.write(0, col_num, value, table_header_format)
                
                worksheet_ev.set_column('A:A', 25) 
                worksheet_ev.set_column('B:D', 35) 
                worksheet_ev.set_column('E:E', 15) 
                worksheet_ev.autofilter(0, 0, len(evidence_list), len(evidence_df.columns) - 1)

        # --- השורות שהיו חסרות! שולחים את הקובץ ל-React ---
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

