import importlib
import os
import pytest


def _load_ai_agent():
    # Re-import the module without any Gemini key so the tests exercise the validation logic.
    os.environ.pop('GEMINI_API_KEY', None)
    return importlib.import_module('services.ai_agent')


def test_classify_intent_requires_api_key():
    # This test guards the configuration check in the intent classifier.
    # If the API key is missing, the function should fail before attempting any external LLM call.
    ai = _load_ai_agent()
    with pytest.raises(ValueError):
        ai.classify_intent('hello')


def test_run_query_agent_requires_api_key():
    # This test verifies that query generation aborts when the environment is not configured.
    # The expectation is that the function raises a clear error rather than silently making a network request.
    ai = _load_ai_agent()
    with pytest.raises(ValueError):
        ai.run_query_agent('find failed logons', [], [])


def test_run_handler_agent_requires_api_key():
    # This test ensures the handler-generation path also enforces the same API-key guard.
    # The function is expected to fail early, before any Gemini call is executed.
    ai = _load_ai_agent()
    with pytest.raises(ValueError):
        ai.run_handler_agent('add handler', [], lambda n, a: {})
