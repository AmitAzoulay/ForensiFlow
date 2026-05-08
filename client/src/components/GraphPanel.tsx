import React, { useState, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { apiService } from "../services/api";
import './GraphPanel.css';
import * as d3 from 'd3-force';

// ==========================================
// CONSTANTS & HELPERS
// ==========================================
// const GRAPH_SETTINGS = {
//     NODE_RADIUS: 16,
//     LINK_COLOR: '#94a3b8',
//     LINK_WIDTH: 2,
//     ARROW_LENGTH: 10,
//     ARROW_WIDTH: 5,
//     NODE_MARGIN: 14,
//     LABEL_FONT_SIZE: 4
// };

const ICONS_SVG = {
    PROCESS: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    REGISTRY: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
    USER: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    COMPUTER: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23475569"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
    FILE: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2306b6d4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    TASK: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3zM12 4c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5z"/></svg>`,
    SERVICE: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6"><path d="M4 11h16v2H4zm0-4h16v2H4zm0 8h16v2H4zm-2-8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V7zm2 10h16V7H4v10z"/></svg>`
};

const drawNodeOnCanvas = (node: any, ctx: any, globalScale: number, nodeIcons: any) => {
    const rawLabel = node.properties?.name || node.name || node.id;
    const label = (rawLabel.length > 20) 
        ? rawLabel.substring(0, 12) + "..." 
        : rawLabel;

    const iconSize = (node.label === 'User' || node.label === 'Computer') ? 34 : 26;
    const iconImage = nodeIcons[node.label?.toLowerCase()] || nodeIcons['process'];

    if (iconImage) {
        ctx.drawImage(iconImage, node.x - iconSize / 2, node.y - iconSize / 2, iconSize, iconSize);
    }

    if (globalScale > 0.8) {
        const fontSize = 13 / globalScale; 
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const x = node.x;
        const y = node.y + iconSize / 2 + 5;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 4 / globalScale;
        ctx.strokeText(label, x, y);

        ctx.fillStyle = '#1e293b';
        ctx.fillText(label, x, y);
    }
};

const drawCurvedLinkOnCanvas = (link: any, ctx: any, globalScale: number) => {
    const start = link.source;
    const end = link.target;
    if (!start || !end || typeof start !== 'object' || typeof end !== 'object') return;

    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const curveness = link.curvature || 0;

    const cp = {
        x: start.x + deltaX / 2 + (deltaY * curveness),
        y: start.y + deltaY / 2 - (deltaX * curveness)
    };

    ctx.beginPath();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1 / globalScale;
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
    ctx.stroke();

    if (globalScale > 1.2) {
        const label = link.type || link.label || "";
        if (!label) return;
        const textX = 0.25 * start.x + 0.5 * cp.x + 0.25 * end.x;
        const textY = 0.25 * start.y + 0.5 * cp.y + 0.25 * end.y;
        const fontSize = Math.min(10, 12 / globalScale);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3 / globalScale;
        ctx.strokeText(label, textX, textY);
        ctx.fillStyle = '#64748b';
        ctx.fillText(label, textX, textY);
    }
};

interface GraphPanelProps {
    graphData: { nodes: any[], links: any[] };
    onLinkClick: (link: any) => void;
    onDataLoaded: (data: any, caseId: string) => void;
    children?: React.ReactNode;
}

const GraphPanel: React.FC<GraphPanelProps> = ({ graphData, onLinkClick, onDataLoaded, children }) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [investigationsList, setInvestigationsList] = useState<any[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [newInvestigationName, setNewInvestigationName] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [nodeIcons, setNodeIcons] = useState<Record<string, HTMLImageElement>>({});

    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);

    const toggleFilter = (category: string) => {
        setActiveFilters(prev => 
            prev.includes(category) 
                ? prev.filter(c => c !== category) 
                : [...prev, category]
        );
    };

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

    const filteredGraphData = useMemo(() => {
        if (!graphData || !graphData.nodes) return { nodes: [], links: [] };

        let keptNodes = graphData.nodes;
        if (activeFilters.length > 0) {
            keptNodes = keptNodes.filter(node => 
                activeFilters.includes(node.label?.toLowerCase())
            );
        }

        const evaluateMatch = (text: string, query: string) => {
            if (!query.trim()) return true;
            const orTerms = query.toLowerCase().split(/\s+or\s+/);
            return orTerms.some(orTerm => {
                const andTerms = orTerm.split(/\s+and\s+/);
                return andTerms.every(andTerm => {
                    let term = andTerm.trim();
                    let isNot = false;
                    if (term.startsWith('not ')) { isNot = true; term = term.substring(4).trim(); }
                    else if (term.startsWith('!')) { isNot = true; term = term.substring(1).trim(); }
                    if (!term) return true;
                    const contains = text.includes(term);
                    return isNot ? !contains : contains;
                });
            });
        };

        const finalLinks = graphData.links.filter(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            const isSourceVisible = keptNodes.some(n => n.id === sourceId);
            const isTargetVisible = keptNodes.some(n => n.id === targetId);
            if (!isSourceVisible || !isTargetVisible) return false;

            if (searchQuery.trim() === '') return true;

            const sourceNode = graphData.nodes.find(n => n.id === sourceId);
            const targetNode = graphData.nodes.find(n => n.id === targetId);
            const searchableText = `${sourceNode?.properties?.name || ''} ${targetNode?.properties?.name || ''} ${link.type || ''} ${link.details?.event_id || ''}`.toLowerCase();
            return evaluateMatch(searchableText, searchQuery);
        });

        const finalNodeIds = new Set();
        finalLinks.forEach(l => {
            finalNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
            finalNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
        });

        const finalNodes = searchQuery.trim() !== '' 
            ? keptNodes.filter(n => finalNodeIds.has(n.id))
            : keptNodes;

        return { nodes: finalNodes, links: finalLinks };
    }, [graphData, searchQuery, activeFilters]);

    const graphDataWithCurvature = useMemo(() => {
        if (!filteredGraphData || !filteredGraphData.links) return filteredGraphData;
        const linksWithCurvature = [...filteredGraphData.links];
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

        return { nodes: filteredGraphData.nodes, links: linksWithCurvature };
    }, [filteredGraphData]);

    useEffect(() => {
        if (graphRef.current && graphDataWithCurvature.nodes.length > 0) {
            graphRef.current.d3Force('charge').strength(-1500);
            graphRef.current.d3Force('link').distance(320);
            graphRef.current.d3Force('collide', d3.forceCollide().radius(70));
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
            setSearchQuery('');
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
            setSearchQuery('');
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

            {graphData.nodes.length > 0 && (
                <>
                    <div className="filter-chips-row">
                        <span className="filter-label">Quick Filter:</span>
                        {[
                            { id: 'user', label: 'Users' },
                            { id: 'process', label: 'Processes' },
                            { id: 'computer', label: 'Computers' },
                            { id: 'file', label: 'Files' },
                            { id: 'registry', label: 'Registry'},
                            { id: 'service', label: 'Services' },
                            { id: 'task', label: 'Scheduled Tasks'}
                        ].map(cat => {
                            const count = graphData.nodes.filter(n => n.label?.toLowerCase() === cat.id).length;
                            if (count === 0) return null;
                            return (
                                <button
                                    key={cat.id}
                                    className={`chip ${activeFilters.includes(cat.id) ? 'active' : ''}`}
                                    onClick={() => toggleFilter(cat.id)}
                                    style={{ '--active-color': cat.color } as any}
                                >
                                    <span className="chip-count">{count}</span>
                                    {cat.label}
                                </button>
                            );
                        })}
                        {activeFilters.length > 0 && (
                            <button className="clear-filters" onClick={() => setActiveFilters([])}>
                                Clear All
                            </button>
                        )}
                    </div>

                    <div className="search-bar-row">
                        <input
                            type="text"
                            className="modern-input full-width"
                            placeholder="Filter graph... (e.g., 'svchost OR 4688', 'admin AND NOT 4624')"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </>
            )}

            <div className="content-area">
                <div className="canvas-wrapper" ref={containerRef}>
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
                            linkPointerAreaPaint={(link, color, ctx) => {
                                const startNode = link.source as any;
                                const endNode = link.target as any;
                                if (!startNode || !endNode || startNode.x === undefined || endNode.x === undefined) return;
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
                                ctx.lineWidth = 12;
                                ctx.moveTo(startNode.x, startNode.y);
                                ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, endNode.x, endNode.y);
                                ctx.stroke();
                            }}
                            nodePointerAreaPaint={(node, color, ctx) => {
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, 13 + 4, 0, 2 * Math.PI);
                                ctx.fill();
                            }}
                        />
                    ) : (
                        <div className="placeholder">
                            {status === 'uploading' ? 'Processing data...' : 'Select an investigation or upload an EVTX file to begin.'}
                        </div>
                    )}
                </div>
                {children}
            </div>
        </div>
    );
};

export default GraphPanel;