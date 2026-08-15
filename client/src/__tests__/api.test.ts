import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiService, API_BASE_URL } from '../services/api';


function makeJsonResponse(ok: boolean, payload: unknown) {
  // Keep response stubs minimal: only fields used by apiService are included.
  return {
    ok,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}


describe('apiService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns investigations when the server responds with success', async () => {
    // This test checks the happy path of fetching investigations.
    // We stub fetch to return one investigation object as if it came from the backend.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeJsonResponse(true, [{ case_id: 'c1', name: 'Case 1' }]),
    );

    // Execute the API helper exactly as the UI would call it.
    const result = await apiService.getInvestigations();

    // Verify one network call happened and that parsed JSON is passed through unchanged.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ case_id: 'c1', name: 'Case 1' }]);
  });

  it('throws a readable error when graph data request fails', async () => {
    // This test checks the failure path so UI code can show a clear message.
    // Simulate a non-OK HTTP response.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // The helper should throw the explicit error string used by the UI layer.
    await expect(apiService.getGraphData('abc')).rejects.toThrow('Failed to fetch graph data');
  });

  it('sends chat payload and returns AI response', async () => {
    // This test verifies request payload shape and response handling for /chat via chatStream.
    // Mock a successful response object whose json() resolves to a tiny payload.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeJsonResponse(true, { reply: 'ok' }),
    );

    // Call the streaming helper with minimal histories and then parse the mocked body.
    const resp = await apiService.chatStream('case-1', [{ role: 'user', content: 'hi' }], [], '');
    const result = await resp.json();

    // Ensure endpoint, HTTP method, and content-type are set correctly.
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/chat`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    // The helper should return the same response object content.
    expect(result).toEqual({ reply: 'ok' });
  });

  it('throws when uploadEvtx fails', async () => {
    // This test checks upload failure mapping to a readable error.
    // Simulate backend upload rejection.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // Build a realistic .evtx file payload for the request.
    const file = new File(['x'], 'sample.evtx', { type: 'application/octet-stream' });
    // Verify the helper maps non-OK responses to a stable error message.
    await expect(apiService.uploadEvtx(file, 'Investigation')).rejects.toThrow('Failed to parse EVTX file');
  });

  it('throws when translateLog fails', async () => {
    // This test checks translate endpoint failure handling.
    // Simulate a failed translation request.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // The wrapper should throw the route-specific error text.
    await expect(apiService.translateLog('case-1', { EventID: 1 })).rejects.toThrow('Failed to translate log');
  });

  it('throws when deleteInvestigation fails', async () => {
    // This test checks delete endpoint failure handling.
    // Simulate delete failure from the backend.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // The helper must surface a clear delete failure error.
    await expect(apiService.deleteInvestigation('case-1')).rejects.toThrow('Failed to delete investigation');
  });

  it('throws when reparseCase fails', async () => {
    // This test checks reparse endpoint failure handling.
    // Simulate non-OK response from reparse endpoint.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // The wrapper should throw the dedicated reparse error.
    await expect(apiService.reparseCase('case-1')).rejects.toThrow('Reparse failed');
  });

  it('throws when generateForensicReport fails', async () => {
    // This test checks report generation endpoint failure handling.
    // Mock backend error while generating report artifact.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // Even with empty evidence, the failure should map to the same user-facing message.
    await expect(apiService.generateForensicReport([], [], 'notes')).rejects.toThrow('Failed to generate report from server');
  });

  it('throws when chatStream fails', async () => {
    // This test checks AI chat streaming failure handling.
    // Simulate a failed /chat request.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    // We intentionally assert only that an error is thrown, regardless of exact message text.
    await expect(apiService.chatStream('case-1', [{ role: 'user', content: 'x' }], [], '')).rejects.toThrow();
  });
});
