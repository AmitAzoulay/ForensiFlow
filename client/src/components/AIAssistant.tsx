import React, { useState, useRef, useEffect } from 'react';
import { apiService, type ChatMessage } from "../services/api";
import { useDrag } from '../hooks/useDrag';
import './AIAssistant.css';

interface AIAssistantProps {
    caseId: string | null;
    externalPrompt?: { text: string; timestamp: number } | null;
    onReparseComplete?: () => Promise<void>;
}

const HANDLER_INTENTS = new Set(['handler', 'list_handlers', 'remove_handler', 'handler_explain']);

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

            const isHandlerIntent = HANDLER_INTENTS.has(data.intent);
            let aiContent: string;

            if (data.intent === 'handler') {
                if (data.summary) {
                    aiContent = data.summary;
                    // Store reasoning in handler history so follow-up questions can reference it,
                    // but only show the summary in the visible chat.
                    const historyContent = data.reasoning
                        ? `${data.summary}\n\nReasoning:\n${data.reasoning}`
                        : data.summary;
                    setHandlerHistory(prev => [...prev, newUserMsg, { role: 'ai', content: historyContent }]);
                    setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);

                    if (caseId && onReparseComplete) {
                        setIsLoading(true);
                        try {
                            await apiService.reparseCase(caseId);
                            await onReparseComplete();
                        } catch {
                            setMessages(prev => [...prev, { role: 'ai', content: 'Reparse failed. Check the server logs.' }]);
                        } finally {
                            setIsLoading(false);
                        }
                    }
                    return;
                } else {
                    aiContent = data.error ?? 'Something went wrong generating the handler.';
                    setHandlerHistory(prev => [...prev, newUserMsg, { role: 'ai', content: aiContent }]);
                }
            } else if (isHandlerIntent) {
                // list_handlers or remove_handler
                aiContent = data.reply ?? `Error: ${data.error}`;
                setHandlerHistory(prev => [...prev, newUserMsg, { role: 'ai', content: aiContent }]);
            } else {
                // forensic
                aiContent = data.reply ?? `Error: ${data.error}`;
                setForensicHistory(prev => [...prev, newUserMsg, { role: 'ai', content: aiContent }]);
            }

            setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);
        } catch {
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
                        <p><strong>Forensic analysis</strong> — ask about users, processes, lateral movement, or request a summary.</p>
                        <p><strong>Add a handler</strong> — e.g. "add handler for event 4662 to detect DCSync attacks".</p>
                        <p><strong>List handlers</strong> — "list handlers" to see all registered AI handlers.</p>
                        <p><strong>Remove a handler</strong> — e.g. "remove the dcsync handler".</p>
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
