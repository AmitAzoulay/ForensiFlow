import os
import random

import pytest


@pytest.fixture(autouse=True)
def deterministic_test_env(monkeypatch):
    # Keep tests deterministic and independent from developer machine env.
    # We set a fixed hash seed so Python iteration order stays predictable across runs.
    monkeypatch.setenv("PYTHONHASHSEED", "0")
    # The random module is seeded too so any randomness in the application is reproducible.
    random.seed(0)

    # Provide stable defaults for server imports that rely on env configuration.
    # These are local placeholders and are only used so imports succeed in isolated tests.
    monkeypatch.setenv("NEO4J_URI", "bolt://localhost:7687")
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "test")

    # Yield to the test while keeping the environment consistent for the duration of the test.
    yield
