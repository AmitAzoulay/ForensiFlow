import React, { useMemo } from 'react';
import './ExecutionLineage.css';

interface ExecutionLineageProps {
    targetNode: any;
    rawGraphData: { nodes: any[], links: any[] };
    onClose: () => void;
}

const ExecutionLineage: React.FC<ExecutionLineageProps> = ({ targetNode, rawGraphData, onClose }) => {

    const treeData = useMemo(() => {
        if (!targetNode || !rawGraphData.links.length) return null;

        const processLinks = rawGraphData.links.filter(l => l.type === 'PROCESS_CREATED');

        let rootId = targetNode.id;
        let foundParent = true;
        const visitedUp = new Set<string>([rootId]);

        while (foundParent) {
            foundParent = false;
            const parentLink = processLinks.find(l => {
                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                return tId === rootId;
            });

            if (parentLink) {
                const pId = typeof parentLink.source === 'object' ? parentLink.source.id : parentLink.source;
                if (!visitedUp.has(pId)) {
                    rootId = pId;
                    visitedUp.add(pId);
                    foundParent = true;
                }
            }
        }

        const buildTree = (currentId: string, visitedDown: Set<string>): any => {
            if (visitedDown.has(currentId)) return null;
            visitedDown.add(currentId);

            const node = rawGraphData.nodes.find(n => n.id === currentId);
            if (!node) return null;

            const childLinks = processLinks.filter(l => {
                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                return sId === currentId;
            });

            const children = childLinks
                .map(l => {
                    const tId = typeof l.target === 'object' ? l.target.id : l.target;
                    return { treeNode: buildTree(tId, new Set(visitedDown)), linkData: l };
                })
                .filter(c => c.treeNode !== null);

            children.sort((a, b) => {
                const timeA = a.linkData.details?.timestamp ? new Date(a.linkData.details.timestamp).getTime() : 0;
                const timeB = b.linkData.details?.timestamp ? new Date(b.linkData.details.timestamp).getTime() : 0;
                return timeA - timeB;
            });

            return { node, children: children.map(c => c.treeNode), linkData: null };
        };

        return buildTree(rootId, new Set<string>());

    }, [targetNode, rawGraphData]);

    const formatTime = (timestampStr: string | undefined) => {
        if (!timestampStr) return '';
        const d = new Date(timestampStr);
        if (isNaN(d.getTime())) return timestampStr;
        return d.toLocaleTimeString(undefined, { hour12: false });
    };

    const renderNode = (treeNode: any, depth: number) => {
        if (!treeNode) return null;

        const isTarget = treeNode.node.id === targetNode.id;
        const isRed = treeNode.node.is_red;
        const nodeName = treeNode.node.properties?.name || treeNode.node.name || treeNode.node.id;
        const pid = treeNode.node.properties?.ProcessId || treeNode.node.id;

        return (
            <React.Fragment key={treeNode.node.id}>
                <div className={`lineage-node-row ${isTarget ? 'is-target' : ''} ${isRed ? 'is-red' : ''}`}>
                    {Array.from({ length: depth }).map((_, i) => (
                        <div key={i} className="lineage-indent"></div>
                    ))}

                    <div className="lineage-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={isRed ? "#ef4444" : "#10b981"}>
                            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                        </svg>
                    </div>

                    <div className="lineage-details">
                        <span className="lineage-name">{nodeName}</span>
                        {pid && <span className="lineage-pid">PID: {pid}</span>}
                        {treeNode.node.properties?.timestamp && (
                            <span className="lineage-time">{formatTime(treeNode.node.properties.timestamp)}</span>
                        )}
                    </div>
                </div>
                {treeNode.children.map((child: any) => renderNode(child, depth + 1))}
            </React.Fragment>
        );
    };

    return (
        <div className="lineage-overlay" onClick={onClose}>
            <div className="lineage-modal" onClick={e => e.stopPropagation()}>
                <div className="lineage-header">
                    <h2>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                        </svg>
                        Execution Lineage
                    </h2>
                    <button className="lineage-close-btn" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div className="lineage-content">
                    {treeData ? (
                        <div className="lineage-tree">
                            {renderNode(treeData, 0)}
                        </div>
                    ) : (
                        <div className="lineage-empty">
                            No process lineage found for this entity.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExecutionLineage;