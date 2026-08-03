export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export const apiService = {
    getInvestigations: async () => {
        const response = await fetch(`${API_BASE_URL}/investigations`);
        if (!response.ok) throw new Error('Failed to fetch investigations');
        return response.json();
    },

    getGraphData: async (caseId: string) => {
        const response = await fetch(`${API_BASE_URL}/graph-data?case_id=${caseId}`);
        if (!response.ok) throw new Error('Failed to fetch graph data');
        return response.json();
    },

    uploadEvtx: async (file: File, invName: string) => {
        const formData = new FormData();
        formData.append('evtxFile', file);
        formData.append('invName', invName);
        const response = await fetch(`${API_BASE_URL}/investigations`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error('Failed to parse EVTX file');
        return response.json();
    },

    deleteInvestigation: async (caseId: string) => {
        const response = await fetch(`${API_BASE_URL}/investigations/${caseId}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete investigation');
        return response.json();
    },

    reparseCase: async (caseId: string) => {
        const response = await fetch(`${API_BASE_URL}/reparse/${caseId}`, { method: 'POST' });
        if (!response.ok) throw new Error('Reparse failed');
        return response.json();
    },

    translateLog: async (caseId: string | null, details: Record<string, any>) => {
        const response = await fetch(`${API_BASE_URL}/translate-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_id: caseId, log_details: JSON.stringify(details, null, 2) }),
        });
        if (response.status === 429) throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
        if (!response.ok) throw new Error('Failed to translate log');
        return response.json() as Promise<{ reply?: string; error?: string }>;
    },

    saveEdited: async (oldCaseId: string, newName: string, nodes: any[], links: any[]) => {
        const response = await fetch(`${API_BASE_URL}/save-edited`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_case_id: oldCaseId,
                new_name: newName + ' (edited)',
                nodes,
                links,
            }),
        });
        if (!response.ok) throw new Error('Failed to save edited investigation');
        return response.json() as Promise<{ status: string }>;
    },

    generateForensicReport: async (nodes: any[], links: any[], analystNotes: string) => {
        const response = await fetch(`${API_BASE_URL}/generate-forensic-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodes, links, analyst_notes: analystNotes }),
        });
        if (!response.ok) throw new Error('Failed to generate report from server');
        return response.blob();
    },

    chatStream: async (
        caseId: string | null,
        forensicHistory: ChatMessage[],
        handlerHistory: ChatMessage[],
        viewContext: string,
    ): Promise<Response> => {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case_id: caseId,
                history: forensicHistory,
                handler_history: handlerHistory,
                view_context: viewContext,
            }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    },
};
