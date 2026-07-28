import importlib
import os
import pytest

def _load_ai_agent():
    os.environ.pop('GEMINI_API_KEY', None)
    return importlib.import_module('services.ai_agent')


def test_classify_intent_requires_api_key():
    ai = _load_ai_agent()
    with pytest.raises(ValueError):
        ai.classify_intent('hello')


def test_run_query_agent_requires_api_key():
    ai = _load_ai_agent()
    with pytest.raises(ValueError):
        ai.run_query_agent('find failed logons', [], [])


def test_run_handler_agent_requires_api_key():
    ai = _load_ai_agent()
    with pytest.raises(ValueError):
        ai.run_handler_agent('add handler', [], lambda n, a: {})
