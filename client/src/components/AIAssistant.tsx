import React, { useState, useRef, useEffect } from 'react';
import { apiService, type ChatMessage } from "../services/api";
import { useDrag } from '../hooks/useDrag';
import './AIAssistant.css';

interface AIAssistantProps {
    caseId: string | null;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ caseId }) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const { position, isDragging, handleMouseDown } = useDrag();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen && messages.length === 0 && caseId) {
            handleSendMessage("Provide a single-paragraph forensic summary of this investigation.");
        }
    }, [isOpen, caseId]);

    const handleSendMessage = async (textOverride?: string) => {
        const textToProcess = textOverride || inputValue;
        if (!textToProcess.trim() || !caseId) return;

        const newUserMsg: ChatMessage = { role: 'user', content: textToProcess };
        const updatedMessages = [...messages, newUserMsg];

        setMessages(updatedMessages);
        setInputValue('');
        setIsLoading(true);

        try {
            const data = await apiService.sendChatMessage(caseId, updatedMessages);
            if (data.reply) {
                setMessages(prev => [...prev, { role: 'ai', content: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'ai', content: `Error: ${data.error}` }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'ai', content: 'Error connecting to ForensiFlow AI server.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button className="ai-toggle-btn" onClick={() => setIsOpen(true)}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <path d="M12 7v6"></path>
                    <path d="M12 17h.01"></path>
                </svg>
            </button>
        );
    }

    return (
        <div
            className="ai-container"
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
        >
            <div
                className={`ai-header ${isDragging ? 'dragging' : ''}`}
                onMouseDown={handleMouseDown}
            >
                <div className="ai-header-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                    <h3>ForensiFlow AI</h3>
                </div>
                <button className="ai-close-btn" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div className="ai-chat-area">
                {messages.length === 0 && !isLoading && (
                    <div className="ai-placeholder">
                        I have access to the chronological graph logs. Ask me to investigate specific users, processes, or create a summary.
                    </div>
                )}

                {messages.map((msg, idx) => {
                    if (idx === 0 && msg.content.includes("single-paragraph forensic summary")) return null;

                    return (
                        <div key={idx} className={`ai-message ${msg.role}`}>
                            {msg.content}
                        </div>
                    );
                })}

                {isLoading && <div className="ai-loading">Analyzing...</div>}
                <div ref={messagesEndRef} />
            </div>

            <div className="ai-input-area">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={caseId ? "Ask about the investigation..." : "Load a case first"}
                    disabled={!caseId || isLoading}
                    className="ai-input"
                />
                <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || !caseId || isLoading}
                    className="ai-send-btn"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default AIAssistant;