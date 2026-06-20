import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import './LogPanel.css';

interface NodeDetails {
    id?: string;
    name?: string;
    label?: string;
    properties?: {
        name?: string;
    };
}

interface LinkDetails {
    type: string;
    source: NodeDetails;
    target: NodeDetails;
    details?: Record<string, any>;
}

interface LogPanelProps {
    selectedLink: LinkDetails | null;
    caseId: string | null;
    hasExistingQuery?: boolean;
    onApplyFieldFilter?: (eventId: string, fieldName: string, value: string, appendMode?: 'AND' | 'OR') => void;
}

const LogPanel: React.FC<LogPanelProps> = ({
    selectedLink,
    caseId,
    hasExistingQuery,
    onApplyFieldFilter
}) => {
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        fieldName: string;
        value: string;
    } | null>(null);

    const [aiTranslation, setAiTranslation] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState<boolean>(false);

    useEffect(() => {
        setAiTranslation(null);
        setIsTranslating(false);
    }, [selectedLink]);

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const getEntityName = (node: NodeDetails) => {
        if (!node) return 'Unknown';
        return node.properties?.name || node.name || node.id || 'Unknown';
    };

    const formatTimestamp = (timestampStr: string | undefined) => {
        if (!timestampStr) return 'N/A';
        const dateObj = new Date(timestampStr);
        if (isNaN(dateObj.getTime())) {
            return timestampStr;
        }
        return dateObj.toLocaleString(undefined, {
            month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const formatAccessMask = (maskStr: string): string => {
        const hexVal = parseInt(maskStr, 16);
        if (isNaN(hexVal)) return maskStr;

        const accessTypes: string[] = [];

        if (hexVal & 0x1) accessTypes.push('Read');
        if (hexVal & 0x2) accessTypes.push('Write');
        if (hexVal & 0x4) accessTypes.push('Append');
        if (hexVal & 0x20) accessTypes.push('Execute');
        if (hexVal & 0x40) accessTypes.push('Delete Child');
        if (hexVal & 0x10000) accessTypes.push('Delete');
        if (hexVal & 0x40000) accessTypes.push('Write DAC');
        if (hexVal & 0x80000) accessTypes.push('Write Owner');
        if (hexVal & 0x100000) accessTypes.push('Synchronize');

        return accessTypes.length > 0 ? `${maskStr} (${accessTypes.join(', ')})` : maskStr;
    };


    const formatLogonType = (type: string): string => {
        const types: Record<string, string> = {
            '2': 'Interactive (Local)',
            '3': 'Network (Remote)',
            '4': 'Batch',
            '5': 'Service',
            '7': 'Unlock',
            '8': 'NetworkCleartext',
            '9': 'NewCredentials',
            '10': 'RemoteInteractive (RDP)',
            '11': 'CachedInteractive'
        };
        return types[type] ? `${type} (${types[type]})` : type;
    };

    const formatStartType = (startTypeStr: string): string => {
        const types: Record<string, string> = {
            '0': 'Boot Start',
            '1': 'System Start',
            '2': 'Auto Start',
            '3': 'Demand Start',
            '4': 'Disabled'
        };
        return types[startTypeStr] ? `${startTypeStr} (${types[startTypeStr]})` : startTypeStr;
    };

    const formatServiceType = (serviceTypeStr: string): string => {
        const val = parseInt(serviceTypeStr.startsWith('0x') ? serviceTypeStr.slice(2) : serviceTypeStr, 16);
        if (isNaN(val)) return serviceTypeStr;

        const types: string[] = [];
        if (val & 0x1) types.push('Kernel Driver');
        if (val & 0x2) types.push('File System Driver');
        if (val & 0x4) types.push('Adapter');
        if (val & 0x8) types.push('Recognizer Driver');

        if (val & 0x10) types.push('Win32 Own Process');
        if (val & 0x20) types.push('Win32 Share Process');

        if (val & 0x100) types.push('Interactive Process');

        return types.length > 0 ? `${serviceTypeStr} (${types.join(' + ')})` : serviceTypeStr;
    };

    const formatDataValue = (key: string, value: any): string => {
        const strVal = String(value);
        if (!strVal || strVal === '-') return '-';

        if (key === 'AccessMask' || key === 'Accesses') {
            return formatAccessMask(strVal);
        }
        if (key === 'ServiceStartType') {
            return formatStartType(strVal);
        }
        if (key === 'ServiceType') {
            return formatServiceType(strVal);
        }
        if (key === 'LogonType') {
            return formatLogonType(strVal);
        }
        return strVal;
    };

    const handleRowContextMenu = (e: React.MouseEvent, fieldName: string, value: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, fieldName, value });
    };

    const handleTranslateLog = async () => {
        if (!selectedLink || !caseId) return;
        setIsTranslating(true);
        try {
            const logDetails = JSON.stringify(selectedLink.details, null, 2);
            const prompt = `INSTRUCTION: Briefly explain this Windows event log in one simple sentence in English. No technical jargon. CRITICAL: Do not suggest next steps. Telemetry: ${logDetails}`; 
            
            const response = await apiService.sendChatMessage(caseId, [{ role: 'user', content: prompt }]);
            if (response.reply) {
                setAiTranslation(response.reply);
            } else {
                setAiTranslation("Failed to generate translation.");
            }
        } catch (error) {
            setAiTranslation("Error connecting to AI service.");
        } finally {
            setIsTranslating(false);
        }
    };

    return (
        <div className="log-panel-sidebar">
            <div className="log-panel-header">
                <h2>Log Panel</h2>
                {selectedLink && (
                    <button 
                        className="header-ai-btn" 
                        onClick={handleTranslateLog} 
                        disabled={isTranslating || !caseId}
                        data-tooltip="Explain with AI"
                    >
                        {isTranslating ? (
                            <svg className="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="2" x2="12" y2="6"></line>
                                <line x1="12" y1="18" x2="12" y2="22"></line>
                                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                                <line x1="2" y1="12" x2="6" y2="12"></line>
                                <line x1="18" y1="12" x2="22" y2="12"></line>
                                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                            </svg>
                        ) : (
                            <svg className="ai-sparkle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
                                <path d="M5 3v4"></path>
                                <path d="M19 17v4"></path>
                                <path d="M3 5h4"></path>
                                <path d="M17 19h4"></path>
                            </svg>
                        )}
                    </button>
                )}
            </div>

            {/* בלוק טקסט שמופיע רק כשיש תרגום */}
            {aiTranslation && (
                <div className="inline-ai-summary">
                    <div className="ai-summary-text">
                        <span className="ai-icon">✨</span> {aiTranslation}
                    </div>
                    <button className="close-summary-btn" onClick={() => setAiTranslation(null)}>×</button>
                </div>
            )}

            <div className="log-panel-content">
                {selectedLink ? (
                    <div className="log-card">
                        <div className="log-title-row">
                            <div className="title-item">
                                <span className="title-label">ACTION:</span>
                                <span className="title-value action-type">{selectedLink.type}</span>
                            </div>
                            <div className="title-item">
                                <span className="title-label">TIME:</span>
                                <span className="title-value timestamp">
                                    {formatTimestamp(selectedLink.details?.timestamp)}
                                </span>
                            </div>
                        </div>

                        <div className="data-group">
                            <div
                                className="data-row"
                                onContextMenu={(e) => handleRowContextMenu(e, 'event_id', selectedLink.details?.event_id || selectedLink.details?.EventID || '')}
                                style={{ cursor: 'context-menu' }}
                            >
                                <span className="data-label">Event ID</span>
                                <span className="data-value block-value">
                                    {selectedLink.details?.event_id || selectedLink.details?.EventID || 'N/A'}
                                </span>
                            </div>
                            <div className="data-row">
                                <span className="data-label">Source ({selectedLink.source.label || 'Unknown'})</span>
                                <span className="data-value block-value">
                                    {getEntityName(selectedLink.source)}
                                </span>
                            </div>
                            <div className="data-row">
                                <span className="data-label">Target ({selectedLink.target.label || 'Unknown'})</span>
                                <span className="data-value block-value">
                                    {getEntityName(selectedLink.target)}
                                </span>
                            </div>
                        </div>

                        <hr className="divider" />

                        <div className="data-group">
                            {selectedLink.details && Object.entries(selectedLink.details).map(([key, value]) => {
                                if (['event_id', 'EventID', 'timestamp'].includes(key)) return null;

                                return (
                                    <div
                                        className="data-row"
                                        key={key}
                                        onContextMenu={(e) => handleRowContextMenu(e, key, String(value))}
                                        style={{ cursor: 'context-menu' }}
                                    >
                                        <span className="data-label">
                                            {key.replace(/_/g, ' ')}
                                        </span>
                                        <span className="data-value inline-value">
                                            {String(value) || '-'}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="empty-state">
                        <p>Select a relationship line on the graph to view detailed telemetry.</p>
                    </div>
                )}
            </div>

            {contextMenu && (
                <div
                    className="log-field-context-menu"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '4px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: '160px',
                        fontFamily: 'Inter, sans-serif'
                    }}
                >
                    <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700', color: '#64748b', borderBottom: '1px solid #f1f5f9', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {contextMenu.fieldName.replace(/_/g, ' ')}
                    </div>
                    <button
                        onClick={() => {
                            if (onApplyFieldFilter) {
                                const evId = selectedLink?.details?.event_id || selectedLink?.details?.EventID || '*';
                                onApplyFieldFilter(String(evId), contextMenu.fieldName, contextMenu.value);
                            }
                            setContextMenu(null);
                        }}
                        style={{ background: 'none', border: 'none', padding: '8px 12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1e293b', borderRadius: '4px', width: '100%' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                        Apply as Filter
                    </button>

                    {hasExistingQuery && (
                        <>
                            <button
                                onClick={() => {
                                    if (onApplyFieldFilter) {
                                        const evId = selectedLink?.details?.event_id || selectedLink?.details?.EventID || '*';
                                        onApplyFieldFilter(String(evId), contextMenu.fieldName, contextMenu.value, 'AND');
                                    }
                                    setContextMenu(null);
                                }}
                                style={{ background: 'none', border: 'none', padding: '8px 12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1e293b', borderRadius: '4px', width: '100%', marginTop: '2px' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Add with AND
                            </button>
                            <button
                                onClick={() => {
                                    if (onApplyFieldFilter) {
                                        const evId = selectedLink?.details?.event_id || selectedLink?.details?.EventID || '*';
                                        onApplyFieldFilter(String(evId), contextMenu.fieldName, contextMenu.value, 'OR');
                                    }
                                    setContextMenu(null);
                                }}
                                style={{ background: 'none', border: 'none', padding: '8px 12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1e293b', borderRadius: '4px', width: '100%', marginTop: '2px' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Add with OR
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default LogPanel;