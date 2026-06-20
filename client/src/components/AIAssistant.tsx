import React, { useState, useRef, useEffect } from 'react';
import { apiService, type ChatMessage } from "../services/api";
import { useDrag } from '../hooks/useDrag';
import './AIAssistant.css';

interface AIAssistantProps {
    caseId: string | null;
    externalPrompt?: { text: string; timestamp: number } | null;
    onReparseComplete?: () => Promise<void>;
}


const renderMessageContent = (content: string) => {
    const parts = content.split(/(```(?:python)?\n[\s\S]*?```)/g);
    return parts.map((part, i) => {
        const codeMatch = part.match(/```(?:python)?\n([\s\S]*?)```/);
        if (codeMatch) {
            return <pre key={i} className="ai-code-block">{codeMatch[1].trimEnd()}</pre>;
        }
        return <span key={i}>{part}</span>;
    });
};

const AIAssistant: React.FC<AIAssistantProps> = ({ caseId, externalPrompt, onReparseComplete }) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [handlerHistory, setHandlerHistory] = useState<ChatMessage[]>([]);
    const [forensicHistory, setForensicHistory] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pendingReparse, setPendingReparse] = useState<boolean>(false);

    const { position, isDragging, handleMouseDown } = useDrag();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (externalPrompt && externalPrompt.text && caseId) {
            setIsOpen(true);
            handleSendMessage(externalPrompt.text);
        }
    }, [externalPrompt, caseId]);

    const handleReparse = async () => {
        if (!caseId || !onReparseComplete) return;
        setPendingReparse(false);
        setIsLoading(true);
        try {
            await apiService.reparseCase(caseId);
            await onReparseComplete();
        } catch {
            setMessages(prev => [...prev, { role: 'ai', content: 'Reparse failed. Check the server logs.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async (textOverride?: string) => {
        const textToProcess = textOverride || inputValue;
        if (!textToProcess.trim()) return;

        const newUserMsg: ChatMessage = { role: 'user', content: textToProcess };
        setMessages(prev => [...prev, newUserMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const data = await apiService.chat(
                caseId,
                [...forensicHistory, newUserMsg],
                [...handlerHistory, newUserMsg]
            );

            let aiContent: string;

            if (data.intent === 'handler_agent') {
                aiContent = data.summary ?? 'Done.';
                setHandlerHistory(prev => [...prev, newUserMsg, { role: 'ai', content: aiContent }]);
                setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);
                if (data.needs_reparse && caseId && onReparseComplete) setPendingReparse(true);
                return;
            } else {
                aiContent = data.reply ?? `Error: ${data.error}`;
                setForensicHistory(prev => [...prev, newUserMsg, { role: 'ai', content: aiContent }]);
                setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);
            }
        } catch (error: any) {
            if (error?.response?.status === 429 || error?.message?.includes('429')) {
                setMessages(prev => [...prev, { role: 'ai', content: 'AI is overloaded right now. Please wait 60 seconds and try again.' }]);
            } else {
                setMessages(prev => [...prev, { role: 'ai', content: 'Error connecting to ForensiFlow AI server.' }]);
            }
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
                        <p><strong>Forensic analysis</strong> — ask about users, processes, lateral movement, or request a summary.</p>
                        <p><strong>Add handlers</strong> — e.g. "add handlers for events 4624, 4625, and 4648 to track logon activity".</p>
                        <p><strong>Remove handlers</strong> — e.g. "remove the dcsync handler and the account enabled handler".</p>
                        <p><strong>List / explain</strong> — "list handlers" or "explain the logon handler".</p>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    let displayContent = msg.content;
                    if (msg.role === 'user' && msg.content.includes("TACTICAL ANALYSIS REQUIRED:")) {
                        displayContent = "🔍 Analyzing selected item...";
                    }
                    return (
                        <div key={idx} className={`ai-message ${msg.role}`}>
                            {renderMessageContent(displayContent)}
                        </div>
                    );
                })}

                {pendingReparse && !isLoading && (
                    <div className="ai-reparse-prompt">
                        <span>Apply this change to the current investigation?</span>
                        <div className="ai-reparse-actions">
                            <button className="ai-reparse-yes" onClick={handleReparse}>Reparse</button>
                            <button className="ai-reparse-skip" onClick={() => setPendingReparse(false)}>Skip</button>
                        </div>
                    </div>
                )}

                {isLoading && <div className="ai-loading">Thinking...</div>}
                <div ref={messagesEndRef} />
            </div>

            <div className="ai-input-area">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder=""
                    disabled={isLoading}
                    className="ai-input"
                />
                <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isLoading}
                    className="ai-send-btn"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default AIAssistant;
