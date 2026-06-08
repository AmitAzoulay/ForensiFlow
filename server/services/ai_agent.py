import os
import requests
import logging

logger = logging.getLogger(__name__)

def translate_single_log(log_details):
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        return "API Key is missing."

    system_prompt = "INSTRUCTION: Briefly explain this Windows event log in one simple sentence in English. No technical jargon. CRITICAL: Do not suggest next steps."
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": f"Telemetry: {log_details}"}]}],
        "generationConfig": {"temperature": 0.2}
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code == 429:
            raise Exception("RATE_LIMIT")
            
        response.raise_for_status() 
        response_data = response.json()
        
        return response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating translation.").strip()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during single log translation: {e}")
        raise
    
def generate_forensic_response(timeline_lines, chat_history):
    """
    Generates an AI response based on the forensic timeline and user chat history.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Returning mock response.")
        return "**[MOCK AI RESPONSE]**\n\nNo API Key found. Please add GEMINI_API_KEY to your .env file."

    # Build the context from the database timeline
    context_story = "\n".join(timeline_lines)

    system_prompt = f"""You are 'ForensiFlow AI', an expert DFIR assistant.
Review the following chronological event logs from the graph:

{context_story}

INSTRUCTIONS:
1. Base your answers ONLY on the logs provided.
2. If the user asks for a summary, provide a SINGLE, dense, concise paragraph. No bullet points.
3. For all other chat messages, answer naturally like a helpful forensic analyst discussing the case.
4. Focus on anomalies, lateral movement, and persistence.
5. ALWAYS end your response with a "🔍 Suggested Next Steps:" section, offering 1-2 concrete investigative actions the user can take within a graph database based on the current context.
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}
    
    # Format chat history for the Gemini API format
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
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        response_data = response.json()
        ai_reply = response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating response.")
        
        return ai_reply.strip()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during AI generation: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during AI generation: {e}")
        raise


def generate_report_narrative(evidence_list):
    """
    Generates an executive summary and narrative report based on flagged (red) events.
    """
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Returning mock narrative.")
        return "**[MOCK NARRATIVE]**\n\nThe AI could not generate a narrative because the API key is missing."

    # 1. ממירים את רשימת המילונים (הראיות) לטקסט קריא עבור ה-AI
    evidence_text = ""
    for i, ev in enumerate(evidence_list, 1):
        evidence_text += f"Event {i}: [{ev.get('Timestamp', 'N/A')}] {ev.get('Source Entity', 'Unknown')} -> {ev.get('Action/Type', 'Unknown')} -> {ev.get('Target Entity', 'Unknown')} (Event ID: {ev.get('Event ID', 'N/A')})\n"

    # 2. מגדירים ל-AI בדיוק מה התפקיד שלו בדוח הזה
    system_prompt = """You are an elite DFIR analyst. 
Your task is to write an "Executive Summary & Chronological Narrative" based on the provided flagged logs.
1. Start with a short paragraph summarizing the suspected attack (e.g., Lateral Movement, Persistence).
2. Write a chronological story of what happened based on the events. 
3. Keep it professional, objective, and easy to read for management. Do not use Markdown formatting (like ** or #), just plain text with line breaks."""

    user_prompt = f"Here are the flagged events in chronological order:\n\n{evidence_text}\n\nPlease generate the narrative report."

    # 3. מכינים את הבקשה ל-Gemini API (בדיוק כמו בפונקציה השנייה שלך)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2}
    }
    
    # 4. שולחים את הבקשה ומחזירים את הטקסט
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status() 
        
        response_data = response.json()
        narrative = response_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Error generating narrative.")
        
        return narrative.strip()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"HTTP request failed during narrative generation: {e}")
        return "Error: Could not generate narrative due to API connection issue."
    except Exception as e:
        logger.error(f"Unexpected error during narrative generation: {e}")
        return "Error: An unexpected error occurred while generating the narrative."