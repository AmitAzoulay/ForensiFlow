import React, { useState, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

// --- VISUAL CONSTANTS ---
const NODE_RADIUS = 16;
const LINK_COLOR = '#94a3b8'; // softer gray for professional look
const LINK_WIDTH = 2;
const ARROW_LEN = 10;
const ARROW_WIDTH = 5;
const NODE_MARGIN = 14;

// --- ICONS CONFIGURATION ---
const PROCESS_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2310b981"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;
const REGISTRY_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2364748b"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`;
const USER_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%233b82f6"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
const COMPUTER_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23475569"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`;
const FILE_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2306b6d4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;

const GraphPanel = ({ graphData, onLinkClick, onDataLoaded }) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState('idle');

    const [mode, setMode] = useState('new');
    const [investigations, setInvestigations] = useState([]);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [invName, setInvName] = useState('');

    const [images, setImages] = useState({
        process: null, user: null, computer: null, file: null, registry: null
    });

    const containerRef = useRef(null);
    const graphRef = useRef(null);

    const fetchInvestigations = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/investigations');
            const data = await res.json();
            setInvestigations(data);
            if (data.length > 0 && !selectedCaseId) {
                setSelectedCaseId(data[0].case_id);
            }
        } catch (error) {
            console.error("Failed to load investigations:", error);
        }
    };

    useEffect(() => {
        fetchInvestigations();
    }, []);

    useEffect(() => {
        if (graphRef.current && graphData.nodes.length > 0) {
            graphRef.current.d3Force('charge').strength(-120);
            graphRef.current.d3Force('link').distance(180);
            graphRef.current.d3Force('center').strength(0.05);
            graphRef.current.d3ReheatSimulation();
        }
    }, [graphData]);

    useEffect(() => {
        const loadImg = (src) => {
            const img = new Image();
            img.src = src;
            return img;
        };

        const pImg = loadImg(PROCESS_ICON);
        const uImg = loadImg(USER_ICON);
        const cImg = loadImg(COMPUTER_ICON);
        const fImg = loadImg(FILE_ICON);
        const rImg = loadImg(REGISTRY_ICON);

        pImg.onload = () => setImages(prev => ({ ...prev, process: pImg }));
        uImg.onload = () => setImages(prev => ({ ...prev, user: uImg }));
        cImg.onload = () => setImages(prev => ({ ...prev, computer: cImg }));
        fImg.onload = () => setImages(prev => ({ ...prev, file: fImg }));
        rImg.onload = () => setImages(prev => ({ ...prev, registry: rImg }));
    }, []);

    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const handleLoadExisting = async () => {
        if (!selectedCaseId) return;
        setStatus('uploading');
        try {
            const graphResponse = await fetch(`http://localhost:8000/api/graph-data?case_id=${selectedCaseId}`);
            const data = await graphResponse.json();
            onDataLoaded(data, selectedCaseId);
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        setStatus('uploading');

        const formData = new FormData();
        formData.append('evtxFile', selectedFile);
        formData.append('invName', invName || 'Investigation');

        try {
            const uploadResponse = await fetch('http://localhost:8000/api/parse-evtx', {
                method: 'POST', body: formData
            });
            const uploadResult = await uploadResponse.json();

            const graphResponse = await fetch(`http://localhost:8000/api/graph-data?case_id=${uploadResult.case_id}`);
            const data = await graphResponse.json();

            onDataLoaded(data, uploadResult.case_id);
            fetchInvestigations();
            setStatus('success');
            setInvName('');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    };

    const getNodeLabel = (node) => {
        const props = node.properties || {};
        const labelName = props.name || node.name || node.id;
        return node.label === 'Process' ? `${labelName}` : labelName;
    };

    const getNodeIcon = (label) => {
        if (label === 'User') return images.user;
        if (label === 'Computer') return images.computer;
        if (label === 'File') return images.file;
        if (label === 'Registry') return images.registry;
        return images.process;
    };

    return (
        <div className="graph-panel">
            {/* Top Toolbar */}
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
                                placeholder="Enter Investigation Name"
                                value={invName}
                                onChange={(e) => setInvName(e.target.value)}
                            />
                            <input
                                type="file"
                                className="modern-file-input"
                                accept=".evtx"
                                onChange={(e) => setSelectedFile(e.target.files[0])}
                            />
                            <button className="btn-primary" onClick={handleUpload} disabled={!selectedFile || status === 'uploading'}>
                                {status === 'uploading' ? 'Processing...' : 'Analyze'}
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
                                {investigations.map(inv => (
                                    <option key={inv.case_id} value={inv.case_id}>
                                        {inv.name} ({inv.case_id.substring(0, 8)})
                                    </option>
                                ))}
                            </select>
                            <button className="btn-primary" onClick={handleLoadExisting} disabled={!selectedCaseId || status === 'uploading'}>
                                {status === 'uploading' ? 'Loading...' : 'Load'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Canvas */}
            <div className="canvas-wrapper" ref={containerRef}>
                {dimensions.width > 0 && dimensions.height > 0 && graphData.nodes.length > 0 ? (
                    <ForceGraph2D
                        ref={graphRef}
                        width={dimensions.width}
                        height={dimensions.height}
                        graphData={graphData}
                        onLinkClick={onLinkClick}
                        cooldownTicks={100}

                        nodeCanvasObject={(node, ctx, globalScale) => {
                            const label = getNodeLabel(node);
                            const size = 26;
                            const img = getNodeIcon(node.label);

                            if (img) {
                                ctx.drawImage(img, node.x - size / 2, node.y - size / 2, size, size);
                            } else {
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
                                ctx.fillStyle = '#64748b';
                                ctx.fill();
                            }

                            const fontSize = 11 / globalScale;
                            ctx.font = `500 ${fontSize}px Inter, sans-serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.fillStyle = '#1e293b';

                            const lines = label.split('\n');
                            lines.forEach((line, i) => {
                                ctx.fillText(line, node.x, node.y + size / 2 + 4 + (i * fontSize));
                            });
                        }}

                        nodePointerAreaPaint={(node, color, ctx) => {
                            const size = 26;
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, size / 2 + 4, 0, 2 * Math.PI);
                            ctx.fill();
                        }}

                        linkCanvasObjectMode={() => 'replace'}
                        linkCanvasObject={(link, ctx) => {
                            const start = { x: link.source.x, y: link.source.y };
                            const end = { x: link.target.x, y: link.target.y };

                            const dx = end.x - start.x;
                            const dy = end.y - start.y;
                            const length = Math.sqrt(dx * dx + dy * dy);
                            const totalOffset = NODE_RADIUS + NODE_MARGIN;
                            if (length < NODE_RADIUS * 2) return;

                            const ux = dx / length;
                            const uy = dy / length;

                            const sourceX = start.x + ux * totalOffset;
                            const sourceY = start.y + uy * totalOffset;
                            const targetTipX = end.x - ux * totalOffset;
                            const targetTipY = end.y - uy * totalOffset;

                            // Line
                            ctx.beginPath();
                            ctx.strokeStyle = LINK_COLOR;
                            ctx.lineWidth = LINK_WIDTH;
                            ctx.moveTo(sourceX, sourceY);
                            ctx.lineTo(targetTipX - ux * (ARROW_LEN * 0.8), targetTipY - uy * (ARROW_LEN * 0.8));
                            ctx.stroke();

                            // Arrowhead
                            const baseX = targetTipX - ux * ARROW_LEN;
                            const baseY = targetTipY - uy * ARROW_LEN;
                            const leftX = baseX - uy * ARROW_WIDTH;
                            const leftY = baseY + ux * ARROW_WIDTH;
                            const rightX = baseX + uy * ARROW_WIDTH;
                            const rightY = baseY - ux * ARROW_WIDTH;

                            ctx.beginPath();
                            ctx.fillStyle = LINK_COLOR;
                            ctx.moveTo(targetTipX, targetTipY);
                            ctx.lineTo(leftX, leftY);
                            ctx.lineTo(rightX, rightY);
                            ctx.closePath();
                            ctx.fill();

                            // Label
                            const label = link.type;
                            const fontSize = 4;
                            const textPos = { x: start.x + (end.x - start.x) / 2, y: start.y + (end.y - start.y) / 2 };

                            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
                            const textWidth = ctx.measureText(label).width;
                            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.6);

                            ctx.save();
                            ctx.translate(textPos.x, textPos.y);
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                            ctx.fillRect(-bckgDimensions[0] / 2, -bckgDimensions[1] / 2, ...bckgDimensions);
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#475569';
                            ctx.fillText(label, 0, 0);
                            ctx.restore();
                        }}
                    />
                ) : (
                    <div className="placeholder">
                        {status === 'uploading' ? 'Processing data...' : 'Select an investigation or upload an EVTX file to begin.'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GraphPanel;