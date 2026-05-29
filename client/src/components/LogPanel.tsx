import React, { useState, useEffect } from 'react';
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
    onApplyFieldFilter?: (eventId: string, fieldName: string, value: string) => void;
}

const LogPanel: React.FC<LogPanelProps> = ({
    selectedLink,
    caseId,
    onApplyFieldFilter
}) => {
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        fieldName: string;
        value: string;
    } | null>(null);

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

    const handleRowContextMenu = (e: React.MouseEvent, fieldName: string, value: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            fieldName,
            value
        });
    };

    return (
        <div className="log-panel-sidebar">
            <div className="log-panel-header">
                <h2>Log Panel</h2>
            </div>

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
                </div>
            )}
        </div>
    );
};

export default LogPanel;