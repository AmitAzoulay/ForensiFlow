import React from 'react';

const LogPanel = ({ selectedLink, caseId }) => {

    const getEntityName = (node) => {
        if (!node) return 'Unknown';
        return node.properties?.name || node.name || node.id;
    };

    return (
        <div className="details-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0', textAlign: 'left' }}>

            <div className="details-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600', color: '#0f172a', textAlign: 'left' }}>
                    Log Panel
                </h2>
            </div>

            <div className="details-content" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {selectedLink ? (
                    <div className="log-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '16px' }}>

                        {/* Forced left alignment with alignItems: 'flex-start' and width: '100%' */}
                        <div className="log-title-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', margin: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', textAlign: 'left', width: '100%' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', width: '60px', flexShrink: 0, marginTop: '2px' }}>
                                    ACTION:
                                </span>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#1e293b', fontWeight: '700', wordBreak: 'break-all' }}>
                                    {selectedLink.type}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', textAlign: 'left', width: '100%' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', width: '60px', flexShrink: 0, marginTop: '2px' }}>
                                    TIME:
                                </span>
                                <span className="log-timestamp" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#475569', wordBreak: 'break-all' }}>
                                    {selectedLink.details?.timestamp || 'N/A'}
                                </span>
                            </div>
                        </div>

                        <div className="data-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '10px' }}>
                            <div className="data-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '2px' }}>
                                <span className="data-label" style={{ fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Event ID</span>
                                <span className="data-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#1e293b', backgroundColor: '#f1f5f9', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', wordBreak: 'break-all', textAlign: 'left', display: 'block', width: '100%', boxSizing: 'border-box' }}>
                                    {selectedLink.details?.event_id || 'N/A'}
                                </span>
                            </div>
                            <div className="data-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '2px' }}>
                                <span className="data-label" style={{ fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Source ({selectedLink.source.label})</span>
                                <span className="data-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#1e293b', backgroundColor: '#f1f5f9', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', wordBreak: 'break-all', textAlign: 'left', display: 'block', width: '100%', boxSizing: 'border-box' }}>
                                    {getEntityName(selectedLink.source)}
                                </span>
                            </div>
                            <div className="data-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '2px' }}>
                                <span className="data-label" style={{ fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>Target ({selectedLink.target.label})</span>
                                <span className="data-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#1e293b', backgroundColor: '#f1f5f9', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', wordBreak: 'break-all', textAlign: 'left', display: 'block', width: '100%', boxSizing: 'border-box' }}>
                                    {getEntityName(selectedLink.target)}
                                </span>
                            </div>
                        </div>

                        <hr className="divider" style={{ border: '0', height: '1px', background: '#e2e8f0', margin: '4px 0', width: '100%' }} />

                        <div className="data-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '10px' }}>
                            {selectedLink.details && Object.entries(selectedLink.details).map(([key, value]) => {
                                if (['event_id', 'timestamp'].includes(key)) return null;

                                return (
                                    <div className="data-row" key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', gap: '2px' }}>
                                        <span className="data-label" style={{ fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', textAlign: 'left' }}>
                                            {key.replace(/_/g, ' ')}
                                        </span>
                                        <span className="data-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', color: '#1e293b', wordBreak: 'break-all', textAlign: 'left' }}>
                                            {String(value) || '-'}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                    </div>
                ) : (
                    <div className="empty-state" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center' }}>
                        <p>Select a relationship line on the graph to view detailed telemetry.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LogPanel;