import logging
import os

import requests

logger = logging.getLogger(__name__)

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
_HEADERS = {"Content-Type": "application/json"}


def _url() -> str:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")
    return f"{_BASE_URL}?key={key}"


def _text_from(response: requests.Response) -> str:
    return (
        response.json()
        .get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )


def generate(system: str, contents: list, temperature: float = 0.2, mime_type: str | None = None) -> str:
    gen_config: dict = {"temperature": temperature}
    if mime_type:
        gen_config["responseMimeType"] = mime_type

    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": gen_config,
    }

    response = requests.post(_url(), json=payload, headers=_HEADERS)
    response.raise_for_status()
    data = response.json()

    usage = data.get("usageMetadata", {})
    if usage:
        logger.info(
            f"Token usage — prompt: {usage.get('promptTokenCount')}, "
            f"output: {usage.get('candidatesTokenCount')}, "
            f"total: {usage.get('totalTokenCount')}"
        )

    return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def generate_with_tools(system: str, contents: list, tools: list, temperature: float = 0.0) -> list:
    """Send one forced tool-calling round. Returns the raw parts list."""
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "tools": tools,
        "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
        "generationConfig": {"temperature": temperature},
    }

    response = requests.post(_url(), json=payload, headers=_HEADERS)
    response.raise_for_status()
    return response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
