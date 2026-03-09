import React, { useState, useRef, useEffect } from 'react';

const AIAssistant = ({ caseId }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen && messages.length === 0 && caseId) {
            handleSend("Provide a single-paragraph forensic summary of this investigation.");
        }
    }, [isOpen, caseId]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            });
        };

        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleSend = async (messageText) => {
        const textToProcess = messageText || inputValue;
        if (!textToProcess.trim() || !caseId) return;

        const newUserMsg = { role: 'user', content: textToProcess };
        const updatedMessages = [...messages, newUserMsg];

        setMessages(updatedMessages);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('http://localhost:8000/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case_id: caseId, history: updatedMessages })
            });
            const data = await response.json();

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
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed', bottom: '24px', right: '24px', width: '60px', height: '60px',
                    borderRadius: '30px', backgroundColor: '#1e293b', color: '#fff',
                    border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                    transition: 'transform 0.2s ease'
                }}
            >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <path d="M12 7v6"></path>
                    <path d="M12 17h.01"></path>
                </svg>
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed', bottom: '24px', right: '24px', width: '380px', height: '550px',
            backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1000, border: '1px solid #e2e8f0',
            transform: `translate(${position.x}px, ${position.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}>
            <div
                onMouseDown={handleMouseDown}
                style={{
                    backgroundColor: '#1e293b', padding: '16px', color: '#ffffff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600', letterSpacing: '0.02em' }}>ForensiFlow AI</h3>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.length === 0 && !isLoading && (
                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.9rem', marginTop: '20px' }}>
                        I have access to the chronological graph logs. Ask me to investigate specific users, processes, or create a summary.
                    </div>
                )}

                {messages.map((msg, idx) => {
                    // Hide the initial hidden system prompt from the UI
                    if (idx === 0 && msg.content.includes("single-paragraph forensic summary")) return null;

                    return (
                        <div key={idx} style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: msg.role === 'user' ? '#0ea5e9' : '#ffffff',
                            color: msg.role === 'user' ? '#ffffff' : '#1e293b',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            maxWidth: '85%',
                            border: msg.role === 'ai' ? '1px solid #e2e8f0' : 'none',
                            fontSize: '0.9rem',
                            lineHeight: '1.4',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere'
                        }}>
                            {msg.content}
                        </div>
                    );
                })}

                {isLoading && (
                    <div style={{ alignSelf: 'flex-start', color: '#64748b', fontSize: '0.85rem', padding: '8px', fontStyle: 'italic' }}>
                        Analyzing...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: '12px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff', display: 'flex', gap: '8px' }}>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={caseId ? "Ask about the investigation..." : "Load a case first"}
                    disabled={!caseId || isLoading}
                    style={{
                        flex: 1, padding: '10px 12px', border: '1px solid #cbd5e1',
                        borderRadius: '6px', fontSize: '0.9rem', outline: 'none'
                    }}
                />
                <button
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || !caseId || isLoading}
                    style={{
                        backgroundColor: inputValue.trim() && caseId ? '#1e293b' : '#cbd5e1',
                        color: '#fff', border: 'none', borderRadius: '6px', padding: '0 16px',
                        cursor: inputValue.trim() && caseId ? 'pointer' : 'not-allowed',
                        fontWeight: '600'
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default AIAssistant;