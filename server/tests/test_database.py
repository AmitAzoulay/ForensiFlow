from database import Neo4jClient


class FakeSession:
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
    def __init__(self, run_result):
        self._run_result = run_result

    def session(self):
        return FakeSession(self._run_result)


def test_get_all_investigations_maps_rows_to_list():
    # This test proves that raw DB rows become the response shape the API expects.
    rows = [
        {"case_id": "c1", "name": "Case 1"},
        {"case_id": "c2", "name": "Case 2"},
    ]
    client = Neo4jClient.__new__(Neo4jClient)
    client.driver = FakeDriver(rows)

    result = client.get_all_investigations()

    assert result == rows


def test_get_investigation_name_returns_default_when_missing():
    # This test verifies the fallback value used when no investigation is found.
    class NoResultSession(FakeSession):
        def run(self, query, **kwargs):
            class Empty:
                def single(self):
                    return None

            return Empty()

    class NoResultDriver:
        def session(self):
            return NoResultSession(None)

    client = Neo4jClient.__new__(Neo4jClient)
    client.driver = NoResultDriver()

    result = client.get_investigation_name("missing")

    assert result == "Investigation"
