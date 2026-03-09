const API_BASE_URL = 'http://localhost:8000/api';

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

        const response = await fetch(`${API_BASE_URL}/parse-evtx`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Failed to parse EVTX file');
        return response.json();
    },

    sendChatMessage: async (caseId: string, history: ChatMessage[]) => {
        const response = await fetch(`${API_BASE_URL}/ai-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_id: caseId, history })
        });

        if (!response.ok) throw new Error('Failed to communicate with AI service');
        return response.json();
    }
};