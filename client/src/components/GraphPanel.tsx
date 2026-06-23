import React, { useState, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { apiService } from "../services/api";
import NodeContextMenu from './NodeContextMenu';
import NotebookPopup from './NotebookPopup.tsx';
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

const drawNodeOnCanvas = (
    node: any,
    ctx: any,
    globalScale: number,
    nodeIcons: any,
    selectedNodes: any[],
    activePlaybackNodeIds?: Set<string>,
    themeColors?: { label: string; labelStroke: string }
) => {
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
        ctx.strokeStyle = themeColors?.labelStroke || 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3 / globalScale;
        ctx.strokeText(label, x, y);
        ctx.fillStyle = (node.is_red && (!isPlayback || isVisiblePlayback)) ? '#ef4444' : (themeColors?.label || '#1e293b');
        ctx.fillText(label, x, y);
    }

    ctx.restore();
};

const drawCurvedLinkOnCanvas = (
    link: any,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
    activePlaybackLinkIds?: Set<string>,
    themeColors?: { link: string; bundle: string }
) => {
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

    let linkColor = link.is_red ? '#ef4444' : (themeColors?.link || GRAPH_SETTINGS.LINK_COLOR);
    if (link.isBundle) linkColor = themeColors?.bundle || '#0f172a';

    ctx.beginPath();
    ctx.strokeStyle = linkColor;
    ctx.lineWidth = Math.max((link.is_red || link.isBundle ? 3 : GRAPH_SETTINGS.LINK_WIDTH) / globalScale, 0.8);
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

        ctx.font = link.isBundle ? `700 ${fontSize}px Inter, sans-serif` : `600 ${fontSize}px Inter, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const bgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.6);

        ctx.translate(textPos.x, textPos.y);
        ctx.rotate(textAngle);
        ctx.fillStyle = link.isBundle ? 'rgba(241, 245, 249, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(-bgDimensions[0] / 2, -bgDimensions[1] / 2 - (fontSize * 0.4), bgDimensions[0], bgDimensions[1]);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = link.isBundle ? '#0f172a' : (link.is_red ? '#ef4444' : '#475569');
        ctx.fillText(label, 0, -(fontSize * 0.4));
    }

    ctx.restore();
};

interface GraphPanelProps {
    graphData: { nodes: any[], links: any[] };
    caseId?: string | null;
    currentTheme?: 'light' | 'dark';
    notebookText?: string;
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
    onNotebookChange?: (text: string) => void;
    onNotebookClear?: () => void;
    onToggleTheme?: () => void;
    onResetAppState?: () => void;
    children?: React.ReactNode;
    filtersComponent?: React.ReactNode;
}

const GraphPanel: React.FC<GraphPanelProps> = ({
    graphData,
    caseId,
    currentTheme = 'light',
    notebookText = '',
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
    onNotebookChange,
    onNotebookClear,
    onToggleTheme,
    onResetAppState,
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
    const [bundlePopup, setBundlePopup] = useState<{ x: number; y: number; links: any[] } | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
    const [isLasso, setIsLasso] = useState(false);
    const [lassoBox, setLassoBox] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });
    const [showHelp, setShowHelp] = useState(false);
    const [showNotebook, setShowNotebook] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const isLassoRef = useRef(false);
    const hoveredItemRef = useRef<any>(null);

    const themeColors = useMemo(() => {
        if (currentTheme === 'dark') {
            return {
                label: '#e2e8f0',
                labelStroke: 'rgba(2, 8, 23, 0.9)',
                link: '#64748b',
                bundle: '#cbd5e1',
                canvasBg: '#0a1324'
            };
        }

        return {
            label: '#1e293b',
            labelStroke: 'rgba(255, 255, 255, 0.9)',
            link: '#94a3b8',
            bundle: '#0f172a',
            canvasBg: '#f8fafc'
        };
    }, [currentTheme]);

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
                console.error(error);
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
                    const baseCurvatureStep = 0.15;
                    const centralOffset = index - (directions.length - 1) / 2;

                    processedLinks.push({
                        ...representative,
                        id: `bundle-${representative._sourceId}-${representative._targetId}`,
                        type: `${dirGroup.length} Events`,
                        isBundle: true,
                        bundledLinks: dirGroup,
                        curvature: directions.length > 1 ? (centralOffset * baseCurvatureStep * (isReversed ? -1 : 1)) : 0
                    });
                });
            } else {
                group.forEach((link, index) => {
                    const isReversed = link._sourceId > link._targetId;
                    const baseCurvatureStep = 0.15;
                    const centralOffset = index - (group.length - 1) / 2;
                    link.curvature = centralOffset * baseCurvatureStep * (isReversed ? -1 : 1);
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
            console.error(e);
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
        if (!e.ctrlKey) return;
        if (hoveredItemRef.current) return;

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
        if (isPlaybackMode) return;
        if (isLassoRef.current) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            setLassoBox(prev => ({ ...prev, x2: e.clientX - rect.left, y2: e.clientY - rect.top }));
        }
    };

    const handleContainerMouseUp = () => {
        if (isPlaybackMode) return;
        if (isLassoRef.current) {
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
            <div className="top-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '16px 32px', gap: '24px', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', boxSizing: 'border-box' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={onResetAppState}
                        title="Reset to clean state"
                        aria-label="Reset to clean state"
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                            cursor: onResetAppState ? 'pointer' : 'default',
                            color: 'inherit'
                        }}
                    >
                        <h2 className="toolbar-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>ForensiFlow</h2>
                    </button>
                    <button
                        onClick={onToggleTheme}
                        title={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
                        aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
                        style={{
                            width: '36px', height: '36px', borderRadius: '8px',
                            backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                            cursor: 'pointer', boxShadow: 'var(--shadow-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        {currentTheme === 'light' ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0a7 7 0 0 0 9.79 9.79z"></path>
                            </svg>
                        ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5"></circle>
                                <line x1="12" y1="1" x2="12" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="23"></line>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                <line x1="1" y1="12" x2="3" y2="12"></line>
                                <line x1="21" y1="12" x2="23" y2="12"></line>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                            </svg>
                        )}
                    </button>
                    <div style={{ display: 'flex', backgroundColor: 'var(--surface-alt)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border)' }}>
                        <button
                            onClick={() => setMode('new')}
                            disabled={isPlaybackMode}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: mode === 'new' ? 600 : 500,
                                backgroundColor: mode === 'new' ? 'var(--surface)' : 'transparent', color: mode === 'new' ? 'var(--text-primary)' : 'var(--text-muted)',
                                boxShadow: mode === 'new' ? 'var(--shadow-soft)' : 'none', cursor: isPlaybackMode ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isPlaybackMode ? 0.6 : 1
                            }}
                        >
                            New Investigation
                        </button>
                        <button
                            onClick={() => setMode('existing')}
                            disabled={isPlaybackMode}
                            style={{
                                padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: mode === 'existing' ? 600 : 500,
                                backgroundColor: mode === 'existing' ? 'var(--surface)' : 'transparent', color: mode === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)',
                                boxShadow: mode === 'existing' ? 'var(--shadow-soft)' : 'none', cursor: isPlaybackMode ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isPlaybackMode ? 0.6 : 1
                            }}
                        >
                            Open Existing
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
                            <button className="btn-primary" onClick={processNewInvestigation} disabled={!selectedFile || status === 'uploading' || isPlaybackMode} style={{ minWidth: '90px' }}>
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
                            <button className="btn-primary" onClick={fetchExistingInvestigation} disabled={!selectedCaseId || status === 'uploading' || isPlaybackMode} style={{ minWidth: '90px' }}>
                                {status === 'uploading' ? 'Loading...' : 'Load'}
                            </button>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
                    {caseId && !isPlaybackMode && hasRedItems && onDownloadReport && (
                        <button
                            onClick={onDownloadReport}
                            title="Download Forensics Report"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', padding: '8px 12px',
                                    borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer',
                                    boxShadow: 'var(--shadow-soft)', height: '36px'
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
                        <button
                            onClick={() => setShowNotebook(true)}
                            disabled={isPlaybackMode}
                            style={{
                                backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                                padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: isPlaybackMode ? 'default' : 'pointer',
                                boxShadow: 'var(--shadow-soft)', height: '36px', opacity: isPlaybackMode ? 0.6 : 1
                            }}
                        >
                            Notebook
                        </button>
                    )}

                    {caseId && (
                        <button
                            onClick={triggerSave}
                            disabled={isPlaybackMode}
                            style={{
                                backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                                padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: isPlaybackMode ? 'default' : 'pointer',
                                boxShadow: 'var(--shadow-soft)', height: '36px', opacity: isPlaybackMode ? 0.6 : 1
                            }}
                        >
                            Save Edited
                        </button>
                    )}

                    {caseId && !isPlaybackMode && hasRedItems && onStartPlayback && (
                        <button
                            onClick={onStartPlayback}
                            style={{
                                background: 'linear-gradient(to right, #ef4444, #b91c1c)', color: 'white', border: 'none',
                                display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold',
                                padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', height: '36px',
                                boxShadow: '0 4px 6px rgba(239, 68, 68, 0.25)'
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            Play Attack Path
                        </button>
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
                                        y: startNode.y + deltaY / 2 + normalVector.y * controlPointOffset
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
                                            const resolvedLinks = link.bundledLinks.map((bl: any) => ({
                                                ...bl,
                                                source: link.source,
                                                target: link.target
                                            }));

                                            setBundlePopup({
                                                x: event.clientX - rect.left,
                                                y: event.clientY - rect.top,
                                                links: resolvedLinks
                                            });
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
                                            targetLabel: isGroup ? `${selectedGroup.nodes.length} Elements Selected` : node.properties?.name || node.name || node.id
                                        });
                                    }
                                }}
                                onLinkRightClick={(link, event) => {
                                    if (isPlaybackMode || link.isBundle) return;
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
                                nodeCanvasObject={(node, ctx, globalScale) => drawNodeOnCanvas(node, ctx, globalScale, nodeIcons, selectedGroup.nodes, activePlaybackNodeIds, themeColors)}
                                linkCanvasObjectMode={() => 'replace'}
                                linkCanvasObject={(link, ctx, globalScale) => drawCurvedLinkOnCanvas(link, ctx, globalScale, activePlaybackLinkIds, themeColors)}
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

                        {bundlePopup && (
                            <div style={{
                                position: 'absolute',
                                top: bundlePopup.y,
                                left: bundlePopup.x,
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                boxShadow: 'var(--shadow-strong)',
                                zIndex: 1000,
                                maxHeight: '300px',
                                overflowY: 'auto',
                                width: '280px',
                                fontFamily: 'Inter, sans-serif'
                            }}>
                                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, backgroundColor: 'var(--surface-alt)', fontSize: '13px', color: 'var(--text-primary)' }}>
                                    Select Event ({bundlePopup.links.length})
                                    <button
                                        onClick={() => setBundlePopup(null)}
                                        style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                    >✕</button>
                                </div>
                                <div style={{ padding: '4px' }}>
                                    {bundlePopup.links.map((l, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                onLinkClick(l);
                                                setBundlePopup(null);
                                            }}
                                            style={{
                                                padding: '8px',
                                                borderBottom: i < bundlePopup.links.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-alt)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.type}</div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                                {l.details?.timestamp ? new Date(l.details.timestamp).toLocaleString() : (l.details?.event_id || 'N/A')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            className="help-btn"
                            onClick={() => setShowHelp(v => !v)}
                            title="Navigation help"
                        >
                            ?
                        </button>

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
                {children}
            </div>

            <NotebookPopup
                isOpen={showNotebook}
                caseId={caseId || null}
                notebookText={notebookText}
                onNotebookChange={(text: string) => onNotebookChange?.(text)}
                onClearNotes={() => onNotebookClear?.()}
                onClose={() => setShowNotebook(false)}
            />
        </div>
    );
};

export default GraphPanel;