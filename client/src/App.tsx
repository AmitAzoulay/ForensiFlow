import React, { useState, useEffect, useMemo } from 'react';
import GraphPanel from './components/GraphPanel';
import LogPanel from './components/LogPanel';
import AIAssistant from './components/AIAssistant';
import GraphFilters from './components/GraphFilters';
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

  // ==============================================
  // כאן נמצא התיקון הקריטי: סינון המידע לגרף
  // ==============================================
  const filteredGraphData = useMemo(() => {
    if (!rawGraphData || !rawGraphData.nodes) return { nodes: [], links: [] };

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

    // 1. קודם נסנן קשתות לפי החיפוש הכללי וציר הזמן
    let validLinks = rawGraphData.links.filter((link: any) => {
      if (timeRange) {
        const t = extractTimestamp(link);
        if (t && (t < timeRange.start || t > timeRange.end)) {
          return false;
        }
      }

      if (searchQuery.trim() !== '') {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        const sourceNode = rawGraphData.nodes.find((n: any) => n.id === sourceId);
        const targetNode = rawGraphData.nodes.find((n: any) => n.id === targetId);
        const searchableText = `${sourceNode?.properties?.name || ''} ${targetNode?.properties?.name || ''} ${link.type || ''} ${link.details?.event_id || ''}`.toLowerCase();
        if (!evaluateMatch(searchableText, searchQuery)) return false;
      }

      return true;
    });

    let finalNodes = rawGraphData.nodes;
    let finalLinks = validLinks;

    // 2. פילטור הקטגוריות (המטרה + השכנים!)
    if (activeFilters.length > 0) {
      // א. נמצא מי הם צמתי המטרה שלנו
      const primaryNodeIds = new Set(
        rawGraphData.nodes
          .filter((n: any) => activeFilters.includes(n.label?.toLowerCase()))
          .map((n: any) => n.id)
      );

      // ב. נשאיר אך ורק קשתות שאחד הצדדים שלהן הוא צומת מטרה
      finalLinks = validLinks.filter((link: any) => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return primaryNodeIds.has(sourceId) || primaryNodeIds.has(targetId);
      });

      // ג. נאסוף גם את צמתי המטרה וגם את השכנים שלהם מהקשתות שמצאנו
      const requiredNodeIds = new Set(primaryNodeIds);
      finalLinks.forEach((link: any) => {
        requiredNodeIds.add(typeof link.source === 'object' ? link.source.id : link.source);
        requiredNodeIds.add(typeof link.target === 'object' ? link.target.id : link.target);
      });

      finalNodes = rawGraphData.nodes.filter((n: any) => requiredNodeIds.has(n.id));
    } else {
      // 3. אם לא בחרנו קטגוריה, נדאג להעלים "אייקונים באוויר" שנוצרו בגלל סינון זמן/חיפוש
      const isTimeFiltered = timeRange && globalTimeBounds &&
        (timeRange.start > globalTimeBounds.min || timeRange.end < globalTimeBounds.max);

      if (searchQuery.trim() !== '' || isTimeFiltered) {
        const linkedNodeIds = new Set();
        finalLinks.forEach((l: any) => {
          linkedNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
          linkedNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
        });
        finalNodes = rawGraphData.nodes.filter((n: any) => linkedNodeIds.has(n.id));
      }
    }

    return { nodes: finalNodes, links: finalLinks };
  }, [rawGraphData, searchQuery, activeFilters, timeRange, globalTimeBounds]);

  const filtersUI = rawGraphData.nodes.length > 0 ? (
    <GraphFilters
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeFilters={activeFilters}
      onToggleFilter={toggleFilter}
      onClearFilters={() => setActiveFilters([])}
      nodes={rawGraphData.nodes}
      globalTimeBounds={globalTimeBounds}
      timeRange={timeRange}
      onTimeRangeChange={(start, end) => setTimeRange({ start, end })}
    />
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