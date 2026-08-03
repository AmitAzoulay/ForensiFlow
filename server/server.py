import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from database import Neo4jClient
from routes import register_routes

load_dotenv(Path(__file__).resolve().parent / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

os.makedirs('uploads', exist_ok=True)

db_client = Neo4jClient(
    uri=os.getenv("NEO4J_URI"),
    user=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD")
)

register_routes(app, db_client)

if __name__ == '__main__':
    port = int(os.getenv("PORT", 8000))
    logger.info(f"ForensiFlow API Server starting on port {port}...")
    app.run(debug=True, port=port, exclude_patterns=['*/ai_generated/*'])

