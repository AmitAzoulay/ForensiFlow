import React, { useState, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

// --- VISUAL CONSTANTS ---
const NODE_RADIUS = 16;
const LINK_COLOR = '#555555';
const LINK_WIDTH = 3;
const ARROW_LEN = 12;
const ARROW_WIDTH = 6;
const NODE_MARGIN = 12;
// --- ICONS CONFIGURATION ---

// Process: Green Gear
const PROCESS_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234CAF50"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;

// Registry: Gold Key Icon (NEW)
const REGISTRY_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2378909C"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`;

// User: Blue Person
const USER_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232196F3"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

// Computer: Grey Laptop
const COMPUTER_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23607D8B"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`;

// File: Teal Doc
const FILE_ICON = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2300BCD4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;


const GraphPanel = ({ graphData, onLinkClick, onDataLoaded }) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [selectedFile, setSelectedFile] = useState(null);
    const [status, setStatus] = useState('idle');

    const [images, setImages] = useState({
        process: null,
        user: null,
        computer: null,
        file: null,
        registry: null
    });

    const containerRef = useRef(null);
    const graphRef = useRef(null);

    // --- Physics ---
    useEffect(() => {
        if (graphRef.current && graphData.nodes.length > 0) {
            graphRef.current.d3Force('charge').strength(-100);
            graphRef.current.d3Force('link').distance(150);
            graphRef.current.d3Force('center').strength(0.05);
            graphRef.current.d3ReheatSimulation();
        }
    }, [graphData]);

    // --- Preload Images ---
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

    // --- Resize ---
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

    const handleUpload = async () => {
        if (!selectedFile) return;
        setStatus('uploading');
        const formData = new FormData();
        formData.append('evtxFile', selectedFile);

        try {
            const uploadResponse = await fetch('http://localhost:8000/api/parse-evtx', {
                method: 'POST', body: formData
            });
            const uploadResult = await uploadResponse.json();

            const graphResponse = await fetch(`http://localhost:8000/api/graph-data?case_id=${uploadResult.case_id}`);
            const data = await graphResponse.json();

            onDataLoaded(data, uploadResult.case_id);
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    };

    const getNodeLabel = (node) => {
        const props = node.properties || {};
        const labelName = props.name || node.name || node.id;

        if (node.label === 'Process') {
            return `${labelName}`;
        }
        return labelName;
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
            <div className="header">
                <h2>ForensiFlow Graph</h2>
                <div className="controls">
                    <input type="file" accept=".evtx" onChange={(e) => setSelectedFile(e.target.files[0])} />
                    <button onClick={handleUpload} disabled={!selectedFile || status === 'uploading'}>
                        {status === 'uploading' ? 'Analyzing...' : 'Upload & Analyze'}
                    </button>
                </div>
            </div>

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
                            const size = 24;
                            const img = getNodeIcon(node.label);

                            if (img) {
                                ctx.drawImage(img, node.x - size / 2, node.y - size / 2, size, size);
                            } else {
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                                ctx.fillStyle = '#999';
                                ctx.fill();
                            }

                            const fontSize = 10 / globalScale;
                            ctx.font = `${fontSize}px Sans-Serif`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.fillStyle = '#000';

                            const lines = label.split('\n');
                            lines.forEach((line, i) => {
                                ctx.fillText(line, node.x, node.y + size / 2 + 2 + (i * fontSize));
                            });
                        }}

                        nodePointerAreaPaint={(node, color, ctx) => {
                            const size = 24;
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, size / 2 + 2, 0, 2 * Math.PI);
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
                            const fontSize = 3.5;
                            const textPos = { x: start.x + (end.x - start.x) / 2, y: start.y + (end.y - start.y) / 2 };

                            ctx.font = `${fontSize}px Sans-Serif`;
                            const textWidth = ctx.measureText(label).width;
                            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

                            ctx.save();
                            ctx.translate(textPos.x, textPos.y);
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                            ctx.fillRect(-bckgDimensions[0] / 2, -bckgDimensions[1] / 2, ...bckgDimensions);
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = LINK_COLOR;
                            ctx.fillText(label, 0, 0);
                            ctx.restore();
                        }}
                    />
                ) : (
                    <div className="placeholder">
                        {graphData.nodes.length === 0 ? "Upload an EVTX file" : "Loading Graph..."}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GraphPanel;