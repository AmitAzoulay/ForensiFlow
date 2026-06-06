import React, { useState, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { apiService } from "../services/api";
import NodeContextMenu from './NodeContextMenu';
import './GraphPanel.css';

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
    SERVICE: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6"><path d="M4 11h16v2H4zm0-4h16v2H4zm0 8h16v2H4zm-2-8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V7zm2 10h16V7H4v10z"/></svg>`,
    GROUP: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366f1"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
};

const drawNodeOnCanvas = (node: any, ctx: any, globalScale: number, nodeIcons: any, selectedNodes: any[], activePlaybackNodeIds?: Set<string>) => {
    const isPlayback = activePlaybackNodeIds !== undefined;
    const isVisiblePlayback = isPlayback ? activePlaybackNodeIds.has(node.id) : true;

    ctx.save();

    if (isPlayback && !isVisiblePlayback) {
        ctx.globalAlpha = 0.15;
    } else if (isPlayback && isVisiblePlayback) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 15;
    }

    const rawLabel = node.properties?.name || node.name || node.id;
    const label = (rawLabel.length > 20) ? rawLabel.substring(0, 12) + "..." : rawLabel;
    const iconSize = (node.label === 'User' || node.label === 'Computer') ? 34 : 26;

    if (selectedNodes.some((n: any) => n.id === node.id)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, iconSize / 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
        ctx.fill();
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = '#eab308';
        ctx.stroke();
    } else if (node.is_red && (!isPlayback || isVisiblePlayback)) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, iconSize / 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.fill();
    }

    const iconImage = nodeIcons[node.label?.toLowerCase()] || nodeIcons['process'];
    if (iconImage) {
        ctx.drawImage(iconImage, node.x - iconSize / 2, node.y - iconSize / 2, iconSize, iconSize);
    }

    if (globalScale > 0.8) {
        const fontSize = Math.min(14, Math.max(10, 12 / globalScale));
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const x = node.x;
        const y = node.y + iconSize / 2 + 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3 / globalScale;
        ctx.strokeText(label, x, y);
        ctx.fillStyle = (node.is_red && (!isPlayback || isVisiblePlayback)) ? '#ef4444' : '#1e293b';
        ctx.fillText(label, x, y);
    }

    ctx.restore();
};

const drawCurvedLinkOnCanvas = (link: any, ctx: CanvasRenderingContext2D, globalScale: number, activePlaybackLinkIds?: Set<string>) => {
    const startNode = link.source;
    const endNode = link.target;
    if (!startNode || !endNode || typeof startNode !== 'object' || typeof endNode !== 'object') return;

    const deltaX = endNode.x - startNode.x;
    const deltaY = endNode.y - startNode.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance === 0) return;

    const isPlayback = activePlaybackLinkIds !== undefined;
    const isVisiblePlayback = isPlayback ? activePlaybackLinkIds.has(link.id) : true;

    ctx.save();

    if (isPlayback && !isVisiblePlayback) {
        ctx.globalAlpha = 0.05;
    } else if (isPlayback && isVisiblePlayback) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
    }

    const totalOffset = GRAPH_SETTINGS.NODE_RADIUS + GRAPH_SETTINGS.NODE_MARGIN;
    const normalVector = { x: -deltaY / distance, y: deltaX / distance };
    const controlPointOffset = (link.curvature || 0) * distance;
    const controlPoint = {
        x: startNode.x + deltaX / 2 + normalVector.x * controlPointOffset,
        y: startNode.y + deltaY / 2 + normalVector.y * controlPointOffset
    };

    const distToControlEnd = Math.sqrt(Math.pow(endNode.x - controlPoint.x, 2) + Math.pow(endNode.y - controlPoint.y, 2));
    const distToControlStart = Math.sqrt(Math.pow(startNode.x - controlPoint.x, 2) + Math.pow(startNode.y - controlPoint.y, 2));
    if (distToControlEnd === 0 || distToControlStart === 0) {
        ctx.restore();
        return;
    }

    const targetTipX = endNode.x - ((endNode.x - controlPoint.x) / distToControlEnd) * totalOffset;
    const targetTipY = endNode.y - ((endNode.y - controlPoint.y) / distToControlEnd) * totalOffset;
    const sourceTipX = startNode.x - ((startNode.x - controlPoint.x) / distToControlStart) * totalOffset;
    const sourceTipY = startNode.y - ((startNode.y - controlPoint.y) / distToControlStart) * totalOffset;

    const linkColor = link.is_red ? '#ef4444' : GRAPH_SETTINGS.LINK_COLOR;

    ctx.beginPath();
    ctx.strokeStyle = linkColor;
    ctx.lineWidth = Math.max((link.is_red ? 3 : GRAPH_SETTINGS.LINK_WIDTH) / globalScale, 0.8);
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
    ctx.fillStyle = linkColor;
    ctx.moveTo(targetTipX, targetTipY);
    ctx.lineTo(baseX - ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH, baseY + ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH);
    ctx.lineTo(baseX + ((endNode.y - controlPoint.y) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH, baseY - ((endNode.x - controlPoint.x) / distToControlEnd) * GRAPH_SETTINGS.ARROW_WIDTH);
    ctx.closePath();
    ctx.fill();

    if (globalScale >= 0.8) {
        const label = link.type || link.label || "";
        if (!label) {
            ctx.restore();
            return;
        }
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

        ctx.translate(textPos.x, textPos.y);
        ctx.rotate(textAngle);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(-bgDimensions[0] / 2, -bgDimensions[1] / 2 - (fontSize * 0.4), bgDimensions[0], bgDimensions[1]);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = link.is_red ? '#ef4444' : '#475569';
        ctx.fillText(label, 0, -(fontSize * 0.4));
    }

    ctx.restore();
};

interface GraphPanelProps {
    graphData: { nodes: any[], links: any[] };
    caseId?: string | null;
    refreshKey?: number;
    isPlaybackMode?: boolean;
    activePlaybackNodeIds?: Set<string>;
    activePlaybackLinkIds?: Set<string>;
    hasRedItems?: boolean;
    hasExistingQuery?: boolean;
    onDownloadReport?: () => void;
    onStartPlayback?: () => void;
    onLinkClick: (link: any) => void;
    onDataLoaded: (data: any, caseId: string | null) => void;
    onSendToAI: (type: 'node' | 'link', data: any) => void;
    onApplyNodeFilter: (node: any, appendMode?: 'AND' | 'OR') => void;
    onApplyEdit: (action: 'red' | 'unred' | 'delete', targetType: 'node' | 'link' | 'group', targetData: any) => void;
    onSaveEdited: (newName: string) => void;
    onIsolateLineage: (node: any) => void;
    children?: React.ReactNode;
    filtersComponent?: React.ReactNode;
}

const GraphPanel: React.FC<GraphPanelProps> = ({
    graphData,
    caseId,
    refreshKey = 0,
    isPlaybackMode = false,
    activePlaybackNodeIds,
    activePlaybackLinkIds,
    hasRedItems = false,
    hasExistingQuery = false,
    onDownloadReport,
    onStartPlayback,
    onLinkClick,
    onDataLoaded,
    onSendToAI,
    onApplyNodeFilter,
    onApplyEdit,
    onSaveEdited,
    onIsolateLineage,
    children,
    filtersComponent
}) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [investigationsList, setInvestigationsList] = useState<any[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [newInvestigationName, setNewInvestigationName] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [nodeIcons, setNodeIcons] = useState<Record<string, HTMLImageElement>>({});

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetLabel: string; targetType: 'node' | 'link' | 'group'; targetData: any } | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
    const [isLasso, setIsLasso] = useState(false);
    const [lassoBox, setLassoBox] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const pressTimer = useRef<any>(null);
    const initialClick = useRef<{ x: number, y: number } | null>(null);
    const hoveredItemRef = useRef<any>(null);

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
            group: loadSingleImage(ICONS_SVG.GROUP),
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
    }, [selectedCaseId, refreshKey]);

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
        if (graphRef.current) {
            graphRef.current.d3Force('charge').strength(-300);
            graphRef.current.d3Force('link').distance(350);
            graphRef.current.d3Force('center').strength(0.01);
            graphRef.current.d3ReheatSimulation();
        }
    }, [caseId, graphDataWithCurvature.nodes.length]);

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

    const handleDeleteInvestigation = async (idToDelete: string) => {
        if (!window.confirm("Are you sure you want to delete this investigation?")) return;
        try {
            await fetch(`http://localhost:8000/api/investigations/${idToDelete}`, {
                method: 'DELETE'
            });

            setInvestigationsList(prev => prev.filter(inv => inv.case_id !== idToDelete));

            if (selectedCaseId === idToDelete) {
                const remaining = investigationsList.filter(inv => inv.case_id !== idToDelete);
                setSelectedCaseId(remaining.length > 0 ? remaining[0].case_id : '');
            }
            if (caseId === idToDelete) {
                onDataLoaded({ nodes: [], links: [] }, null);
            }
        } catch (e) {
            console.error("Failed to delete", e);
        }
    };

    const handleNodeHover = (node: any) => {
        hoveredItemRef.current = node;
        const canvas = containerRef.current?.querySelector('canvas');
        if (canvas) {
            if (isPlaybackMode) {
                canvas.style.cursor = 'default';
            } else {
                canvas.style.cursor = node ? 'pointer' : (isLasso ? 'crosshair' : 'default');
            }
        }
    };

    const handleLinkHover = (link: any) => {
        hoveredItemRef.current = link;
        const canvas = containerRef.current?.querySelector('canvas');
        if (canvas) {
            if (isPlaybackMode) {
                canvas.style.cursor = 'default';
            } else {
                canvas.style.cursor = link ? 'pointer' : (isLasso ? 'crosshair' : 'default');
            }
        }
    };

    const handleContainerMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0 || isPlaybackMode) return;
        if (hoveredItemRef.current) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        initialClick.current = { x: e.clientX, y: e.clientY };

        pressTimer.current = setTimeout(() => {
            setIsLasso(true);
            setLassoBox({ x1: x, y1: y, x2: x, y2: y });
            setSelectedGroup({ nodes: [], links: [] });
            setContextMenu(null);
            const canvas = containerRef.current?.querySelector('canvas');
            if (canvas) canvas.style.cursor = 'crosshair';
        }, 500);
    };

    const handleContainerMouseMove = (e: React.MouseEvent) => {
        if (isPlaybackMode) return;
        if (isLasso) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            setLassoBox(prev => ({ ...prev, x2: e.clientX - rect.left, y2: e.clientY - rect.top }));
        } else if (initialClick.current) {
            const dx = Math.abs(e.clientX - initialClick.current.x);
            const dy = Math.abs(e.clientY - initialClick.current.y);
            if (dx > 5 || dy > 5) {
                clearTimeout(pressTimer.current);
                initialClick.current = null;
            }
        }
    };

    const handleContainerMouseUp = () => {
        if (isPlaybackMode) return;
        clearTimeout(pressTimer.current);
        initialClick.current = null;
        if (isLasso) {
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

            if (selectedNodes.length > 0) {
                setSelectedGroup({ nodes: selectedNodes, links: [] });
            }
        }
    };

    const triggerSave = () => {
        const name = prompt("Enter a name for the edited investigation:");
        if (name) {
            onSaveEdited(name);
        }
    };

    return (
        <div className="graph-panel-container">
            <div className="top-toolbar">
                <div className="toolbar-left">
                    <h2 className="toolbar-title">ForensiFlow</h2>
                    <div className="mode-toggle">
                        <label className={mode === 'new' ? 'active' : ''}>
                            <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} disabled={isPlaybackMode} />
                            New Investigation
                        </label>
                        <label className={mode === 'existing' ? 'active' : ''}>
                            <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} disabled={isPlaybackMode} />
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
                                disabled={isPlaybackMode}
                            />
                            <input
                                type="file"
                                className="modern-file-input"
                                accept=".evtx"
                                onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
                                disabled={isPlaybackMode}
                            />
                            <button className="btn-primary" onClick={processNewInvestigation} disabled={!selectedFile || status === 'uploading' || isPlaybackMode}>
                                {status === 'uploading' ? 'Analyzing...' : 'Analyze'}
                            </button>
                        </>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <select
                                    className="modern-select"
                                    value={selectedCaseId}
                                    onChange={(e) => setSelectedCaseId(e.target.value)}
                                    disabled={isPlaybackMode}
                                >
                                    <option value="" disabled>Select an Investigation...</option>
                                    {investigationsList.map(inv => (
                                        <option key={inv.case_id} value={inv.case_id}>
                                            {inv.name} ({inv.case_id.substring(0, 8)})
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => handleDeleteInvestigation(selectedCaseId)}
                                    disabled={!selectedCaseId || isPlaybackMode}
                                    style={{ background: 'none', border: 'none', cursor: selectedCaseId && !isPlaybackMode ? 'pointer' : 'default', padding: '5px', opacity: selectedCaseId && !isPlaybackMode ? 1 : 0.5 }}
                                    title="Delete Investigation"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                            <button className="btn-primary" onClick={fetchExistingInvestigation} disabled={!selectedCaseId || status === 'uploading' || isPlaybackMode}>
                                {status === 'uploading' ? 'Loading...' : 'Load'}
                            </button>
                            
                            {caseId && !isPlaybackMode && hasRedItems && (
                                <button className="btn-primary" onClick={onStartPlayback} style={{ marginLeft: '10px', background: 'linear-gradient(to right, #ef4444, #b91c1c)', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    Play Attack Path
                                </button>
                            )}
                            
                            {/* כפתור ההורדה החדש שלך */}
                            {onDownloadReport && hasRedItems && !isPlaybackMode && (
                                <button 
                                    onClick={onDownloadReport}
                                    title="Download Forensics Report"
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        backgroundColor: 'white', 
                                        color: '#334155', 
                                        padding: '8px 12px', 
                                        borderRadius: '6px', 
                                        border: '1px solid #cbd5e1', 
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                        marginLeft: '8px',
                                        marginRight: '8px',
                                        height: '36px'
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                </button>
                            )}

                            {caseId && (
                                <button className="btn-secondary" onClick={triggerSave} disabled={isPlaybackMode} style={{ marginLeft: '10px' }}>
                                    Save Edited
                                </button>
                            )}
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
                                enableZoomPanInteraction={!isLasso}
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
                                onLinkClick={(link) => {
                                    if (isPlaybackMode) return;
                                    setContextMenu(null);
                                    setSelectedGroup({ nodes: [], links: [] });
                                    onLinkClick(link);
                                }}
                                onBackgroundClick={() => {
                                    if (isPlaybackMode) return;
                                    setIsLasso(false);
                                    const canvas = containerRef.current?.querySelector('canvas');
                                    if (canvas) canvas.style.cursor = 'default';
                                    setContextMenu(null);
                                    setSelectedGroup({ nodes: [], links: [] });
                                }}
                                onBackgroundRightClick={(event) => {
                                    if (isPlaybackMode) return;
                                    if (selectedGroup.nodes.length > 0 && containerRef.current) {
                                        const rect = containerRef.current.getBoundingClientRect();
                                        setContextMenu({
                                            x: event.clientX - rect.left,
                                            y: event.clientY - rect.top,
                                            targetType: 'group',
                                            targetData: selectedGroup,
                                            targetLabel: `${selectedGroup.nodes.length} Elements Selected`
                                        });
                                    } else {
                                        setContextMenu(null);
                                    }
                                }}
                                onNodeClick={() => {
                                    if (isPlaybackMode) return;
                                    setContextMenu(null);
                                    setSelectedGroup({ nodes: [], links: [] });
                                }}
                                onNodeRightClick={(node, event) => {
                                    event.preventDefault();
                                    if (isPlaybackMode) return;
                                    if (containerRef.current) {
                                        const rect = containerRef.current.getBoundingClientRect();
                                        const isGroup = selectedGroup.nodes.some(n => n.id === node.id);
                                        setContextMenu({
                                            x: event.clientX - rect.left,
                                            y: event.clientY - rect.top,
                                            targetType: isGroup ? 'group' : 'node',
                                            targetData: isGroup ? selectedGroup : node,
                                            targetLabel: isGroup ? `${selectedGroup.nodes.length} Elements Selected` : node.properties?.name || node.name || node.id
                                        });
                                    }
                                }}
                                onLinkRightClick={(link, event) => {
                                    if (isPlaybackMode) return;
                                    if (containerRef.current) {
                                        const rect = containerRef.current.getBoundingClientRect();
                                        setContextMenu({
                                            x: event.clientX - rect.left,
                                            y: event.clientY - rect.top,
                                            targetType: 'link',
                                            targetData: link,
                                            targetLabel: link.type || 'Connection'
                                        });
                                    }
                                }}
                                cooldownTicks={100}
                                nodeCanvasObject={(node, ctx, globalScale) => drawNodeOnCanvas(node, ctx, globalScale, nodeIcons, selectedGroup.nodes, activePlaybackNodeIds)}
                                linkCanvasObjectMode={() => 'replace'}
                                linkCanvasObject={(link, ctx, globalScale) => drawCurvedLinkOnCanvas(link, ctx, globalScale, activePlaybackLinkIds)}
                            />
                        ) : (
                            <div className="placeholder">
                                {status === 'uploading' ? 'Processing data...' : 'Select an investigation or upload an EVTX file to begin.'}
                            </div>
                        )}

                        {isLasso && (
                            <div style={{
                                position: 'absolute',
                                border: '1px solid #0078d7',
                                backgroundColor: 'rgba(0, 120, 215, 0.4)',
                                left: Math.min(lassoBox.x1, lassoBox.x2),
                                top: Math.min(lassoBox.y1, lassoBox.y2),
                                width: Math.abs(lassoBox.x2 - lassoBox.x1),
                                height: Math.abs(lassoBox.y2 - lassoBox.y1),
                                pointerEvents: 'none'
                            }} />
                        )}

                        {contextMenu && (
                            <NodeContextMenu
                                x={contextMenu.x}
                                y={contextMenu.y}
                                targetLabel={contextMenu.targetLabel}
                                targetType={contextMenu.targetType}
                                targetData={contextMenu.targetData}
                                hasExistingQuery={hasExistingQuery}
                                onClose={() => setContextMenu(null)}
                                onSendToAI={onSendToAI}
                                onApplyFilter={onApplyNodeFilter}
                                onApplyEdit={(action) => onApplyEdit(action, contextMenu.targetType, contextMenu.targetData)}
                                onIsolateLineage={onIsolateLineage}
                            />
                        )}
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
};

export default GraphPanel;