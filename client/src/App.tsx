import React, { useState, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './App.css';

const PROCESS_ICON_SRC = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="%23333333"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm0-4h2v2h-2z"/></svg>`;

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedLog, setSelectedLog] = useState(null);

  const [containerDimensions, setContainerDimensions] = useState({ width: 600, height: 600 });
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [processIconImg, setProcessIconImg] = useState(null);

  useEffect(() => {
    const img = new Image();
    img.src = PROCESS_ICON_SRC;
    img.onload = () => setProcessIconImg(img);
  }, []);


  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force('charge').strength(-300);
      graphRef.current.d3Force('link').distance(150);
      if (graphData.nodes.length > 0) graphRef.current.d3ReheatSimulation();
    }
  }, [graphData]);


  useEffect(() => {
    if (containerRef.current) {
      setContainerDimensions({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight
      });
    }
  }, [graphData]);

  const handleFileChange = (e) => setSelectedFile(e.target.files[0]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setStatus('uploading');
    const formData = new FormData();
    formData.append('evtxFile', selectedFile);

    try {
      await fetch('http://localhost:8000/api/parse-evtx', { method: 'POST', body: formData });
      const graphResponse = await fetch('http://localhost:8000/api/graph-data');
      const data = await graphResponse.json();
      setGraphData(data);
      setStatus('success');
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  return (
    <div className="main-layout">

      { }
      <div className="graph-panel">
        <div className="header">
          <h2>Story Graph</h2>
          <div className="controls">
            <input type="file" accept=".evtx" onChange={handleFileChange} />
            <button onClick={handleUpload} disabled={!selectedFile || status === 'uploading'}>
              {status === 'uploading' ? '...' : 'Upload'}
            </button>
          </div>
        </div>

        <div className="canvas-wrapper" ref={containerRef}>
          {graphData.nodes.length > 0 ? (
            <ForceGraph2D
              ref={graphRef}
              width={containerDimensions.width}
              height={containerDimensions.height}
              graphData={graphData}


              onLinkClick={(link) => {
                setSelectedLog(link.details);
              }}

              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.id.split('\\').pop().split('/').pop();
                const size = 24;
                if (processIconImg) ctx.drawImage(processIconImg, node.x - size / 2, node.y - size / 2, size, size);
                else { ctx.beginPath(); ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI); ctx.fill(); }

                const fontSize = 12 / globalScale;
                ctx.font = `bold ${fontSize}px Sans-Serif`;
                ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#000';
                ctx.fillText(label, node.x + size / 2 + 2, node.y - size / 2 + 4);
              }}

              linkDirectionalArrowLength={6}
              linkDirectionalArrowRelPos={1}
              linkColor={() => '#999'}
              linkWidth={2}

              linkCanvasObjectMode={() => 'after'}
              linkCanvasObject={(link, ctx) => {
                const label = "Process Creation";
                const fontSize = 4;
                const font = `${fontSize}px Sans-Serif`;
                const textPos = Object.assign({}, ...['x', 'y'].map(c => ({
                  [c]: link.source[c] + (link.target[c] - link.source[c]) / 2
                })));
                ctx.font = font;
                const bckgDimensions = [ctx.measureText(label).width, fontSize].map(n => n + fontSize * 0.2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(textPos.x - bckgDimensions[0] / 2, textPos.y - bckgDimensions[1] / 2, ...bckgDimensions);
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#444';
                ctx.fillText(label, textPos.x, textPos.y);
              }}
              backgroundColor="#ffffff"
            />
          ) : (
            <div className="placeholder">Upload an EVTX file to start</div>
          )}
        </div>
      </div>

      { }
      { }
      <div className="details-panel">
        <h2>Event Details</h2>
        <p className="hint">Click on an arrow (relationship) to view the log.</p>

        {selectedLog ? (
          <div className="log-card">
            <div className="log-item">
              <label>Event ID:</label>
              <span>{selectedLog.event_id}</span>
            </div>

            <div className="log-item">
              <label>Timestamp:</label>
              <span>{selectedLog.timestamp}</span>
            </div>

            <div className="log-item">
              <label>User:</label>
              <span>{selectedLog.domain}\{selectedLog.user}</span>
            </div>

            { }
            <div style={{ display: 'flex', gap: '20px' }}>
              <div className="log-item">
                <label>Creator PID (Parent):</label>
                <span className="highlight-pid">{selectedLog.parent_pid}</span>
              </div>
              <div className="log-item">
                <label>New PID (Child):</label>
                <span className="highlight-pid">{selectedLog.child_pid}</span>
              </div>
            </div>

            <div className="log-item full-width">
              <label>Command Line:</label>
              { }
              {(!selectedLog.command_line || selectedLog.command_line === '-') ? (
                <div className="empty-code">No Command Line Data</div>
              ) : (
                <div className="code-block">{selectedLog.command_line}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">No relationship selected</div>
        )}
      </div>
    </div>
  );
}

export default App;