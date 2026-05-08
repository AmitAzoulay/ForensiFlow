import React, { useState, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { apiService } from "../services/api";
import TimelineFilter from './TimelineFilter';
import './GraphPanel.css';
import * as d3 from 'd3-force';

// ==========================================
// CONSTANTS & HELPERS
// ==========================================
const GRAPH_SETTINGS = {
    NODE_RADIUS: 16,
    LINK_COLOR: '#94a3b8',
    LINK_WIDTH: 2,
    ARROW_LENGTH: 10,
    ARROW_WIDTH: 5,
    NODE_MARGIN: 14,
    LABEL_FONT_SIZE: 4
};

const ICONS_SVG = {
    PROCESS: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    REGISTRY: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
    USER: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    COMPUTER: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23475569"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
    FILE: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2306b6d4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    TASK: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm4-4H7v-2h9v2zm0-4H7V7h9v2z"/></svg>`,
    SERVICE: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6"><path d="M4 11h16v2H4zm0-4h16v2H4zm0 8h16v2H4zm-2-8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V7zm2 10h16V7H4v10z"/></svg>`
};

const extractTimestamp = (obj: any): number | null => {
    if (!obj) return null;
    if (obj.timestamp) return new Date(obj.timestamp).getTime();
    if (obj.time) return new Date(obj.time).getTime();
    if (obj.details?.timestamp) return new Date(obj.details.timestamp).getTime();
    if (obj.details?.System?.TimeCreated?.SystemTime) return new Date(obj.details.System.TimeCreated.SystemTime).getTime();
    return null;
};

const drawNodeOnCanvas = (node: any, ctx: CanvasRenderingContext2D, globalScale: number, nodeIcons: Record<string, HTMLImageElement>) => {
    const rawLabel = String(node.properties?.name || node.name || node.id || '');
    // Truncate long node names with ellipses
    const label = rawLabel.length > 20 ? rawLabel.substring(0, 17) + "..." : rawLabel;

    const iconSize = 26;
    const iconImage = nodeIcons[node.label?.toLowerCase()] || nodeIcons['process'];

    if (iconImage) {
        ctx.drawImage(iconImage, node.x - iconSize / 2, node.y - iconSize / 2, iconSize, iconSize);
    } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#64748b';
        ctx.fill();
    }

    // Hide labels when zoomed out too far
    if (globalScale >= 0.8) {
        const fontSize = 11 / globalScale;
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#1e293b';

        const lines = label.split('\n');
        lines.forEach((line: string, index: number) => {
            ctx.fillText(line, node.x, node.y + iconSize / 2 + 4 + (index * fontSize));
        });
    }
};

const drawCurvedLinkOnCanvas = (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const startNode = link.source;
    const endNode = link.target;
    if (!startNode || !endNode || typeof startNode !== 'object' || typeof endNode !== 'object') return;

    const deltaX = endNode.x - startNode.x;
    const deltaY = endNode.y - startNode.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance === 0) return;

    const totalOffset = GRAPH_SETTINGS.NODE_RADIUS + GRAPH_SETTINGS.NODE_MARGIN;
    const normalVector = { x: -deltaY / distance, y: deltaX / distance };
    const controlPointOffset = (link.curvature || 0) * distance;
    const controlPoint = {
        x: startNode.x + deltaX / 2 + normalVector.x * controlPointOffset,
        y: startNode.y + deltaY / 2 + normalVector.y * controlPointOffset
    };

    const distToControlEnd = Math.sqrt(Math.pow(endNode.x - controlPoint.x, 2) + Math.pow(endNode.y - controlPoint.y, 2));
    const distToControlStart = Math.sqrt(Math.pow(startNode.x - controlPoint.x, 2) + Math.pow(startNode.y - controlPoint.y, 2));

    if (distToControlEnd === 0 || distToControlStart === 0) return;

    const targetTipX = endNode.x - ((endNode.x - controlPoint.x) / distToControlEnd) * totalOffset;
    const targetTipY = endNode.y - ((endNode.y - controlPoint.y) / distToControlEnd) * totalOffset;
    const sourceTipX = startNode.x - ((startNode.x - controlPoint.x) / distToControlStart) * totalOffset;
    const sourceTipY = startNode.y - ((startNode.y - controlPoint.y) / distToControlStart) * totalOffset;

    ctx.beginPath();
    ctx.strokeStyle = GRAPH_SETTINGS.LINK_COLOR;
    ctx.lineWidth = Math.max(GRAPH_SETTINGS.LINK_WIDTH / globalScale, 0.8);
    ctx.moveTo(sourceTipX, sourceTipY);
    ctx.quadraticCurveTo(
        controlPoint.x,
        controlPoint.y,
        targetTipX - ((endNode.x - controlPoint.x) / distToControlEnd) * (GRAPH_SETTINGS.ARROW_LENGTH * 0.8),
        targetTipY - ((endNode.y - controlPoint.y) / distToControlEnd) * (GRAPH_SETTINGS.ARROW_LENGTH * 0.8)
    );
    ctx.stroke();

    const baseX = targetTipX - ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_LENGTH;
    const baseY = targetTipY - ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_LENGTH;

    ctx.beginPath();
    ctx.fillStyle = GRAPH_SETTINGS.LINK_COLOR;
    ctx.moveTo(targetTipX, targetTipY);
    ctx.lineTo(baseX - ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH, baseY + ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH);
    ctx.lineTo(baseX + ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH, baseY - ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH);
    ctx.closePath();
    ctx.fill();

    // Hide labels when zoomed out too far
    if (globalScale >= 0.8) {
        const label = link.type || link.label || "";
        if (!label) return;

        const textPos = {
            x: 0.25 * startNode.x + 0.5 * controlPoint.x + 0.25 * endNode.x,
            y: 0.25 * startNode.y + 0.5 * controlPoint.y + 0.25 * endNode.y
        };

        let textAngle = Math.atan2(endNode.y - startNode.y, endNode.x - startNode.x);
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
            textAngle += Math.PI;
        }

        const baseFontSize = GRAPH_SETTINGS.LABEL_FONT_SIZE > 5 ? GRAPH_SETTINGS.LABEL_FONT_SIZE : 10;
        const fontSize = Math.max(baseFontSize / globalScale, 2);

        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const bgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.6);

        ctx.save();
        ctx.translate(textPos.x, textPos.y);
        ctx.rotate(textAngle);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(-bgDimensions[0] / 2, -bgDimensions[1] / 2 - (fontSize * 0.4), bgDimensions[0], bgDimensions[1]);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#475569';
        ctx.fillText(label, 0, -(fontSize * 0.4));
        ctx.restore();
    }
};

interface GraphPanelProps {
    graphData: { nodes: any[], links: any[] };
    onLinkClick: (link: any) => void;
    onDataLoaded: (data: any, caseId: string) => void;
    children?: React.ReactNode;
    filtersComponent?: React.ReactNode;
}

const GraphPanel: React.FC<GraphPanelProps> = ({ graphData, onLinkClick, onDataLoaded, children, filtersComponent }) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [investigationsList, setInvestigationsList] = useState<any[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [newInvestigationName, setNewInvestigationName] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [nodeIcons, setNodeIcons] = useState<Record<string, HTMLImageElement>>({});

    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);

    useEffect(() => {
        const loadSingleImage = (svgString: string) => {
            const img = new Image();
            img.src = svgString;
            return img;
        };

        setNodeIcons({
            process: loadSingleImage(ICONS_SVG.PROCESS),
            user: loadSingleImage(ICONS_SVG.USER),
            computer: loadSingleImage(ICONS_SVG.COMPUTER),
            file: loadSingleImage(ICONS_SVG.FILE),
            registry: loadSingleImage(ICONS_SVG.REGISTRY),
            task: loadSingleImage(ICONS_SVG.TASK),
            service: loadSingleImage(ICONS_SVG.SERVICE),
        });
    }, []);

    useEffect(() => {
        const loadInvestigations = async () => {
            try {
                const data = await apiService.getInvestigations();
                setInvestigationsList(data);
                if (data.length > 0 && !selectedCaseId) {
                    setSelectedCaseId(data[0].case_id);
                }
            } catch (error) {
                console.error("Failed to load investigation history:", error);
            }
        };
        loadInvestigations();
    }, [selectedCaseId]);

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
        const linksWithCurvature = [...graphData.links];
        const connectionCounter: Record<string, number> = {};

        linksWithCurvature.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const pairId = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
            if (!connectionCounter[pairId]) connectionCounter[pairId] = 0;
            link.pairIndex = connectionCounter[pairId];
            connectionCounter[pairId]++;
            link.isReversed = sourceId > targetId;
        });

        linksWithCurvature.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            const pairId = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
            const totalConnections = connectionCounter[pairId];
            const baseCurvatureStep = 0.15;
            const centralOffset = link.pairIndex - (totalConnections - 1) / 2;
            link.curvature = centralOffset * baseCurvatureStep * (link.isReversed ? -1 : 1);
        });

        return { nodes: graphData.nodes, links: linksWithCurvature };
    }, [graphData]);

    useEffect(() => {
        if (graphRef.current && graphDataWithCurvature.nodes.length > 0) {
            graphRef.current.d3Force('charge').strength(-150);
            graphRef.current.d3Force('link').distance(180);
            graphRef.current.d3Force('collide', d3.forceCollide().radius(30));
            graphRef.current.d3Force('center').strength(0.05);
            graphRef.current.d3ReheatSimulation();
        }
    }, [graphDataWithCurvature]);

    const fetchExistingInvestigation = async () => {
        if (!selectedCaseId) return;
        setStatus('uploading');
        try {
            const data = await apiService.getGraphData(selectedCaseId);
            onDataLoaded(data, selectedCaseId);
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    };

    const processNewInvestigation = async () => {
        if (!selectedFile) return;
        setStatus('uploading');
        try {
            const uploadResult = await apiService.uploadEvtx(selectedFile, newInvestigationName || 'Investigation');
            const data = await apiService.getGraphData(uploadResult.case_id);
            onDataLoaded(data, uploadResult.case_id);
            setStatus('success');
            setNewInvestigationName('');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    };

    const handleDeleteInvestigation = async (e: React.MouseEvent, caseIdToDelete: string) => {
        if (!caseIdToDelete) return;
        if (!window.confirm("Are you sure you want to permanently delete this investigation?")) return;
        try {
            await apiService.deleteInvestigation(caseIdToDelete);
            setInvestigationsList(prev => prev.filter(inv => inv.case_id !== caseIdToDelete));
            if (selectedCaseId === caseIdToDelete) setSelectedCaseId('');
        } catch (error) {
            console.error("Failed to delete investigation:", error);
            alert("Failed to delete the investigation.");
        }
    };

    return (
        <div className="graph-panel-container">
            <div className="top-toolbar">
                <div className="toolbar-left">
                    <h2 className="toolbar-title">ForensiFlow</h2>
                    <div className="mode-toggle">
                        <label className={mode === 'new' ? 'active' : ''}>
                            <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
                            New Investigation
                        </label>
                        <label className={mode === 'existing' ? 'active' : ''}>
                            <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />
                            Open Existing
                        </label>
                    </div>
                </div>

                <div className="toolbar-controls">
                    {mode === 'new' ? (
                        <>
                            <input
                                type="text"
                                className="modern-input"
                                placeholder="Investigation Name"
                                value={newInvestigationName}
                                onChange={(e) => setNewInvestigationName(e.target.value)}
                            />
                            <input
                                type="file"
                                className="modern-file-input"
                                accept=".evtx"
                                onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
                            />
                            <button className="btn-primary" onClick={processNewInvestigation} disabled={!selectedFile || status === 'uploading'}>
                                {status === 'uploading' ? 'Analyzing...' : 'Analyze'}
                            </button>
                        </>
                    ) : (
                        <>
                            <select
                                className="modern-select"
                                value={selectedCaseId}
                                onChange={(e) => setSelectedCaseId(e.target.value)}
                            >
                                <option value="" disabled>Select an Investigation...</option>
                                {investigationsList.map(inv => (
                                    <option key={inv.case_id} value={inv.case_id}>
                                        {inv.name} ({inv.case_id.substring(0, 8)})
                                    </option>
                                ))}
                            </select>

                            <button
                                className="btn-danger-icon"
                                onClick={(e) => handleDeleteInvestigation(e, selectedCaseId)}
                                disabled={!selectedCaseId || status === 'uploading'}
                                title="Delete Selected Investigation"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>

                            <button className="btn-primary" onClick={fetchExistingInvestigation} disabled={!selectedCaseId || status === 'uploading'}>
                                {status === 'uploading' ? 'Loading...' : 'Load'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="content-area">
                <div
                    className="graph-main-pane"
                    style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}
                >
                    {filtersComponent}

                    <div
                        className="canvas-wrapper"
                        ref={containerRef}
                        style={{ flex: 1, position: 'relative', minHeight: 0, minWidth: 0, overflow: 'hidden', width: '100%', height: '100%' }}
                    >
                        {dimensions.width > 0 && dimensions.height > 0 && graphDataWithCurvature.nodes.length > 0 ? (
                            <ForceGraph2D
                                ref={graphRef}
                                width={dimensions.width}
                                height={dimensions.height}
                                graphData={graphDataWithCurvature}
                                onLinkClick={onLinkClick}
                                cooldownTicks={100}
                                nodeCanvasObject={(node, ctx, globalScale) => drawNodeOnCanvas(node, ctx, globalScale, nodeIcons)}
                                linkCanvasObjectMode={() => 'replace'}
                                linkCanvasObject={(link, ctx, globalScale) => drawCurvedLinkOnCanvas(link, ctx, globalScale)}
                            />
                        ) : (
                            <div className="placeholder">
                                {status === 'uploading' ? 'Processing data...' : 'Select an investigation or upload an EVTX file to begin.'}
                            </div>
                        )}
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
};

export default GraphPanel;