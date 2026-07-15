import os
import random

import pytest


@pytest.fixture(autouse=True)
def deterministic_test_env(monkeypatch):
    # Keep tests deterministic and independent from developer machine env.
    monkeypatch.setenv("PYTHONHASHSEED", "0")
    random.seed(0)

    # Provide stable defaults for server imports that rely on env configuration.
    monkeypatch.setenv("NEO4J_URI", "bolt://localhost:7687")
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "test")

    yield
