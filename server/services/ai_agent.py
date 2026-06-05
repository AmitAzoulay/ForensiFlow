import os
import requests
import logging

logger = logging.getLogger(__name__)

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