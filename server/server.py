import logging
import time
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from pathlib import Path
from flask_cors import CORS
import os
import Evtx.Evtx as evtx
import xml.etree.ElementTree as ET
from neo4j import GraphDatabase

# --- 1. SETUP LOGGING ---
# This will print nice timestamps to your console

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

def insert_process_relationship(tx, parent_name, child_name, details):
    query = (
        "MERGE (p:Process {path: $parent}) "
        "MERGE (c:Process {path: $child}) "
        "MERGE (p)-[r:SPAWNED]->(c) "
        "SET r += $details"  
    )
    tx.run(query, parent=parent_name, child=child_name, details=details)

def parse_and_store_evtx(filepath):
    logger.info(f"Starting to parse: {filepath}")
    nodes_created = 0
    total_records = 0
    start_time = time.time()
    
    with evtx.Evtx(filepath) as log:
        with driver.session() as session:
            for record in log.records():
                total_records += 1
                
                if total_records % 500 == 0:
                    elapsed = time.time() - start_time
                    logger.info(f"Scanned {total_records} records... (Found {nodes_created} process events). Time: {elapsed:.2f}s")

                try:
                    xml_content = record.xml()
                    
                    # Parse XML safely
                    # We need to register the namespace to find tags easily or ignore it
                    # Here we strip namespaces for easier parsing in this snippet approach:
                    xml_content = xml_content.replace('xmlns="http://schemas.microsoft.com/win/2004/08/events/event"', '')
                    root = ET.fromstring(xml_content)
                    
                    event_id = root.find(".//EventID")
                    if event_id is None or event_id.text != '4688':
                        continue
                    
                    data_items = root.findall(".//EventData/Data")
                    data_map = {item.get('Name'): item.text for item in data_items}
                    
                    parent_proc = data_map.get('ParentProcessName')
                    new_proc = data_map.get('NewProcessName')
                    
                    time_created = root.find(".//TimeCreated").get('SystemTime')
                    
                    details = {
                        "event_id": "4688",
                        "timestamp": time_created,
                        "user": data_map.get('SubjectUserName', 'Unknown'),
                        "domain": data_map.get('SubjectDomainName', '-'),
                        "command_line": data_map.get('CommandLine', '-'),
                        "parent_pid": data_map.get('ProcessId', '-'),
                        "child_pid": data_map.get('NewProcessId', '-')
                    }

                    if parent_proc and new_proc:
                        session.execute_write(
                            insert_process_relationship, 
                            parent_proc, 
                            new_proc,
                            details 
                        )
                        nodes_created += 1
                        
                except Exception as e:
                    continue
    
    total_time = time.time() - start_time
    logger.info(f"Finished! Processed {total_records} logs in {total_time:.2f}s. Inserted {nodes_created} links.")
    return nodes_created

@app.route('/api/graph-data', methods=['GET'])
def get_graph_data():

    query = """
    MATCH (parent:Process)-[r:SPAWNED]->(child:Process)
    RETURN parent.path AS source, child.path AS target, properties(r) AS details
    LIMIT 500
    """
    
    nodes = set()
    links = []
    
    with driver.session() as session:
        results = session.run(query)
        for record in results:
            source = record["source"]
            target = record["target"]
            details = record["details"] 
            nodes.add(source)
            nodes.add(target)
            
            links.append({
                "source": source, 
                "target": target, 
                "details": details 
            })
            
    return jsonify({
        "nodes": [{"id": name, "group": 1} for name in nodes],
        "links": links
    })

@app.route('/api/parse-evtx', methods=['POST'])
def parse_evtx():
    logger.info("Received upload request")
    if 'evtxFile' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['evtxFile']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)
        try:
            count = parse_and_store_evtx(filepath)
            return jsonify({
                "status": "success", 
                "message": f"Processed {count} process creation events.",
                "filename": file.filename
            }), 200
        except Exception as e:
            logger.error(f"Parsing failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    logger.info("Server starting on port 8000...")
    app.run(debug=True, port=8000)