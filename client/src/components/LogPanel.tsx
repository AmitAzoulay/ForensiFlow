import React from 'react';

const LogPanel = ({ selectedLink, caseId }) => {

    const getEntityName = (node) => {
        if (!node) return 'Unknown';
        // Prioritize properties.name (from DB), fallback to id
        return node.properties?.name || node.name || node.id;
    };

    return (
        <div className="details-panel">
            <h2>Investigation Details</h2>
            <div className="meta-info">
                {caseId && <small>Case ID: {caseId.substring(0, 8)}...</small>}
            </div>

            {selectedLink ? (
                <div className="log-card">
                    <div className="log-header">
                        <h3>{selectedLink.type}</h3>
                        <span className="timestamp">{selectedLink.details?.timestamp}</span>
                    </div>

                    <div className="log-list">
                        {/* Key Information */}
                        <div className="list-group">
                            <div className="log-row">
                                <span className="label">Event ID:</span>
                                <span className="value highlight-tag">{selectedLink.details?.event_id || 'N/A'}</span>
                            </div>

                            <div className="log-row">
                                <span className="label">Source ({selectedLink.source.label}):</span>
                                <span className="value" style={{ fontWeight: 'bold' }}>
                                    {getEntityName(selectedLink.source)}
                                </span>
                            </div>
                            <div className="log-row">
                                <span className="label">Target ({selectedLink.target.label}):</span>
                                <span className="value" style={{ fontWeight: 'bold' }}>
                                    {getEntityName(selectedLink.target)}
                                </span>
                            </div>
                        </div>

                        <hr className="list-divider" />

                        {/* Dynamic Details */}
                        <div className="list-group">
                            {selectedLink.details && Object.entries(selectedLink.details).map(([key, value]) => {
                                if (['event_id', 'timestamp'].includes(key)) return null;

                                return (
                                    <div className="log-row" key={key}>
                                        <span className="label">{key.replace(/_/g, ' ')}:</span>
                                        <span className="value">{String(value)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="empty-state">
                    <p>Select a connection line to view full event logs.</p>
                </div>
            )}
        </div>
    );
};

export default LogPanel;