# Testing Plan

This document describes what ForensiFlow should test, how the tests should be structured, and where the boundaries are. The goal is to make the test suite useful for regression detection without requiring a live Neo4j instance, a running browser, or real EVTX samples for every check.

## Testing Basics

If you are new to testing, these terms matter most:

- A test is a small check that confirms code still behaves the way we expect.
- A unit test checks one small piece of logic in isolation.
- An integration-style test checks that a few pieces work together.
- A happy-path test checks the normal success case.
- A failure-path test checks what happens when something goes wrong.
- A mock is a fake version of a dependency such as Neo4j, fetch, or the file system.
- A fixture is sample input data used by a test.

In practice, most of our tests should be unit tests. That keeps them fast and easier to understand. We use mocks so the tests do not depend on a real database, live API, or browser unless we explicitly want that coverage.

## Goals

- Catch regressions in backend routes, database access, and EVTX parsing logic.
- Catch regressions in frontend state handling, query filtering, and API integration code.
- Keep most tests fast, deterministic, and isolated from external services.
- Reserve end-to-end coverage for a small number of high-value workflows.

## What Should Be Tested

### Backend

- Flask route behavior in [server/server.py](server/server.py).
- Input validation and error handling for upload, graph, investigation, chat, and handler-generation endpoints.
- Neo4j access logic in [server/database.py](server/database.py).
- EVTX parsing and data-shaping behavior in [server/services/evtx_parser.py](server/services/evtx_parser.py).
- AI and handler orchestration paths in [server/services/ai_agent.py](server/services/ai_agent.py) and [server/services/handlers/](server/services/handlers/).
- Helper logic that can be exercised without file I/O, network calls, or a real database.

### Frontend

- API client behavior in [client/src/services/api.ts](client/src/services/api.ts).
- Query tokenization, filter formatting, and other pure state logic in [client/src/App.tsx](client/src/App.tsx).
- Core user interactions in main components under [client/src/components/](client/src/components/), especially components that transform data or manage local state.
- Rendering decisions that depend on props, state, and fetched data.

## How Tests Should Work

### Backend Unit Tests

- Use `pytest` as the primary runner. This is the tool that finds and runs the tests.
- Mock `neo4j.GraphDatabase.driver` and session objects so database tests do not need a live graph database. These tests verify that the code sends the right queries and reads results correctly.
- Mock `requests`, file system writes, and parser side effects where needed. These tests verify the logic without actually calling outside services or changing real files.
- Use Flask’s test client for route-level tests so request/response behavior is exercised through the app object. These tests verify what each API endpoint returns when given specific input.
- Prefer small fixtures for request bodies, Neo4j records, and parsed event samples. Fixtures are just reusable sample inputs that make tests easier to read.

### Frontend Unit Tests

- Use `Vitest` with `React Testing Library` for component and UI logic tests. These tests check how the app behaves from a user point of view.
- Run in `jsdom`, allowing React components to render without a real browser inside Node.js.
- Mock `fetch` and the API service for network-dependent code. These tests verify the UI reacts correctly when the server responds or fails.
- Test state transitions and output rather than implementation details. That means we care about what the user sees or what data is returned, not every internal variable.

### Integration-Style Tests

- Add a limited number of tests that cover the full request path inside one layer. These tests make sure several parts still work together.
- For the backend, this means Flask routes with mocked dependencies. A route test sends a request to the app and checks the response.
- For the frontend, this means rendering a component with realistic props and asserting visible output or callbacks. That confirms the component behaves correctly when a user interacts with it.
- Avoid full browser automation unless a workflow is too complex to validate in unit form. Full browser tests are slower and harder to maintain, so we should use them sparingly.

## Suggested Coverage Areas

### Backend Coverage Targets

- `GET /api/investigations`: one test checks that a successful request returns investigations, and another checks that a database failure returns an error response.
- `GET /api/graph-data`: one test checks that missing `case_id` is rejected, and another checks that valid input returns graph payloads.
- `POST /api/parse-evtx`: one test checks the missing-file case, one checks an empty filename, and one checks the normal upload-and-parse path.
- `DELETE /api/investigations/<case_id>`: one test checks that deletion succeeds, and another checks that the route fails cleanly when the database has a problem.
- `POST /api/chat` and `POST /api/ai-chat`: tests check that the payload shape is accepted and that AI failure paths return predictable errors.
- `POST /api/generate-handler`: tests check generation inputs and sanitization rules so unsafe handler code is rejected.
- `Neo4jClient` methods: tests verify that queries are built correctly and that result records are mapped into the expected Python structures.

### Frontend Coverage Targets

- API functions in [client/src/services/api.ts](client/src/services/api.ts): one test verifies each request succeeds, and another verifies that a failed HTTP response becomes a readable error.
- Query parsing and filter formatting behavior in [client/src/App.tsx](client/src/App.tsx): tests confirm that user search text is split and interpreted the way the app expects.
- State reset and data-loading flows when switching investigations: tests confirm old data is cleared and new data becomes active.
- Components that depend on derived data, such as graph filters, log panels, timeline controls, and assistant panels: tests confirm the component shows the right output for a given set of props or state.

## What Not To Test Directly

- Do not unit test the Neo4j server itself. We only test our code, not the database product.
- Do not require the real EVTX parser to run against large production files in every test. That would make the suite slow and fragile.
- Do not assert on visual layout pixel-by-pixel. Tests should check behavior, not exact spacing or colors.
- Do not couple tests to unstable element structure when a role, label, or user-visible string is enough. This keeps tests readable and less brittle.
- Do not make every AI-related response deterministic if the code is intentionally generative; test the contract and fallback behavior instead. For AI features, we care that the app handles results safely, not that every sentence is identical.

## Limitations

- Some backend behavior depends on external systems such as Neo4j, file uploads, or AI services, so those paths must be mocked in unit tests. That means unit tests will not prove those external systems work; they only prove our code reacts correctly.
- The frontend graph visualization uses a third-party force graph library, so low-level canvas rendering should not be treated as a unit-test target. We can test the data fed into the graph, but not every pixel drawn by the library.
- Generated handler code is dynamic by nature; tests should focus on validation, registration, and execution safety rather than exact generated text. The important question is whether unsafe code is rejected and valid code is accepted.
- Data sets can be large, so tests should prefer minimal fixtures over full investigation exports. Smaller sample data is easier to maintain and faster to run.
- A few workflows are best validated in manual smoke tests or a separate end-to-end suite. Manual testing is useful for checking the overall experience, but it should not replace automated tests.

## Recommended Project Structure

### Backend

- `server/tests/`
  - `test_server_routes.py` (integration-style)
  - `test_database.py` (unit)
  - `test_evtx_parser.py` (unit)
  - `test_ai_agent.py` (unit)
  - `test_handlers.py` (unit)

### Frontend

- `client/src/__tests__/`
  - `api.test.ts` (unit)
  - `App.test.ts` (unit)
  - `components/*.test.tsx` (component)

## Tooling Recommendation

- Backend: `pytest`, `pytest-cov`, and `unittest.mock` or `pytest-mock`.
- Frontend: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom`.
- Optional API mocking: `msw` if fetch-heavy component tests grow beyond simple mocks.

## Execution Strategy

1. Run backend unit tests first because they are cheaper and cover the server-side contracts. These catch route and data-layer problems early.
2. Run frontend unit tests next because they validate the UI state machine and API client behavior. These catch broken interactions before you open a browser.
3. Add a small smoke test set for critical user journeys after both unit suites are stable. Smoke tests are quick checks that the main app flow still starts and responds.
4. Add coverage thresholds only after the initial suite is reliable, otherwise the thresholds will hide real failures behind setup noise. Coverage numbers are useful only after the test suite itself is trustworthy.

## Acceptance Criteria

- Core backend routes have happy-path and failure-path coverage.
- Core frontend state transitions and API methods have deterministic unit tests.
- External dependencies are mocked in unit tests.
- The suite can run locally without Neo4j, without a browser, and without network access.
- The document stays aligned with the actual test scripts as they are added.

## How To Run Tests

- Run all tests from the project root: `npm test`
- Run backend tests only: `npm run test:server`
- Run frontend tests only: `npm run test:client`
- Run frontend tests with coverage: `npm run test:client:coverage`

### Saving Test Results (JUnit / Coverage)

You can save test reports and coverage output for CI or later inspection. Example commands:

Backend (pytest + coverage + JUnit XML):
```bash
# from c:/project/ForensiFlow/server
venv\Scripts\python.exe -m pytest --junitxml=reports/junit.xml --cov=./ --cov-report=xml:reports/coverage.xml
```

Frontend (Vitest JUnit output):
```bash
# from c:/project/ForensiFlow/client
npx vitest run --reporter junit --outputFile=reports/vitest-junit.xml
```

Frontend (Vitest coverage output):
```bash
# from c:/project/ForensiFlow/client
npm run test:coverage
```

Combined artifacts can then be archived by your CI provider and inspected in pull requests.

## Tests Implemented Right Now (Explained)

The items below are the current tests already implemented in this repository.

### Backend: [server/tests/test_database.py](server/tests/test_database.py)

- `test_get_all_investigations_maps_rows_to_list`
  - Type: `unit`
  - What it checks: when the database returns rows, the client returns the expected list structure.
  - Why it matters: this protects API payload shape so the frontend keeps working.
- `test_get_investigation_name_returns_default_when_missing`
  - Type: `unit`
  - What it checks: if no record exists, the code returns the fallback name `Investigation`.
  - Why it matters: this prevents crashes or null-value bugs in routes that depend on a name.

### Backend: [server/tests/test_server_routes.py](server/tests/test_server_routes.py)

- `test_get_graph_data_requires_case_id`
  - Type: `integration-style`
  - What it checks: calling `GET /api/graph-data` without `case_id` returns HTTP 400.
  - Why it matters: validates required input and avoids unclear server behavior.
- `test_get_investigations_success`
  - Type: `integration-style`
  - What it checks: `GET /api/investigations` after stubbing the database call returns data.
  - Why it matters: confirms the normal API path works.
- `test_get_investigations_failure`
  - Type: `integration-style`
  - What it checks: `GET /api/investigations` when the DB helper raises an exception returns a server error.
  - Why it matters: confirms failure handling is stable and predictable.
- `test_parse_evtx_requires_file_part`
  - Type: `integration-style`
  - What it checks: `POST /api/parse-evtx` with no uploaded file returns HTTP 400.
  - Why it matters: protects the parser route from malformed requests.
- `test_parse_evtx_rejects_empty_filename`
  - Type: `integration-style`
  - What it checks: `POST /api/parse-evtx` with an empty filename returns HTTP 400.
  - Why it matters: rejects malformed uploads before parsing starts.
- `test_get_graph_data_db_failure`
  - Type: `integration-style`
  - What it checks: `GET /api/graph-data?case_id=case-1` when the DB helper raises an exception returns an error.
  - Why it matters: covers the graph lookup failure path.
- `test_ai_chat_requires_case_id_and_history`
  - Type: `integration-style`
  - What it checks: `POST /api/ai-chat` with missing `case_id` or empty history returns HTTP 400.
  - Why it matters: validates required AI chat input.
- `test_ai_chat_returns_no_data_message`
  - Type: `integration-style`
  - What it checks: `POST /api/ai-chat` with a valid payload and an empty timeline returns a no-data reply.
  - Why it matters: handles the empty-timeline AI chat branch.
- `test_ai_chat_http_429_maps_to_429_reply`
  - Type: `integration-style`
  - What it checks: `POST /api/ai-chat` when the provider raises HTTP 429 returns a stable rate-limit reply.
  - Why it matters: maps provider rate limits to a stable API response.
- `test_delete_investigation_failure`
  - Type: `integration-style`
  - What it checks: `DELETE /api/investigations/case-1` when the DB helper raises an exception returns an error.
  - Why it matters: covers delete failure handling.
- `test_generate_handler_requires_numeric_event_id`
  - Type: `integration-style`
  - What it checks: `POST /api/generate-handler` with a non-numeric `event_id` returns HTTP 400.
  - Why it matters: rejects invalid handler-generation input.
- `test_parse_evtx_success_uses_stubbed_uuid_and_no_real_save`
  - Type: `integration-style`
  - What it checks: `POST /api/parse-evtx` with a valid file while UUID generation and file save are stubbed succeeds deterministically.
  - Why it matters: keeps the upload-and-parse path deterministic.

### Backend: [server/tests/test_server_helpers.py](server/tests/test_server_helpers.py)

- `test_extract_reasoning_reads_leading_comment_block`
  - Type: `unit`
  - What it checks: leading comment lines are extracted from generated handler code.
  - Why it matters: keeps handler explanation features reliable.
- `test_summarize_handler_lists_relationships`
  - Type: `unit`
  - What it checks: relationship summaries include source label, target label, and relation type.
  - Why it matters: analysts get understandable summaries of generated handlers.
- `test_validate_handler_ast_accepts_safe_code`
  - Type: `unit`
  - What it checks: validator accepts code that follows the allowed handler pattern.
  - Why it matters: proves valid handler generation will not be blocked.
- `test_validate_handler_ast_rejects_import_statement`
  - Type: `unit`
  - What it checks: validator rejects unsafe `import` usage.
  - Why it matters: this is a security test that blocks dangerous generated code.

### Backend: [server/tests/test_evtx_parser.py](server/tests/test_evtx_parser.py)

- `test_interpret_value_translates_known_codes`
  - Type: `unit`
  - What it checks: known status codes are translated to analyst-friendly text.
  - Why it matters: keeps parser output readable and consistent.
- `test_interpret_details_filters_private_keys`
  - Type: `unit`
  - What it checks: internal/private keys are excluded from interpreted details.
  - Why it matters: avoids leaking implementation-only metadata in processed event output.
- `test_process_event_logic_calls_handler`
  - Type: `unit`
  - What it checks: event dispatch reaches the expected handler for a matching event ID.
  - Why it matters: ensures event parser routing works.

### Backend: [server/tests/test_ai_agent.py](server/tests/test_ai_agent.py)

- `test_classify_intent_requires_api_key`
  - Type: `unit`
  - What it checks: intent classification fails fast if API key is missing.
  - Why it matters: prevents hidden runtime failures and clarifies configuration errors.
- `test_run_query_agent_requires_api_key`
  - Type: `unit`
  - What it checks: query agent fails fast if API key is missing.
  - Why it matters: gives predictable error behavior when environment setup is incomplete.
- `test_run_handler_agent_requires_api_key`
  - Type: `unit`
  - What it checks: handler agent fails fast if API key is missing.
  - Why it matters: protects server behavior under missing-secret conditions.

### Backend: [server/tests/test_handlers.py](server/tests/test_handlers.py)

- `test_tool_executor_unknown_returns_error`
  - Type: `unit`
  - What it checks: unknown tool names are rejected with an error response.
  - Why it matters: keeps tool invocation paths safe and predictable.
- `test_get_available_relations_includes_builtin`
  - Type: `unit`
  - What it checks: built-in relations are always present in the available relation list.
  - Why it matters: query-generation features depend on this baseline relation set.

### Frontend: [client/src/__tests__/api.test.ts](client/src/__tests__/api.test.ts)

- `returns investigations when the server responds with success`
  - Type: `unit`
  - What it checks: `apiService.getInvestigations()` returns parsed data on success.
  - Why it matters: proves frontend data loading works in the normal case.
- `throws a readable error when graph data request fails`
  - Type: `unit`
  - What it checks: failed `getGraphData` responses throw a clear error.
  - Why it matters: UI can show useful failure feedback instead of silent failure.
- `sends chat payload and returns AI response`
  - Type: `unit`
  - What it checks: chat requests are sent with the right method/headers and return parsed response.
  - Why it matters: protects the contract between UI and backend chat API.
- `throws when uploadEvtx fails`
  - Type: `unit`
  - What it checks: failed upload responses are mapped to a readable EVTX parsing error.
  - Why it matters: keeps upload failures understandable for the user.
- `throws when translateLog fails`
  - Type: `unit`
  - What it checks: failed translate responses are mapped to a readable translation error.
  - Why it matters: preserves predictable error handling for log translation.
- `throws when deleteInvestigation fails`
  - Type: `unit`
  - What it checks: failed delete responses are mapped to a readable investigation deletion error.
  - Why it matters: prevents silent failures when removing an investigation.
- `throws when reparseCase fails`
  - Type: `unit`
  - What it checks: failed reparse responses are mapped to a readable reparse error.
  - Why it matters: keeps case reprocessing failures visible.
- `throws when generateHandler fails`
  - Type: `unit`
  - What it checks: failed handler-generation responses are mapped to a readable generation error.
  - Why it matters: protects the handler-generation workflow from silent failure.
- `throws when sendChatMessage fails`
  - Type: `unit`
  - What it checks: failed AI chat responses are mapped to a readable AI communication error.
  - Why it matters: keeps AI chat failures understandable.

### Frontend: [client/src/__tests__/App.test.ts](client/src/__tests__/App.test.ts)

- `tokenizes logical query operators and terms`
  - Type: `unit`
  - What it checks: user query text is split into structured tokens.
  - Why it matters: graph filtering depends on correct token parsing.
- `parses hexadecimal strings into numbers`
  - Type: `unit`
  - What it checks: hex values like `0x10` are converted correctly.
  - Why it matters: many Windows event values are represented in hex.
- `adds human-readable meaning to status codes`
  - Type: `unit`
  - What it checks: known status codes are translated to analyst-friendly text.
  - Why it matters: improves interpretability of filtered event details.
- `supports parentheses and NOT tokenization`
  - Type: `unit`
  - What it checks: advanced boolean query syntax is split into control tokens correctly.
  - Why it matters: keeps complex query expressions working.
- `keeps unknown status values unchanged`
  - Type: `unit`
  - What it checks: unmapped status values fall through unchanged.
  - Why it matters: avoids incorrect translations for unknown codes.
- `formats access mask values with interpreted permissions`
  - Type: `unit`
  - What it checks: access mask values are decoded into readable permission text.
  - Why it matters: improves analyst interpretation of object access events.
- `returns null for invalid numeric value parsing`
  - Type: `unit`
  - What it checks: invalid numeric strings are rejected cleanly.
  - Why it matters: prevents bad input from producing misleading numbers.

## Coverage Snapshot (2026-07-15)

The metrics below are from local test runs in this workspace.

 - Backend tests: `26/26 passed` (`100%` pass rate).
 - Frontend tests: `16/16 passed` (`100%` pass rate).
 - Backend line coverage (pytest-cov, all server Python files): `41%` total.
 - Frontend coverage (Vitest + v8):
   - Statements: `8.67%`
   - Branches: `58.66%`
   - Functions: `37.5%`
   - Lines: `8.67%`
 - Test LOC footprint:
   - Backend tests total LOC: `264`
   - Backend source total LOC: `1987`
   - Backend test/source LOC ratio: `13.29%`
   - Frontend tests total LOC: `124`
   - Frontend source total LOC: `3612`
   - Frontend test/source LOC ratio: `3.43%`
 - Test LOC by file (with suite percentage):
   - `server/tests/test_database.py`: `42` (`15.91%` of backend test LOC)
   - `server/tests/test_server_routes.py`: `112` (`42.42%` of backend test LOC)
   - `server/tests/test_server_helpers.py`: `49` (`18.56%` of backend test LOC)
   - `server/tests/test_evtx_parser.py`: `27` (`10.23%` of backend test LOC)
   - `server/tests/test_ai_agent.py`: `18` (`6.82%` of backend test LOC)
   - `server/tests/test_handlers.py`: `16` (`6.06%` of backend test LOC)
   - `client/src/__tests__/api.test.ts`: `75` (`60.48%` of frontend test LOC)
   - `client/src/__tests__/App.test.ts`: `49` (`39.52%` of frontend test LOC)

Notes:
 - Frontend coverage is now instrumented with `@vitest/coverage-v8`.
 - Current frontend percentages are still low because large UI/component files remain mostly untested.

## Improving Quality Signals (Practical Plan)

These are the four signals we should improve and how to do it.

What is now implemented in this repository:

 - Deterministic inputs:
   - Backend env defaults are set per test via `server/tests/conftest.py`.
   - A deterministic UUID/file-save example test exists in `server/tests/test_server_routes.py`.
 - Deterministic time and async behavior:
   - Frontend global test cleanup now resets timers and clears pending timers in `client/src/test/setup.ts`.
 - Deterministic isolation:
   - Frontend global cleanup restores mocks after each test in `client/src/test/setup.ts`.
   - Backend tests use pytest fixtures/monkeypatch isolation.
 - Stable failure diagnostics:
   - Route/API tests assert explicit status codes and error messages for failure paths.
 - Flaky test policy:
   - Tracking template added at `test-flaky.md`.
### 1. Branch Coverage
- Why it matters: branch coverage catches missed `if/else` and error-path behavior that line coverage can miss.
- How to improve fast:
  - Add route failure and edge-case tests for backend endpoints in `server/server.py`.
  - Add parser tests for uncommon event payload variants in `server/services/evtx_parser.py`.

### 2. Line Coverage

- Why it matters: line coverage shows how much of the executable code was touched by tests.
- How to improve fast:
  - Add unit tests for extracted helper functions (especially from large files like `client/src/App.tsx`).
  - Add component tests for `GraphFilters`, `LogPanel`, and `AIAssistant` with mocked props/data.
  - Add backend tests for currently untested branches in `ai_agent.py` and upload/report routes.

### 3. Test Pass/Fail Stability

- Why it matters: flaky tests reduce trust and slow releases.
- How to improve:
  - Keep tests deterministic: no real network, no real time sleeps, fixed fixtures.
  - Mock all external dependencies consistently.
  - Run `npm test` and `npm run test:client:coverage` locally before merge.
  - Track flaky tests in an issue label like `test-flaky` and fix quickly.

Detailed practice for pass/fail stability:

- Deterministic inputs:
  - Use fixed test data and avoid random values unless seeded.
  - If UUIDs/timestamps are needed, stub them with fixed values in tests.
- Deterministic time and async behavior:
  - Use fake timers for timer-based logic.
  - Avoid race-prone assertions; wait for expected state transitions explicitly.
- Deterministic isolation:
  - One test should not depend on side effects from another test.
  - Reset mocks and shared state (`vi.restoreAllMocks`, fresh fixtures per test).
- Stable failure diagnostics:
  - Assert on precise error messages/status codes where possible.
  - Keep test names descriptive so failures map directly to behavior.
- Flaky test policy:
  - If a test fails intermittently, tag it as flaky immediately and prioritize fixing root cause.
  - Avoid leaving flaky tests in the required pipeline for long periods.

