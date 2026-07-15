import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiService } from '../services/api';


function makeJsonResponse(ok: boolean, payload: unknown) {
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeJsonResponse(true, [{ case_id: 'c1', name: 'Case 1' }]),
    );

    const result = await apiService.getInvestigations();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ case_id: 'c1', name: 'Case 1' }]);
  });

  it('throws a readable error when graph data request fails', async () => {
    // This test checks the failure path so UI code can show a clear message.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    await expect(apiService.getGraphData('abc')).rejects.toThrow('Failed to fetch graph data');
  });

  it('sends chat payload and returns AI response', async () => {
    // This test verifies request payload shape and response handling for /chat.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeJsonResponse(true, { reply: 'ok' }),
    );

    const result = await apiService.chat('case-1', [{ role: 'user', content: 'hi' }], []);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual({ reply: 'ok' });
  });

  it('throws when uploadEvtx fails', async () => {
    // This test checks upload failure mapping to a readable error.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    const file = new File(['x'], 'sample.evtx', { type: 'application/octet-stream' });
    await expect(apiService.uploadEvtx(file, 'Investigation')).rejects.toThrow('Failed to parse EVTX file');
  });

  it('throws when translateLog fails', async () => {
    // This test checks translate endpoint failure handling.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    await expect(apiService.translateLog({ EventID: 1 })).rejects.toThrow('Failed to translate log');
  });

  it('throws when deleteInvestigation fails', async () => {
    // This test checks delete endpoint failure handling.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    await expect(apiService.deleteInvestigation('case-1')).rejects.toThrow('Failed to delete investigation');
  });

  it('throws when reparseCase fails', async () => {
    // This test checks reparse endpoint failure handling.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    await expect(apiService.reparseCase('case-1')).rejects.toThrow('Reparse failed');
  });

  it('throws when generateHandler fails', async () => {
    // This test checks handler generation endpoint failure handling.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    await expect(apiService.generateHandler('4624', 'desc')).rejects.toThrow('Failed to generate handler');
  });

  it('throws when sendChatMessage fails', async () => {
    // This test checks AI chat endpoint failure handling.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeJsonResponse(false, {}));

    await expect(apiService.sendChatMessage('case-1', [{ role: 'user', content: 'x' }])).rejects.toThrow(
      'Failed to communicate with AI service',
    );
  });
});
