import React, { useState, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import NodeContextMenu from './NodeContextMenu';
import { drawNodeOnCanvas, drawCurvedLinkOnCanvas, getThemeColors, ICONS_SVG } from '../utils/graphCanvas';
import type { GraphData } from '../types';

interface GraphCanvasProps {
    graphData: GraphData;
    caseId?: string | null;
    currentTheme?: 'light' | 'dark';
    isPlaybackMode?: boolean;
    activePlaybackNodeIds?: Set<string>;
    activePlaybackLinkIds?: Set<string>;
    currentPlaybackLink?: any | null;
    hasExistingQuery?: boolean;
    isUploading?: boolean;
    filtersComponent?: React.ReactNode;
    onLinkClick: (link: any) => void;
    onSendToAI: (type: 'node' | 'link', data: any) => void;
    onApplyNodeFilter: (node: any, appendMode?: 'AND' | 'OR') => void;
    onApplyEdit: (action: 'red' | 'unred' | 'delete', targetType: 'node' | 'link' | 'group', targetData: any) => void;
    onIsolateLineage: (node: any) => void;
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({
    graphData,
    currentTheme = 'light',
    isPlaybackMode = false,
    activePlaybackNodeIds,
    activePlaybackLinkIds,
    currentPlaybackLink,
    hasExistingQuery = false,
    isUploading = false,
    filtersComponent,
    onLinkClick,
    onSendToAI,
    onApplyNodeFilter,
    onApplyEdit,
    onIsolateLineage,
}) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [nodeIcons, setNodeIcons] = useState<Record<string, HTMLImageElement>>({});
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetLabel: string; targetType: 'node' | 'link' | 'group'; targetData: any } | null>(null);
    const [bundlePopup, setBundlePopup] = useState<{ x: number; y: number; links: any[] } | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
    const [isLasso, setIsLasso] = useState(false);
    const [lassoBox, setLassoBox] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });
    const [showHelp, setShowHelp] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const isLassoRef = useRef(false);
    const hoveredItemRef = useRef<any>(null);
    const playbackFocusTimeoutRef = useRef<number | null>(null);

    const themeColors = useMemo(() => getThemeColors(currentTheme), [currentTheme]);

    useEffect(() => {
        const load = (src: string) => { const img = new Image(); img.src = src; return img; };
        setNodeIcons({
            process:  load(ICONS_SVG.PROCESS),
            user:     load(ICONS_SVG.USER),
            computer: load(ICONS_SVG.COMPUTER),
            file:     load(ICONS_SVG.FILE),
            registry: load(ICONS_SVG.REGISTRY),
            task:     load(ICONS_SVG.TASK),
            service:  load(ICONS_SVG.SERVICE),
            group:    load(ICONS_SVG.GROUP),
        });
    }, []);

    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const graphDataWithCurvature = useMemo(() => {
        if (!graphData || !graphData.links) return graphData;

        const connectionGroups: Record<string, any[]> = {};
        graphData.links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const pairId = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
            if (!connectionGroups[pairId]) connectionGroups[pairId] = [];
            connectionGroups[pairId].push({ ...link, _sourceId: sourceId, _targetId: targetId });
        });

        const processedLinks: any[] = [];
        Object.values(connectionGroups).forEach(group => {
            if (group.length > 3) {
                const dirGroups: Record<string, any[]> = {};
                group.forEach(link => {
                    const dirId = `${link._sourceId}->${link._targetId}`;
                    if (!dirGroups[dirId]) dirGroups[dirId] = [];
                    dirGroups[dirId].push(link);
                });
                const directions = Object.values(dirGroups);
                directions.forEach((dirGroup, index) => {
                    const representative = dirGroup[0];
                    const isReversed = representative._sourceId > representative._targetId;
                    const hasRed = dirGroup.some((ln: any) => ln.is_red);
                    const centralOffset = index - (directions.length - 1) / 2;
                    processedLinks.push({
                        ...representative,
                        id: `bundle-${representative._sourceId}-${representative._targetId}`,
                        type: `${dirGroup.length} Events`,
                        isBundle: true,
                        is_red: representative.is_red || hasRed,
                        bundledLinks: dirGroup,
                        curvature: directions.length > 1 ? (centralOffset * 0.15 * (isReversed ? -1 : 1)) : 0,
                    });
                });
            } else {
                group.forEach((link, index) => {
                    const isReversed = link._sourceId > link._targetId;
                    const centralOffset = index - (group.length - 1) / 2;
                    link.curvature = centralOffset * 0.15 * (isReversed ? -1 : 1);
                    processedLinks.push(link);
                });
            }
        });

        return { nodes: graphData.nodes, links: processedLinks };
    }, [graphData]);

    useEffect(() => {
        if (graphRef.current) {
            graphRef.current.d3Force('charge').strength(-300);
            graphRef.current.d3Force('link').distance(350);
            graphRef.current.d3Force('center').strength(0.01);
            graphRef.current.d3ReheatSimulation();
        }
    }, [graphDataWithCurvature.nodes.length]);

    useEffect(() => {
        if (!isPlaybackMode || !currentPlaybackLink || !graphRef.current) return;

        if (playbackFocusTimeoutRef.current) window.clearTimeout(playbackFocusTimeoutRef.current);

        playbackFocusTimeoutRef.current = window.setTimeout(() => {
            const sourceId = typeof currentPlaybackLink.source === 'object' ? currentPlaybackLink.source.id : currentPlaybackLink.source;
            const targetId = typeof currentPlaybackLink.target === 'object' ? currentPlaybackLink.target.id : currentPlaybackLink.target;
            const sourceNode = graphDataWithCurvature.nodes.find((n: any) => n.id === sourceId);
            const targetNode = graphDataWithCurvature.nodes.find((n: any) => n.id === targetId);
            if (!sourceNode || !targetNode) return;
            graphRef.current.zoomToFit(850, 140, (node: any) => node.id === sourceNode.id || node.id === targetNode.id);
        }, 80);

        return () => {
            if (playbackFocusTimeoutRef.current) {
                window.clearTimeout(playbackFocusTimeoutRef.current);
                playbackFocusTimeoutRef.current = null;
            }
        };
    }, [isPlaybackMode, currentPlaybackLink, graphDataWithCurvature.nodes]);

    const handleFitGraphToScreen = () => {
        if (!graphRef.current || !graphData.nodes.length) return;
        graphRef.current.zoomToFit(700, 24);
    };

    const handleNodeHover = (node: any) => {
        hoveredItemRef.current = node;
        const canvas = containerRef.current?.querySelector('canvas');
        if (canvas) canvas.style.cursor = isPlaybackMode ? 'default' : (node ? 'pointer' : (isLasso ? 'crosshair' : 'default'));
    };

    const handleLinkHover = (link: any) => {
        hoveredItemRef.current = link;
        const canvas = containerRef.current?.querySelector('canvas');
        if (canvas) canvas.style.cursor = isPlaybackMode ? 'default' : (link ? 'pointer' : (isLasso ? 'crosshair' : 'default'));
    };

    const handleContainerMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || isPlaybackMode || !e.ctrlKey || hoveredItemRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        e.preventDefault();
        e.stopPropagation();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        isLassoRef.current = true;
        setIsLasso(true);
        setLassoBox({ x1: x, y1: y, x2: x, y2: y });
        setSelectedGroup({ nodes: [], links: [] });
        setContextMenu(null);
        setBundlePopup(null);
        const canvas = containerRef.current?.querySelector('canvas');
        if (canvas) canvas.style.cursor = 'crosshair';
    };

    const handleContainerMouseMove = (e: React.MouseEvent) => {
        if (isPlaybackMode || !isLassoRef.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setLassoBox(prev => ({ ...prev, x2: e.clientX - rect.left, y2: e.clientY - rect.top }));
    };

    const handleContainerMouseUp = () => {
        if (isPlaybackMode || !isLassoRef.current) return;
        isLassoRef.current = false;
        setIsLasso(false);
        const canvas = containerRef.current?.querySelector('canvas');
        if (canvas) canvas.style.cursor = 'default';

        const minX = Math.min(lassoBox.x1, lassoBox.x2);
        const maxX = Math.max(lassoBox.x1, lassoBox.x2);
        const minY = Math.min(lassoBox.y1, lassoBox.y2);
        const maxY = Math.max(lassoBox.y1, lassoBox.y2);

        const selectedNodes = graphDataWithCurvature.nodes.filter((n: any) => {
            if (!graphRef.current) return false;
            const pos = graphRef.current.graph2ScreenCoords(n.x, n.y);
            return pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
        });

        if (selectedNodes.length > 0) setSelectedGroup({ nodes: selectedNodes, links: [] });
    };

    return (
        <div
            className="graph-main-pane"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}
        >
            {filtersComponent}
            <div
                className="canvas-wrapper"
                ref={containerRef}
                style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0, overflow: 'hidden', width: '100%', height: '100%' }}
                onContextMenu={(e) => e.preventDefault()}
                onMouseDownCapture={handleContainerMouseDown}
                onMouseMoveCapture={handleContainerMouseMove}
                onMouseUpCapture={handleContainerMouseUp}
            >
                {dimensions.width > 0 && dimensions.height > 0 && graphDataWithCurvature.nodes.length > 0 ? (
                    <ForceGraph2D
                        ref={graphRef}
                        width={dimensions.width}
                        height={dimensions.height}
                        graphData={graphDataWithCurvature}
                        backgroundColor={themeColors.canvasBg}
                        enableZoomInteraction={!isLasso}
                        enableNodeDrag={!isLasso && !isPlaybackMode}
                        onNodeHover={handleNodeHover}
                        onLinkHover={handleLinkHover}
                        nodePointerAreaPaint={(node: any, color: string, ctx: any) => {
                            const iconSize = (node.label === 'User' || node.label === 'Computer') ? 34 : 26;
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, iconSize / 2, 0, 2 * Math.PI, false);
                            ctx.fill();
                        }}
                        linkPointerAreaPaint={(link: any, color: string, ctx: any) => {
                            const startNode = link.source;
                            const endNode = link.target;
                            if (!startNode || !endNode || typeof startNode !== 'object' || typeof endNode !== 'object') return;
                            const deltaX = endNode.x - startNode.x;
                            const deltaY = endNode.y - startNode.y;
                            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                            if (distance === 0) return;
                            const normalVector = { x: -deltaY / distance, y: deltaX / distance };
                            const controlPointOffset = (link.curvature || 0) * distance;
                            const controlPoint = {
                                x: startNode.x + deltaX / 2 + normalVector.x * controlPointOffset,
                                y: startNode.y + deltaY / 2 + normalVector.y * controlPointOffset,
                            };
                            ctx.beginPath();
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 15;
                            ctx.moveTo(startNode.x, startNode.y);
                            ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, endNode.x, endNode.y);
                            ctx.stroke();
                        }}
                        onLinkClick={(link, event) => {
                            if (isPlaybackMode) return;
                            setContextMenu(null);
                            setSelectedGroup({ nodes: [], links: [] });
                            if (link.isBundle) {
                                if (containerRef.current) {
                                    const rect = containerRef.current.getBoundingClientRect();
                                    const resolvedLinks = link.bundledLinks.map((bl: any) => ({ ...bl, source: link.source, target: link.target }));
                                    setBundlePopup({ x: event.clientX - rect.left, y: event.clientY - rect.top, links: resolvedLinks });
                                }
                            } else {
                                setBundlePopup(null);
                                onLinkClick(link);
                            }
                        }}
                        onBackgroundClick={() => {
                            if (isPlaybackMode) return;
                            setIsLasso(false);
                            setBundlePopup(null);
                            const canvas = containerRef.current?.querySelector('canvas');
                            if (canvas) canvas.style.cursor = 'default';
                            setContextMenu(null);
                            setSelectedGroup({ nodes: [], links: [] });
                        }}
                        onBackgroundRightClick={(event) => {
                            if (isPlaybackMode) return;
                            setBundlePopup(null);
                            if (selectedGroup.nodes.length > 0 && containerRef.current) {
                                const rect = containerRef.current.getBoundingClientRect();
                                setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, targetType: 'group', targetData: selectedGroup, targetLabel: `${selectedGroup.nodes.length} Elements Selected` });
                            } else {
                                setContextMenu(null);
                            }
                        }}
                        onNodeClick={() => {
                            if (isPlaybackMode) return;
                            setContextMenu(null);
                            setBundlePopup(null);
                            setSelectedGroup({ nodes: [], links: [] });
                        }}
                        onNodeRightClick={(node, event) => {
                            event.preventDefault();
                            if (isPlaybackMode) return;
                            setBundlePopup(null);
                            if (containerRef.current) {
                                const rect = containerRef.current.getBoundingClientRect();
                                const isGroup = selectedGroup.nodes.some(n => n.id === node.id);
                                setContextMenu({
                                    x: event.clientX - rect.left,
                                    y: event.clientY - rect.top,
                                    targetType: isGroup ? 'group' : 'node',
                                    targetData: isGroup ? selectedGroup : node,
                                    targetLabel: isGroup ? `${selectedGroup.nodes.length} Elements Selected` : (node.properties?.name || node.name || node.id),
                                });
                            }
                        }}
                        onLinkRightClick={(link, event) => {
                            if (isPlaybackMode || link.isBundle) return;
                            if (containerRef.current) {
                                const rect = containerRef.current.getBoundingClientRect();
                                setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, targetType: 'link', targetData: link, targetLabel: link.type || 'Connection' });
                            }
                        }}
                        cooldownTicks={100}
                        nodeCanvasObject={(node, ctx, globalScale) => drawNodeOnCanvas(node, ctx, globalScale, nodeIcons, selectedGroup.nodes, activePlaybackNodeIds, themeColors)}
                        linkCanvasObjectMode={() => 'replace'}
                        linkCanvasObject={(link, ctx, globalScale) => drawCurvedLinkOnCanvas(link, ctx, globalScale, activePlaybackLinkIds, themeColors)}
                    />
                ) : (
                    <div className="placeholder">
                        {isUploading ? 'Processing data...' : 'Select an investigation or upload an EVTX file to begin.'}
                    </div>
                )}

                {isLasso && (
                    <div style={{ position: 'absolute', border: '1px solid #0078d7', backgroundColor: 'rgba(0, 120, 215, 0.4)', left: Math.min(lassoBox.x1, lassoBox.x2), top: Math.min(lassoBox.y1, lassoBox.y2), width: Math.abs(lassoBox.x2 - lassoBox.x1), height: Math.abs(lassoBox.y2 - lassoBox.y1), pointerEvents: 'none' }} />
                )}

                {contextMenu && (
                    <NodeContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        targetLabel={contextMenu.targetLabel}
                        targetType={contextMenu.targetType}
                        targetData={contextMenu.targetData}
                        hasExistingQuery={hasExistingQuery}
                        onClose={() => {
                            setContextMenu(null);
                            setBundlePopup(null);
                        }}
                        onSendToAI={onSendToAI}
                        onApplyFilter={onApplyNodeFilter}
                        onApplyEdit={(action) => onApplyEdit(action, contextMenu.targetType, contextMenu.targetData)}
                        onIsolateLineage={onIsolateLineage}
                    />
                )}

                {bundlePopup && (
                    <div style={{ position: 'absolute', top: bundlePopup.y, left: bundlePopup.x, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-strong)', zIndex: 1000, maxHeight: '300px', overflowY: 'auto', width: '280px', fontFamily: 'Inter, sans-serif' }}>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, backgroundColor: 'var(--surface-alt)', fontSize: '13px', color: 'var(--text-primary)' }}>
                            Select Event ({bundlePopup.links.length})
                            <button onClick={() => setBundlePopup(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                        </div>
                        <div style={{ padding: '4px' }}>
                            {bundlePopup.links.map((l, i) => (
                                <div
                                    key={i}
                                    onClick={() => { onLinkClick(l); setBundlePopup(null); }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (!containerRef.current) return;
                                        const rect = containerRef.current.getBoundingClientRect();
                                        setSelectedGroup({ nodes: [], links: [] });
                                        setContextMenu({
                                            x: event.clientX - rect.left,
                                            y: event.clientY - rect.top,
                                            targetType: 'link',
                                            targetData: l,
                                            targetLabel: l.type || 'Connection',
                                        });
                                    }}
                                    style={{
                                        padding: '8px',
                                        borderBottom: i < bundlePopup.links.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        backgroundColor: l.is_red ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                                        borderLeft: l.is_red ? '4px solid #ef4444' : '4px solid transparent',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = l.is_red ? 'rgba(239, 68, 68, 0.2)' : 'var(--surface-alt)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = l.is_red ? 'rgba(239, 68, 68, 0.12)' : 'transparent'}
                                >
                                    <div style={{ fontWeight: 600, color: l.is_red ? '#b91c1c' : 'var(--text-primary)' }}>{l.type}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                        {l.details?.timestamp ? new Date(l.details.timestamp).toLocaleString() : (l.details?.event_id || 'N/A')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="graph-float-actions">
                    <button className="help-btn" onClick={() => setShowHelp(v => !v)} title="Navigation help">?</button>
                    <button
                        className="fit-btn"
                        onClick={handleFitGraphToScreen}
                        disabled={!graphData.nodes.length}
                        title="Fit graph to screen"
                        aria-label="Fit graph to screen"
                    >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 9V4h5"></path>
                            <path d="M20 9V4h-5"></path>
                            <path d="M4 15v5h5"></path>
                            <path d="M20 15v5h-5"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </div>

                {showHelp && (
                    <div className="help-panel">
                        <div className="help-panel-header">
                            <span>Help</span>
                            <button className="help-panel-close" onClick={() => setShowHelp(false)}>✕</button>
                        </div>
                        <div className="help-panel-scrollable">
                            <div className="help-panel-section">Navigation</div>
                            <ul className="help-list">
                                <li><kbd>Scroll</kbd> Zoom in / out</li>
                                <li><kbd>Drag canvas</kbd> Pan</li>
                                <li><kbd>Click node</kbd> Select &amp; view details</li>
                                <li><kbd>Right-click</kbd> Context menu</li>
                                <li><kbd>Ctrl + drag</kbd> Box-select multiple nodes</li>
                                <li><kbd>Drag node</kbd> Reposition node</li>
                            </ul>
                            <div className="help-panel-section">Search syntax</div>
                            <ul className="help-list">
                                <li><kbd>term</kbd> Plain text search</li>
                                <li><kbd>A AND B</kbd> Both terms must match</li>
                                <li><kbd>A OR B</kbd> Either term matches</li>
                                <li><kbd>NOT A</kbd> Exclude term</li>
                                <li><kbd>(A OR B) AND C</kbd> Group with parentheses</li>
                                <li><kbd>type.field==val</kbd> Field filter by action name</li>
                                <li><kbd>4624.field==val</kbd> Field filter by event ID</li>
                                <li><kbd>*.field==val</kbd> Field filter, any event</li>
                                <li><kbd>type.src==name</kbd> Filter by source node name</li>
                                <li><kbd>type.target==name</kbd> Filter by destination node name</li>
                            </ul>
                            <div className="help-panel-section">Saved queries</div>
                            <ul className="help-list">
                                <li><kbd>Save</kbd> Save current query as a tab</li>
                                <li><kbd>Click tab</kbd> Toggle tab on / off (OR with current query)</li>
                                <li><kbd>Right-click tab</kbd> Rename tab label</li>
                            </ul>
                            <div className="help-panel-section">Shortcuts</div>
                            <ul className="help-list">
                                <li><kbd>/</kbd> Focus the search bar</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GraphCanvas;
