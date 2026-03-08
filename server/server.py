import logging
import time
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from pathlib import Path
from flask_cors import CORS
import os
import uuid, datetime
import Evtx.Evtx as evtx
import xml.etree.ElementTree as ET
from neo4j import GraphDatabase



INSERT_PROCESS_QUERY = """
MERGE (c:Case {case_id: $case_id})
MERGE (parent:Process {name: $parent_proc_name, case_id: $case_id})
MERGE (child:Process {name: $new_proc_name, case_id: $case_id})
MERGE (parent)-[r:SPAWNED]->(child)
SET r += $details
"""

INSERT_LOGON_QUERY = """
MERGE (c:Case {case_id: $case_id})
MERGE (user:User {name: $target_user, case_id: $case_id})
MERGE (host:Computer {name: $workstation, case_id: $case_id})
MERGE (user)-[r:LOGGED_ON]->(host)
SET r += $details
"""
INSERT_REGISTRY_CREATED_QUERY = """
MERGE (c:Case {case_id: $case_id})
MERGE (proc:Process {name: $process_name, case_id: $case_id})
MERGE (reg:Registry {name: $registry_path, case_id: $case_id})
MERGE (proc)-[r:CREATED]->(reg)
SET r += $details
"""

INSERT_REGISTRY_MODIFIED_QUERY = """
MERGE (c:Case {case_id: $case_id})
MERGE (proc:Process {name: $process_name, case_id: $case_id})
MERGE (reg:Registry {name: $registry_path, case_id: $case_id})
MERGE (proc)-[r:MODIFIED]->(reg)
SET r += $details
"""

INSERT_REGISTRY_DELETED_QUERY = """
MERGE (c:Case {case_id: $case_id})
MERGE (proc:Process {name: $process_name, case_id: $case_id})
MERGE (reg:Registry {name: $registry_path, case_id: $case_id})
MERGE (proc)-[r:DELETED]->(reg)
SET r += $details
"""

env_path = Path('.') / '.env'
load_dotenv(dotenv_path=env_path)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USER")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))






def extracts_processes(root, session, case_id):
    
    data_items = root.findall(".//EventData/Data")
    data_map = {item.get('Name'): item.text for item in data_items}


    parent_path = data_map.get('ParentProcessName', '')
    new_proc_path = data_map.get('NewProcessName', '')
    

    parent_proc_name = os.path.basename(parent_path) if parent_path else "Unknown"
    new_proc_name = os.path.basename(new_proc_path) if new_proc_path else "Unknown"


    details = {
        "event_id": "4688",
        "timestamp": root.find(".//TimeCreated").get('SystemTime'),
        "parent_pid": data_map.get('ProcessId', '-'),
        "parent_full_path": parent_path,
        "new_pid": data_map.get('NewProcessId', '-'),
        "new_full_path": new_proc_path,
        "command_line": data_map.get('CommandLine', '-'),
        "TokenElevationType" : data_map.get('TokenElevationType', '-'),
        "SubjectUserSid" : data_map.get('SubjectUserSid', '-'),
        "SubjectUserName" : data_map.get('SubjectUserName', '-'),
        "SubjectDomainName" : data_map.get('SubjectDomainName', '-'),
        "TargetUserSid" : data_map.get('TargetUserSid', '-'),
        "TargetUserName" : data_map.get('TargetUserName', '-'),
        "TargetDomainName" : data_map.get('TargetDomainName', '-'),
        "TargetLogonId" : data_map.get('TargetLogonId', '-'),
        "MandatoryLabel" : data_map.get('MandatoryLabel', '-'),
    }

    if parent_path and new_proc_path:
        try:
            session.run(INSERT_PROCESS_QUERY, 
                        case_id=case_id,
                        parent_proc_name=parent_proc_name, 
                        new_proc_name=new_proc_name,      
                        details=details               
            )
            logger.info(f"Inserted Process: {parent_proc_name} -> {new_proc_name}")
        except Exception as e:
            logger.error(f"Failed to insert process query: {e}")

def extract_loggon(root, session, case_id):
    data_items = root.findall(".//EventData/Data")
    data_map = {item.get('Name'): item.text for item in data_items}

    target_user = data_map.get('TargetUserName', 'Unknown')
    workstation = data_map.get('WorkstationName', 'Unknown')

    details = {
        "event_id": "4624",
        "timestamp": root.find(".//TimeCreated").get('SystemTime'),
        "SubjectUserSid": data_map.get('SubjectUserSid', '-'),
        "SubjectUserName": data_map.get('SubjectUserName', '-'),
        "SubjectDomainName": data_map.get('SubjectDomainName', '-'),
        "SubjectLogonId": data_map.get('SubjectLogonId', '-'),
        "TargetUserSid": data_map.get('TargetUserSid', '-'),
        "TargetDomainName": data_map.get('TargetDomainName', '-'),
        "TargetLogonId": data_map.get('TargetLogonId', '-'),
        "LogonType": data_map.get('LogonType', '-'),
        "ProcessId": data_map.get('ProcessId', '-'),
        "ProcessName": data_map.get('ProcessName', '-'),
        "IpAddress": data_map.get('IpAddress', '-'),
        "IpPort": data_map.get('IpPort', '-'),
        "ElevatedToken": data_map.get('ElevatedToken', '-')
    }

    
    if target_user and workstation:
        try:
            session.run(INSERT_LOGON_QUERY, 
                        case_id=case_id,
                        target_user=target_user, 
                        workstation=workstation,
                        details=details
            )
            logger.info(f"Inserted Logon: {target_user} -> {workstation}")
        except Exception as e:
            logger.error(f"Failed to insert logon query: {e}")
            
def extract_registry(root, session, case_id):

    data_items = root.findall(".//EventData/Data")
    data_map = {item.get('Name'): item.text for item in data_items}

    op_type_raw = data_map.get('OperationType', '').lower()

    proc_path = data_map.get('ProcessName', '')
    process_name = os.path.basename(proc_path) if proc_path else "Unknown"

    object_name = data_map.get('ObjectName', '')
    value_name = data_map.get('ObjectValueName', '')
    
    registry_path = f"{object_name}\\{value_name}" if value_name else object_name
    if not registry_path:
        registry_path = "Unknown_Registry_Key"

    details = {
        "event_id": "4657",
        "timestamp": root.find(".//TimeCreated").get('SystemTime'),
        "user": data_map.get('SubjectUserName', '-'),
        "domain": data_map.get('SubjectDomainName', '-'),
        "logon_id": data_map.get('SubjectLogonId', '-'),
        "process_id": data_map.get('ProcessId', '-'),
        "process_path": proc_path,
        "operation_text": data_map.get('OperationType', '-'),
        "old_value_type": data_map.get('OldValueType', '-'),
        "old_value": data_map.get('OldValue', '-'),
        "new_value_type": data_map.get('NewValueType', '-'),
        "new_value": data_map.get('NewValue', '-')
    }

    if process_name and registry_path:
        try:
            logger.info(op_type_raw)
            if "%%1904" in op_type_raw:
                session.run(INSERT_REGISTRY_CREATED_QUERY, 
                        case_id=case_id,
                        process_name=process_name, 
                        registry_path=registry_path,
                        details=details
                    )
            elif "1906" in op_type_raw:
                session.run(INSERT_REGISTRY_DELETED_QUERY, 
                        case_id=case_id,
                        process_name=process_name, 
                        registry_path=registry_path,
                        details=details
                    )
            elif "1905" in op_type_raw:
                session.run(INSERT_REGISTRY_MODIFIED_QUERY, 
                        case_id=case_id,
                        process_name=process_name, 
                        registry_path=registry_path,
                        details=details
                    )
        except Exception as e:
            logger.error(f"Failed to insert registry query: {e}")



def from_evtx_files_to_logs(filepath, case_id, case_name):
    with evtx.Evtx(filepath) as logs:
        with driver.session() as session:
            # Save the investigation to Neo4j so it can be retrieved later
            query_create_case = """CREATE (i:Investigation {case_id: $case_id, name: $name, created_at: timestamp()})"""
            session.run(query_create_case, case_id=case_id, name=case_name)

            for record in logs.records():
                try:
                    xml_content = record.xml()
                    xml_content = xml_content.replace('xmlns="http://schemas.microsoft.com/win/2004/08/events/event"', '')
                    root = ET.fromstring(xml_content)
                    event_id = root.find(".//EventID")

                    if event_id is None:
                        continue

                    if event_id.text == '4688':
                        extracts_processes(root, session, case_id)
                    elif event_id.text == '4624':
                        extract_loggon(root, session, case_id)
                    elif event_id.text == "4657":
                        extract_registry(root, session, case_id)
                except Exception as e:
                    continue
    
    return case_id



@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():
    
    case_id = request.args.get('case_id')
    
    if not case_id:
        return jsonify({"error": "Missing case_id parameter"}), 400
    
    query = """
    MATCH (n)-[r]->(m)
    WHERE n.case_id = $case_id 
    RETURN n, r, m
    """
    
    nodes_dict = {}
    links = []
    
    with driver.session() as session:
        results = session.run(query, case_id=case_id)

        for record in results:
            node_source = record["n"]
            rel = record["r"]
            node_target = record["m"]
            source_id = node_source.element_id

            if source_id not in nodes_dict:
                nodes_dict[source_id] = {
                    "id": source_id,
                    "label": list(node_source.labels)[0], 
                    "properties": dict(node_source)       
                }
            
            target_id = node_target.element_id
            if target_id not in nodes_dict:
                nodes_dict[target_id] = {
                    "id": target_id,
                    "label": list(node_target.labels)[0],
                    "properties": dict(node_target)
                }
            links.append({
                "source": source_id,  
                "target": target_id,
                "type": rel.type,     
                "details": dict(rel) 
            })
    
    return jsonify({
        "nodes": list(nodes_dict.values()),
        "links": links
    })

@app.route('/api/parse-evtx', methods=['POST'])
def parse_evtx():
    if 'evtxFile' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['evtxFile']
    inv_name = request.form.get('invName', 'Investigation') 
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        # Sanitize the investigation name to prevent filesystem issues
        safe_inv_name = "".join([c for c in inv_name if c.isalnum() or c in ('_', '-')]).rstrip()
        if not safe_inv_name:
            safe_inv_name = "Inv"

        case_id = str(uuid.uuid4())
        
        # Format: <inv_name><inv_id>.evtx
        new_filename = f"{safe_inv_name}{case_id}.evtx"
        filepath = os.path.join(UPLOAD_FOLDER, new_filename)
        
        # Save file to disk
        file.save(filepath)
        
        try:
            # Process and save to Neo4j
            from_evtx_files_to_logs(filepath, case_id, inv_name)
            return jsonify({
                "status": "success", 
                "filename": new_filename,
                "case_id": case_id
            }), 200
        
        except Exception as e:
            logger.error(f"Parsing failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/investigations', methods=['GET'])
def get_investigations():
    query = """
    MATCH (i:Investigation) 
    RETURN i.case_id AS case_id, i.name AS name 
    ORDER BY i.created_at DESC
    """
    try:
        with driver.session() as session:
            results = session.run(query)
            data = [{"case_id": r["case_id"], "name": r["name"]} for r in results]
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"Failed to fetch investigations: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    logger.info("Server starting on port 8000...")
    app.run(debug=True, port=8000)