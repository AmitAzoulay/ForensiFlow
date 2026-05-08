import React, { useState, useEffect, useMemo } from 'react';
import GraphPanel from './components/GraphPanel';
import LogPanel from './components/LogPanel';
import AIAssistant from './components/AIAssistant';
import TimelineFilter from './components/TimeLineFilter';
import './App.css';

const extractTimestamp = (obj: any): number | null => {
  if (!obj) return null;
  if (obj.timestamp) return new Date(obj.timestamp).getTime();
  if (obj.time) return new Date(obj.time).getTime();
  if (obj.details?.timestamp) return new Date(obj.details.timestamp).getTime();
  if (obj.details?.System?.TimeCreated?.SystemTime) return new Date(obj.details.System.TimeCreated.SystemTime).getTime();
  return null;
};

function App() {
  const [rawGraphData, setRawGraphData] = useState({ nodes: [], links: [] });
  const [selectedLink, setSelectedLink] = useState(null);
  const [caseId, setCaseId] = useState(null);

  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [globalTimeBounds, setGlobalTimeBounds] = useState<{ min: number; max: number } | null>(null);
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);

  const handleDataLoaded = (data: any, newCaseId: any) => {
    setRawGraphData(data);
    setCaseId(newCaseId);
    setSelectedLink(null);
    setSearchQuery('');
    setActiveFilters([]);
  };

  const handleLinkClick = (link: any) => {
    setSelectedLink(link);
  };

  const toggleFilter = (category: string) => {
    setActiveFilters(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  useEffect(() => {
    if (!rawGraphData || !rawGraphData.links || rawGraphData.links.length === 0) {
      setGlobalTimeBounds(null);
      setTimeRange(null);
      return;
    }

    let min = Infinity;
    let max = -Infinity;

    rawGraphData.links.forEach((link: any) => {
      const t = extractTimestamp(link);
      if (t) {
        if (t < min) min = t;
        if (t > max) max = t;
      }
    });

    if (min !== Infinity && max !== -Infinity && min !== max) {
      setGlobalTimeBounds({ min, max });
      setTimeRange({ start: min, end: max });
    } else {
      setGlobalTimeBounds(null);
      setTimeRange(null);
    }
  }, [rawGraphData]);

  const filteredGraphData = useMemo(() => {
    if (!rawGraphData || !rawGraphData.nodes) return { nodes: [], links: [] };

    let keptNodes = rawGraphData.nodes;
    if (activeFilters.length > 0) {
      keptNodes = keptNodes.filter((node: any) =>
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

    const finalLinks = rawGraphData.links.filter((link: any) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      const isSourceVisible = keptNodes.some((n: any) => n.id === sourceId);
      const isTargetVisible = keptNodes.some((n: any) => n.id === targetId);
      if (!isSourceVisible || !isTargetVisible) return false;

      if (timeRange) {
        const t = extractTimestamp(link);
        if (t && (t < timeRange.start || t > timeRange.end)) {
          return false;
        }
      }

      if (searchQuery.trim() === '') return true;

      const sourceNode = rawGraphData.nodes.find((n: any) => n.id === sourceId);
      const targetNode = rawGraphData.nodes.find((n: any) => n.id === targetId);
      const searchableText = `${sourceNode?.properties?.name || ''} ${targetNode?.properties?.name || ''} ${link.type || ''} ${link.details?.event_id || ''}`.toLowerCase();
      return evaluateMatch(searchableText, searchQuery);
    });

    const finalNodeIds = new Set();
    finalLinks.forEach((l: any) => {
      finalNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
      finalNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
    });

    const isTimeFiltered = timeRange && globalTimeBounds &&
      (timeRange.start > globalTimeBounds.min || timeRange.end < globalTimeBounds.max);

    const finalNodes = (searchQuery.trim() !== '' || isTimeFiltered)
      ? keptNodes.filter((n: any) => finalNodeIds.has(n.id))
      : keptNodes;

    return { nodes: finalNodes, links: finalLinks };
  }, [rawGraphData, searchQuery, activeFilters, timeRange, globalTimeBounds]);

  const filtersUI = rawGraphData.nodes.length > 0 ? (
    <div className="filters-wrapper">
      <div className="filter-chips-row">
        <span className="filter-label">Quick Filter:</span>
        {[
          { id: 'user', label: 'Users' },
          { id: 'process', label: 'Processes' },
          { id: 'computer', label: 'Computers' },
          { id: 'file', label: 'Files' },
          { id: 'registry', label: 'Registry' },
          { id: 'service', label: 'Services' },
          { id: 'task', label: 'Scheduled Tasks' }
        ].map(cat => {
          const count = rawGraphData.nodes.filter((n: any) => n.label?.toLowerCase() === cat.id).length;
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

      <div className="filter-chips-row" style={{ paddingTop: 0 }}>
        <span className="filter-label">Advanced Filter:</span>
        <input
          type="text"
          className="modern-input"
          style={{ flex: 1, margin: 0 }}
          placeholder="Filter graph... (e.g., 'svchost OR 4688', 'admin AND NOT 4624')"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {globalTimeBounds && timeRange && (
        <TimelineFilter
          minTime={globalTimeBounds.min}
          maxTime={globalTimeBounds.max}
          startTime={timeRange.start}
          endTime={timeRange.end}
          onChange={(start, end) => setTimeRange({ start, end })}
        />
      )}
    </div>
  ) : null;

  return (
    <>
      <GraphPanel
        graphData={filteredGraphData}
        onLinkClick={handleLinkClick}
        onDataLoaded={handleDataLoaded}
        filtersComponent={filtersUI}
      >
        <LogPanel
          selectedLink={selectedLink}
          caseId={caseId}
        />
      </GraphPanel>

      <AIAssistant caseId={caseId} />
    </>
  );
}

export default App;