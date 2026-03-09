import logging
import os
import uuid
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from pathlib import Path
from flask_cors import CORS
import Evtx.Evtx as evtx
import xml.etree.ElementTree as ET
from neo4j import GraphDatabase

env_path = Path('.') / '.env'
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', datefmt='%H:%M:%S')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USER")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

def insert_relationship(tx, case_id, source_label, source_name, target_label, target_name, rel_type, details):
    if not source_name or not target_name or source_name in ['-', ''] or target_name in ['-', '']:
        return

    valid_labels = ["User", "Computer", "Process", "Registry", "Task", "Service", "File"]
    source_label = source_label.capitalize()
    target_label = target_label.capitalize()

    if source_label not in valid_labels or target_label not in valid_labels:
        return

    query = f"""
    MERGE (c:Case {{case_id: $case_id}})
    MERGE (source:{source_label} {{name: $source_name, case_id: $case_id}})
    MERGE (target:{target_label} {{name: $target_name, case_id: $case_id}})
    MERGE (source)-[r:{rel_type}]->(target)
    SET r += $details
    """
    try:
        tx.run(query, case_id=case_id, source_name=source_name, target_name=target_name, details=details)
    except Exception as e:
        logger.error(f"Failed to insert relationship: {e}")

def from_evtx_files_to_logs(filepath, case_id, case_name):
    parsed_logs = []
    sid_map = {}
    proc_map = {}

    with evtx.Evtx(filepath) as logs:
        for record in logs.records():
            try:
                xml_content = record.xml().replace('xmlns="http://schemas.microsoft.com/win/2004/08/events/event"', '')
                root = ET.fromstring(xml_content)
                
                system_node = root.find(".//System")
                if system_node is None: continue
                    
                event_id_node = system_node.find("EventID")
                if event_id_node is None: continue
                event_id = event_id_node.text

                computer_node = system_node.find("Computer")
                host_name = computer_node.text.lower() if computer_node is not None else "Unknown"
                
                time_node = system_node.find("TimeCreated")
                timestamp = time_node.get('SystemTime') if time_node is not None else "-"

                data_items = root.findall(".//EventData/Data")
                data_map = {item.get('Name'): (item.text or "") for item in data_items}

                for sid_key, name_key in [('SubjectUserSid', 'SubjectUserName'), ('TargetUserSid', 'TargetUserName'), ('TargetSid', 'TargetUserName')]:
                    sid = data_map.get(sid_key)
                    name = data_map.get(name_key)
                    if sid and name and name not in ['-', ''] and sid != 'S-1-0-0':
                        sid_map[sid] = name

                for id_key, name_key in [('ProcessId', 'ProcessName'), ('NewProcessId', 'NewProcessName'), ('TargetProcessId', 'ProcessName')]:
                    pid = data_map.get(id_key)
                    pname = data_map.get(name_key)
                    if pid and pname and pname not in ['-', '']:
                        proc_map[pid] = pname.split('\\')[-1]

                parsed_logs.append({
                    'event_id': event_id,
                    'host_name': host_name,
                    'timestamp': timestamp,
                    'data_map': data_map
                })
            except Exception:
                continue

    def resolve_user(data_map, name_key, sid_key):
        name = data_map.get(name_key, "")
        if name and name != '-': return name
        sid = data_map.get(sid_key, "")
        if sid in sid_map: return sid_map[sid]
        return sid if sid and sid != '-' else "Unknown_User"

    def resolve_proc(data_map, name_key, id_key):
        name = data_map.get(name_key, "")
        if name and name != '-': return name.split('\\')[-1]
        pid = data_map.get(id_key, "")
        if pid in proc_map: return proc_map[pid]
        return pid if pid and pid != '-' else "Unknown_Process"

    with driver.session() as session:
        tx = session.begin_transaction()
        try:
            tx.run("""CREATE (i:Investigation {case_id: $case_id, name: $name, created_at: timestamp()})""", case_id=case_id, name=case_name)

            for count, log in enumerate(parsed_logs):
                event_id = log['event_id']
                host_name = log['host_name']
                data_map = log['data_map']
                
                details = {"event_id": event_id, "timestamp": log['timestamp']}
                details.update(data_map) 

                if event_id == '4624':
                    user = resolve_user(data_map, 'TargetUserName', 'TargetUserSid')
                    insert_relationship(tx, case_id, "User", user, "Computer", host_name, "LOGGED_IN", details)

                elif event_id == '4672':
                    user = resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid')
                    insert_relationship(tx, case_id, "User", user, "Computer", host_name, "PRIV_LOGON", details)

                elif event_id == '4625':
                    user = resolve_user(data_map, 'TargetUserName', 'TargetUserSid')
                    insert_relationship(tx, case_id, "User", user, "Computer", host_name, "FAILED_LOGON", details)

                elif event_id == '4688':
                    src_proc = resolve_proc(data_map, 'ParentProcessName', 'ProcessId')
                    dst_proc = resolve_proc(data_map, 'NewProcessName', 'NewProcessId')
                    insert_relationship(tx, case_id, "Process", src_proc, "Process", dst_proc, "PROCESS_CREATED", details)

                elif event_id == '4698':
                    user = resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid')
                    task = data_map.get('TaskName', 'Unknown_Task')
                    insert_relationship(tx, case_id, "User", user, "Task", task, "TASK_CREATED", details)

                elif event_id == '5156':
                    proc = resolve_proc(data_map, 'Application', 'ProcessId')
                    insert_relationship(tx, case_id, "Process", proc, "Computer", host_name, "NETWORK_CONNECTION", details)

                elif event_id == '4697':
                    user = resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid')
                    service = data_map.get('ServiceName', 'Unknown_Service')
                    insert_relationship(tx, case_id, "User", user, "Service", service, "SERVICE_INSTALLED", details)

                elif event_id == '4657':
                    proc = resolve_proc(data_map, 'ProcessName', 'ProcessId')
                    obj_name = data_map.get('ObjectName', '')
                    val_name = data_map.get('ObjectValueName', '')
                    reg_path = f"{obj_name}\\{val_name}" if val_name else obj_name
                    if not reg_path or reg_path == "-": reg_path = "Unknown_Registry_Key"
                    insert_relationship(tx, case_id, "Process", proc, "Registry", reg_path, "REGISTRY_MODIFIED", details)

                elif event_id == '4720':
                    src_user = resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid')
                    dst_user = resolve_user(data_map, 'TargetUserName', 'TargetSid')
                    insert_relationship(tx, case_id, "User", src_user, "User", dst_user, "USER_CREATED", details)

                elif event_id == '4648':
                    src_user = resolve_user(data_map, 'SubjectUserName', 'SubjectUserSid')
                    dst_user = resolve_user(data_map, 'TargetUserName', 'TargetUserSid')
                    insert_relationship(tx, case_id, "User", src_user, "User", dst_user, "EXPLICIT_CREDS_USED", details)
                    
                    target_server = data_map.get('TargetServerName', '-')
                    if target_server and target_server.lower() not in ["localhost", "127.0.0.1", "-"]:
                        insert_relationship(tx, case_id, "User", src_user, "Computer", target_server.lower(), "REMOTE_ACCESS", details)

                elif event_id == '4696':
                    proc = resolve_proc(data_map, 'ProcessName', 'TargetProcessId')
                    user = resolve_user(data_map, 'TargetUserName', 'TargetUserSid')
                    insert_relationship(tx, case_id, "Process", proc, "User", user, "TOKEN_ASSIGNED", details)

                elif event_id == '4663':
                    proc = resolve_proc(data_map, 'ProcessName', 'ProcessId')
                    file_obj = data_map.get('ObjectName', 'Unknown_Object')
                    insert_relationship(tx, case_id, "Process", proc, "File", file_obj, "OBJECT_ACCESSED", details)

                if count % 2000 == 0:
                    tx.commit()
                    tx = session.begin_transaction()

            tx.commit()
            
        except Exception as e:
            tx.rollback()
            logger.error(f"Transaction failed: {e}")
    
    return case_id

@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():
    case_id = request.args.get('case_id')
    if not case_id:
        return jsonify({"error": "Missing case_id parameter"}), 400
    
    query = "MATCH (n)-[r]->(m) WHERE n.case_id = $case_id RETURN n, r, m"
    nodes_dict, links = {}, []
    
    with driver.session() as session:
        results = session.run(query, case_id=case_id)
        for record in results:
            node_source, rel, node_target = record["n"], record["r"], record["m"]
            
            source_id = node_source.element_id
            if source_id not in nodes_dict:
                nodes_dict[source_id] = {"id": source_id, "label": list(node_source.labels)[0], "properties": dict(node_source)}
            
            target_id = node_target.element_id
            if target_id not in nodes_dict:
                nodes_dict[target_id] = {"id": target_id, "label": list(node_target.labels)[0], "properties": dict(node_target)}
                
            links.append({"source": source_id, "target": target_id, "type": rel.type, "details": dict(rel)})
    
    return jsonify({"nodes": list(nodes_dict.values()), "links": links})

@app.route('/api/parse-evtx', methods=['POST'])
def parse_evtx():
    if 'evtxFile' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['evtxFile']
    inv_name = request.form.get('invName', 'Investigation') 
    if file.filename == '': return jsonify({"error": "No selected file"}), 400

    if file:
        safe_inv_name = "".join([c for c in inv_name if c.isalnum() or c in ('_', '-')]).rstrip()
        if not safe_inv_name: safe_inv_name = "Inv"

        case_id = str(uuid.uuid4())
        new_filename = f"{safe_inv_name}{case_id}.evtx"
        filepath = os.path.join(UPLOAD_FOLDER, new_filename)
        file.save(filepath)
        
        try:
            from_evtx_files_to_logs(filepath, case_id, inv_name)
            return jsonify({"status": "success", "filename": new_filename, "case_id": case_id}), 200
        except Exception as e:
            logger.error(f"Parsing failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/investigations', methods=['GET'])
def get_investigations():
    query = "MATCH (i:Investigation) RETURN i.case_id AS case_id, i.name AS name ORDER BY i.created_at DESC"
    try:
        with driver.session() as session:
            results = session.run(query)
            data = [{"case_id": r["case_id"], "name": r["name"]} for r in results]
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/ai-chat', methods=['POST'])
def ai_chat():
    data = request.json
    case_id = data.get('case_id')
    chat_history = data.get('history', [])

    if not case_id or not chat_history:
        return jsonify({"error": "Missing case_id or chat history"}), 400

    query = """
    MATCH (src)-[r]->(dst)
    WHERE src.case_id = $case_id
    RETURN labels(src)[0] AS src_type, src.name AS src_name, 
           type(r) AS action, r.timestamp AS time, 
           labels(dst)[0] AS dst_type, dst.name AS dst_name
    ORDER BY r.timestamp ASC
    LIMIT 500
    """
    
    story_lines = []
    try:
        with driver.session() as session:
            results = session.run(query, case_id=case_id)
            for record in results:
                line = f"[{record['time']}] {record['src_name']}->{record['action']}->{record['dst_name']}"
                story_lines.append(line)
    except Exception as e:
        logger.error(f"Failed to fetch story from Neo4j: {e}")
        return jsonify({"error": "Failed to extract investigation timeline."}), 500

    if not story_lines:
        return jsonify({"reply": "There is no data in the current investigation graph to analyze. Please load an EVTX file first."})

    context_story = "\n".join(story_lines)

    system_prompt = f"""You are 'ForensiFlow AI', an expert DFIR assistant.
Review the following chronological event logs from the graph:

{context_story}

INSTRUCTIONS:
1. Base your answers ONLY on the logs provided.
2. If the user asks for a summary, provide a SINGLE, dense, concise paragraph. No bullet points.
3. For all other chat messages, answer naturally like a helpful forensic analyst discussing the case.
4. Focus on anomalies, lateral movement, and persistence.
"""

    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        return jsonify({"reply": "**[MOCK AI RESPONSE]**\n\nNo API Key found. Add GEMINI_API_KEY to .env"})

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
        headers = {"Content-Type": "application/json"}
        
        contents = []
        for msg in chat_history:
            role = "model" if msg.get("role") == "ai" else "user"
            contents.append({
                "role": role,
                "parts": [{"text": msg.get("content", "")}]
            })
        
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {"temperature": 0.2}
        }
        
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        response_data = response.json()
        ai_reply = response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating response.")
        
        cleaned_reply = ai_reply.strip()
        return jsonify({"reply": cleaned_reply})
        
    except Exception as e:
        logger.error(f"AI error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logger.info("Server starting on port 8000...")
    app.run(debug=True, port=8000)