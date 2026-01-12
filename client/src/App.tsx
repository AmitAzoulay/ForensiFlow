import React, { useState } from 'react';
import GraphPanel from './components/GraphPanel';
import LogPanel from './components/LogPanel';
import './App.css';

function App() {

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedLink, setSelectedLink] = useState(null);
  const [caseId, setCaseId] = useState(null);


  const handleDataLoaded = (data, newCaseId) => {
    setGraphData(data);
    setCaseId(newCaseId);
    setSelectedLink(null);
  };


  const handleLinkClick = (link) => {
    setSelectedLink(link);
  };

  return (
    <div className="main-layout">
      {/* Dashboard 1: Graph Visualization */}
      <GraphPanel
        graphData={graphData}
        onLinkClick={handleLinkClick}
        onDataLoaded={handleDataLoaded}
      />

      {/* Dashboard 2: Log Details */}
      <LogPanel
        selectedLink={selectedLink}
        caseId={caseId}
      />
    </div>
  );
}

export default App;