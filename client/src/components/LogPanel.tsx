import React from 'react';

const LogPanel = ({ selectedLink, caseId }) => {

    const getEntityName = (node) => {
        if (!node) return 'Unknown';
        return node.properties?.name || node.name || node.id;
    };

    return (
        <div className="details-sidebar">
            <div className="details-header">
                <h2>Investigation Details</h2>
                <div className="meta-info">
                    {caseId ? `Case ID: ${caseId.substring(0, 12)}...` : 'No case selected'}
                </div>
            </div>

            <div className="details-content">
                {selectedLink ? (
                    <div className="log-card">

                        <div className="log-title-row">
                            <span className="log-type">{selectedLink.type}</span>
                            <span className="log-timestamp">{selectedLink.details?.timestamp}</span>
                        </div>

                        <div className="data-group">
                            <div className="data-row">
                                <span className="data-label">Event ID</span>
                                <span className="data-value highlight">{selectedLink.details?.event_id || 'N/A'}</span>
                            </div>
                            <div className="data-row">
                                <span className="data-label">Source ({selectedLink.source.label})</span>
                                <span className="data-value">{getEntityName(selectedLink.source)}</span>
                            </div>
                            <div className="data-row">
                                <span className="data-label">Target ({selectedLink.target.label})</span>
                                <span className="data-value">{getEntityName(selectedLink.target)}</span>
                            </div>
                        </div>

                        <hr className="divider" />

                        <div className="data-group">
                            {selectedLink.details && Object.entries(selectedLink.details).map(([key, value]) => {
                                if (['event_id', 'timestamp'].includes(key)) return null;

                                return (
                                    <div className="data-row" key={key}>
                                        <span className="data-label">{key.replace(/_/g, ' ')}</span>
                                        <span className="data-value">{String(value) || '-'}</span>
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