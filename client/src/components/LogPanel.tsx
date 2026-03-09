// src/components/LogPanel/LogPanel.tsx
import React from 'react';
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
}

const LogPanel: React.FC<LogPanelProps> = ({ selectedLink, caseId }) => {

    const getEntityName = (node: NodeDetails) => {
        if (!node) return 'Unknown';
        return node.properties?.name || node.name || node.id || 'Unknown';
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
                                <span className="title-value timestamp">{selectedLink.details?.timestamp || 'N/A'}</span>
                            </div>
                        </div>

                        <div className="data-group">
                            <div className="data-row">
                                <span className="data-label">Event ID</span>
                                <span className="data-value block-value">
                                    {selectedLink.details?.event_id || 'N/A'}
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
                                if (['event_id', 'timestamp'].includes(key)) return null;

                                return (
                                    <div className="data-row" key={key}>
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
        </div>
    );
};

export default LogPanel;