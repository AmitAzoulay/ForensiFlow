import logging
from neo4j import GraphDatabase

logger = logging.getLogger(__name__)

class Neo4jClient:
    def __init__(self, uri, user, password):
        """Initializes the Neo4j database driver."""
        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            logger.info("Successfully connected to Neo4j database.")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            raise

    def close(self):
        """Closes the database connection."""
        if self.driver:
            self.driver.close()

    def get_all_investigations(self):
        """Retrieves a list of all historical investigations."""
        query = """
        MATCH (i:Investigation) 
        RETURN i.case_id AS case_id, i.name AS name 
        ORDER BY i.created_at DESC
        """
        try:
            with self.driver.session() as session:
                results = session.run(query)
                return [{"case_id": r["case_id"], "name": r["name"]} for r in results]
        except Exception as e:
            logger.error(f"Database error during get_all_investigations: {e}")
            raise

    def get_case_graph(self, case_id):
        """Retrieves nodes and relationships for a specific case visualization."""
        query = """
        MATCH (n)-[r]->(m) 
        WHERE n.case_id = $case_id 
        RETURN n, r, m
        """
        nodes_dict = {}
        links = []
        
        try:
            with self.driver.session() as session:
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
            return {"nodes": list(nodes_dict.values()), "links": links}
        except Exception as e:
            logger.error(f"Database error during get_case_graph: {e}")
            raise

    def get_investigation_timeline(self, case_id, limit=500):
        """Retrieves a chronological timeline of events for AI analysis."""
        query = """
        MATCH (src)-[r]->(dst)
        WHERE src.case_id = $case_id
        RETURN labels(src)[0] AS src_type, src.name AS src_name, 
               type(r) AS action, r.timestamp AS time, 
               labels(dst)[0] AS dst_type, dst.name AS dst_name
        ORDER BY r.timestamp ASC
        LIMIT $limit
        """
        story_lines = []
        try:
            with self.driver.session() as session:
                results = session.run(query, case_id=case_id, limit=limit)
                for record in results:
                    line = f"[{record['time']}] {record['src_name']}->{record['action']}->{record['dst_name']}"
                    story_lines.append(line)
            return story_lines
        except Exception as e:
            logger.error(f"Database error during get_investigation_timeline: {e}")
            raise