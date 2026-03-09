import React, { useState } from 'react';
import GraphPanel from './components/GraphPanel';
import LogPanel from './components/LogPanel';
import AIAssistant from './components/AIAssistant'; // Added import
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
    <>
      <GraphPanel
        graphData={graphData}
        onLinkClick={handleLinkClick}
        onDataLoaded={handleDataLoaded}
      >
        <LogPanel
          selectedLink={selectedLink}
          caseId={caseId}
        />
      </GraphPanel>

      {/* Floating AI Assistant overlay */}
      <AIAssistant caseId={caseId} />
    </>
  );
}

export default App;