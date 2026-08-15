from database import Neo4jClient


class FakeSession:
    # A minimal standalone Neo4j session stub that records queries and returns a canned result.
    def __init__(self, run_result):
        self._run_result = run_result
        self.calls = []

    def run(self, query, **kwargs):
        self.calls.append((query, kwargs))
        return self._run_result

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeDriver:
    # A simple fake driver used to exercise database methods without connecting to a real Neo4j instance.
    def __init__(self, run_result):
        self._run_result = run_result

    def session(self):
        return FakeSession(self._run_result)


def test_get_all_investigations_maps_rows_to_list():
    # This test verifies that raw Neo4j rows are returned in a flat list format the API can consume.
    # We use a fake driver and assert the method preserves the row contents exactly.
    rows = [
        {"case_id": "c1", "name": "Case 1"},
        {"case_id": "c2", "name": "Case 2"},
    ]
    # We inject the fake driver manually so the test exercises the method without a live Neo4j instance.
    client = Neo4jClient.__new__(Neo4jClient)
    client.driver = FakeDriver(rows)

    # The method should return the fake rows just as the API expects them.
    result = client.get_all_investigations()

    assert result == rows


def test_get_investigation_name_returns_default_when_missing():
    # This test covers the fallback path when a query returns no record.
    # The method should still return a human-friendly default instead of failing or returning None.
    class NoResultSession(FakeSession):
        def run(self, query, **kwargs):
            class Empty:
                def single(self):
                    return None

            return Empty()

    class NoResultDriver:
        def session(self):
            return NoResultSession(None)

    # We simulate a missing investigation record so the fallback logic is exercised.
    client = Neo4jClient.__new__(Neo4jClient)
    client.driver = NoResultDriver()

    # If no matching investigation is found, the method should fall back to a generic name.
    result = client.get_investigation_name("missing")

    assert result == "Investigation"
