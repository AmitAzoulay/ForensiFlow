import logging
from neo4j import GraphDatabase

logger = logging.getLogger(__name__)

class Neo4jClient:
    def __init__(self, uri, user, password):
        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            logger.info("Successfully connected to Neo4j database.")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            raise

    def close(self):
        if self.driver:
            self.driver.close()

    def get_all_investigations(self):
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
                            "properties": dict(node_source),
                            "is_red": dict(node_source).get("is_red", False)
                        }
                    
                    target_id = node_target.element_id
                    if target_id not in nodes_dict:
                        nodes_dict[target_id] = {
                            "id": target_id, 
                            "label": list(node_target.labels)[0], 
                            "properties": dict(node_target),
                            "is_red": dict(node_target).get("is_red", False)
                        }
                        
                    links.append({
                        "id": rel.element_id,
                        "source": source_id, 
                        "target": target_id, 
                        "type": rel.type, 
                        "details": dict(rel),
                        "is_red": dict(rel).get("is_red", False)
                    })
            return {"nodes": list(nodes_dict.values()), "links": links}
        except Exception as e:
            logger.error(f"Database error during get_case_graph: {e}")
            raise

    def get_investigation_timeline(self, case_id, limit=500):
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

    def get_investigation_name(self, case_id):
        query = "MATCH (i:Investigation {case_id: $case_id}) RETURN i.name AS name LIMIT 1"
        try:
            with self.driver.session() as session:
                result = session.run(query, case_id=case_id).single()
                return result['name'] if result else 'Investigation'
        except Exception as e:
            logger.error(f"Database error during get_investigation_name: {e}")
            return 'Investigation'

    def delete_investigation(self, case_id):
        query = """
        MATCH (n {case_id: $case_id})
        DETACH DELETE n
        """
        try:
            with self.driver.session() as session:
                session.run(query, case_id=case_id)
        except Exception as e:
            logger.error(f"Database error during delete_investigation: {e}")
            raise

    def save_edited_graph(self, original_case_id, new_case_id, new_name, nodes, links):
        query_inv = "CREATE (i:Investigation {case_id: $new_case_id, name: $new_name, created_at: timestamp()})"
        
        nodes_list = nodes if nodes is not None else []
        links_list = links if links is not None else []
        
        logger.info(f"save_edited_graph called. original_case_id={original_case_id}, new_case_id={new_case_id}, new_name={new_name}")
        logger.info(f"Received nodes count: {len(nodes_list)}, links count: {len(links_list)}")
        
        if len(nodes_list) > 0:
            logger.info(f"Sample node payload: {nodes_list[0]}")
        else:
            logger.warning("Nodes list is empty!")
            
        if len(links_list) > 0:
            logger.info(f"Sample link payload: {links_list[0]}")
        else:
            logger.warning("Links list is empty!")
            
        try:
            with self.driver.session() as session:
                tx = session.begin_transaction()
                
                tx.run(query_inv, new_case_id=new_case_id, new_name=new_name)

                created_nodes_count = 0
                for n in nodes_list:
                    props = n.get("properties", {}) or {}
                    entity_id = n.get("id")
                    is_red = n.get("is_red", False)
                    label = n.get("label", "Unknown")
                    name_val = props.get("name", entity_id)

                    if not entity_id:
                        logger.warning(f"Node missing id! Raw node: {n}")
                        continue

                    q_node = f"""
                    CREATE (n:`{label}` {{case_id: $case_id, entity_id: $entity_id, name: $name, is_red: $is_red}})
                    """
                    res = tx.run(q_node, case_id=new_case_id, entity_id=entity_id, name=name_val, is_red=is_red)
                    summary = res.consume()
                    if summary.counters.nodes_created > 0:
                        created_nodes_count += 1

                    clean_props = {k: v for k, v in props.items() if k not in ["case_id", "entity_id", "name", "is_red"]}
                    set_clause = ", ".join([f"n.`{k}` = ${k}" for k in clean_props.keys()])
                    
                    if set_clause:
                        tx.run(f"MATCH (n {{case_id: $case_id, entity_id: $entity_id}}) SET {set_clause}", case_id=new_case_id, entity_id=entity_id, **clean_props)

                logger.info(f"Successfully created {created_nodes_count} nodes in Neo4j.")

                created_links_count = 0
                for l in links_list:
                    raw_source = l.get("source")
                    raw_target = l.get("target")
                    
                    if raw_source is None or raw_target is None:
                        logger.warning(f"Link missing source or target! Raw link: {l}")
                        continue
                        
                    source_id = raw_source.get("id") if isinstance(raw_source, dict) else raw_source
                    target_id = raw_target.get("id") if isinstance(raw_target, dict) else raw_target
                    
                    if not source_id or not target_id:
                        logger.warning(f"Could not resolve source_id ({source_id}) or target_id ({target_id}) from link: {l}")
                        continue

                    rel_type = l.get("type", "RELATED_TO")
                    details = l.get("details", {}) or {}
                    is_red = l.get("is_red", False)

                    q_link = f"""
                    MATCH (s {{case_id: $case_id, entity_id: $source_id}})
                    MATCH (t {{case_id: $case_id, entity_id: $target_id}})
                    CREATE (s)-[r:`{rel_type}` {{is_red: $is_red}}]->(t)
                    """
                    res = tx.run(q_link, case_id=new_case_id, source_id=source_id, target_id=target_id, is_red=is_red)
                    summary = res.consume()
                    
                    if summary.counters.relationships_created > 0:
                        created_links_count += 1
                        
                        clean_details = {k: v for k, v in details.items() if k not in ["is_red"]}
                        set_clause = ", ".join([f"r.`{k}` = ${k}" for k in clean_details.keys()])
                        
                        if set_clause:
                            tx.run(f"""
                            MATCH (s {{case_id: $case_id, entity_id: $source_id}})-[r:`{rel_type}`]->(t {{case_id: $case_id, entity_id: $target_id}})
                            SET {set_clause}
                            """, case_id=new_case_id, source_id=source_id, target_id=target_id, **clean_details)
                    else:
                        logger.warning(f"Link creation skipped: s={source_id}, t={target_id}. Node(s) not found in case {new_case_id}")

                logger.info(f"Successfully created {created_links_count} relationships in Neo4j.")
                tx.commit()
                logger.info("Transaction committed successfully.")
        except Exception as e:
            logger.error(f"Database error during save_edited_graph: {e}")
            raise