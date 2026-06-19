import React, { useState, useEffect, useMemo } from 'react';
import GraphPanel from './components/GraphPanel';
import LogPanel from './components/LogPanel';
import AIAssistant from './components/AIAssistant';
import GraphFilters from './components/GraphFilters';
import ExecutionLineage from './components/ExecutionLineage';
import './App.css';

interface ViewState {
  searchQuery: string;
  activeFilters: string[];
  timeRange: { start: number; end: number } | null;
}

type QueryToken =
  | { type: 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' }
  | { type: 'TERM'; value: string };

function tokenize(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) { i++; continue; }
    if (query[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (query[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    const start = i;
    // Read initial word; pass through quoted sections so "path with spaces" stays together
    while (i < query.length && !/[\s()]/.test(query[i])) {
      if (query[i] === '"' || query[i] === "'") {
        const q = query[i++];
        while (i < query.length && query[i] !== q) i++;
        if (i < query.length) i++; // closing quote
      } else {
        i++;
      }
    }
    const word = query.slice(start, i);
    // If this word is a field filter (contains ==), greedily absorb the rest of
    // the value even if it has spaces — stop only at ), AND, OR, NOT
    if (word.includes('==')) {
      while (i < query.length) {
        let j = i;
        while (j < query.length && /\s/.test(query[j])) j++;
        if (j >= query.length || query[j] === ')') break;
        let k = j;
        while (k < query.length && !/[\s()]/.test(query[k])) k++;
        const next = query.slice(j, k).toLowerCase();
        if (next === 'and' || next === 'or' || next === 'not') break;
        i = k;
      }
      tokens.push({ type: 'TERM', value: query.slice(start, i) });
    } else {
      if (word.toLowerCase() === 'and') tokens.push({ type: 'AND' });
      else if (word.toLowerCase() === 'or') tokens.push({ type: 'OR' });
      else if (word.toLowerCase() === 'not' || word === '!') tokens.push({ type: 'NOT' });
      else tokens.push({ type: 'TERM', value: word });
    }
  }
  return tokens;
}

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
  const [selectedLink, setSelectedLink] = useState<any>(null);
  const [caseId, setCaseId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [globalTimeBounds, setGlobalTimeBounds] = useState<{ min: number; max: number } | null>(null);
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);

  const [externalAIPrompt, setExternalAIPrompt] = useState<{ text: string; timestamp: number } | null>(null);
  const [lineageTarget, setLineageTarget] = useState<any>(null);

  const [pastHistory, setPastHistory] = useState<ViewState[]>([]);
  const [futureHistory, setFutureHistory] = useState<ViewState[]>([]);

  const [savedQueries, setSavedQueries] = useState<Array<{ id: string; query: string; label?: string }>>([]);
  const [activeSavedQueryIds, setActiveSavedQueryIds] = useState<string[]>([]);

  const [edits, setEdits] = useState({
    redNodes: new Set<string>(),
    redLinks: new Set<string>(),
    deletedNodes: new Set<string>(),
    deletedLinks: new Set<string>(),
    unredNodes: new Set<string>(),
    unredLinks: new Set<string>()
  });

  const [isSaving, setIsSaving] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const handleDataLoaded = (data: any, newCaseId: any) => {
    setRawGraphData(data);
    setCaseId(newCaseId);
    setSelectedLink(null);
    setSearchQuery('');
    setActiveFilters([]);
    setPastHistory([]);
    setFutureHistory([]);
    setIsPlaybackMode(false);
    setIsPlaying(false);
    setPlaybackIndex(0);
    setLineageTarget(null);
    setEdits({
      redNodes: new Set(),
      redLinks: new Set(),
      deletedNodes: new Set(),
      deletedLinks: new Set(),
      unredNodes: new Set(),
      unredLinks: new Set()
    });
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

 const handleSendToAI = (type: 'node' | 'link', data: any) => {
    // --- Data Flattening Helper ---
    const flattenData = (obj: any): string => {
        if (!obj) return "No details available";
        let parts: string[] = [];
        
        const extract = (d: any, prefix = '') => {
            if (typeof d !== 'object' || d === null) {
                parts.push(`${prefix.replace(/_$/, '')}: ${d}`);
                return;
            }
            for (const [key, value] of Object.entries(d)) {
                if (value === null || value === undefined || value === "") continue;
                if (key.toLowerCase() === 'id' || key.toLowerCase() === 'label') continue; // Skip internal Neo4j noise
                
                if (typeof value === 'object') {
                    extract(value, `${prefix}${key}_`);
                } else {
                    parts.push(`${prefix}${key}: ${value}`);
                }
            }
        };
        
        extract(obj);
        return parts.length > 0 ? parts.join(' | ') : "No details available";
    };

    if (type === 'node') {
      const nodeName = data.properties?.name || data.name || data.id;
      const nodeDetails = flattenData(data.properties || data);
      
      setExternalAIPrompt({
        text: `TACTICAL ANALYSIS REQUIRED: I am investigating the entity "${nodeName}".\nDetails: ${nodeDetails}\nDO NOT define what this entity is. Focus on this node, its connected entities, and related chronological graph logs you have in your context.\n\nTell me:\n1. Why would an attacker target or use this entity?\n2. What specific anomalies or connections should I look for NEXT in the graph to confirm suspicious activity?`,
        timestamp: Date.now()
      });
    } else if (type === 'link') {
      const logDetails = flattenData(data.details);
      const sourceName = data?.source?.properties?.name || data?.source?.name || "Unknown Source";
      const targetName = data?.target?.properties?.name || data?.target?.name || "Unknown Target";
      const actionType = data?.type || "Unknown Action";

      setExternalAIPrompt({
        text: `TACTICAL ANALYSIS REQUIRED: I am investigating this interaction: ${sourceName} -> ${actionType} -> ${targetName}.\nTelemetry: ${logDetails}\n\nDO NOT explain what this log means (I already know). Focus on this interaction and the related chronological graph logs you have in your context.\n\nIn 2-3 concise sentences, tell me: \n1. Why might an attacker do this? (Tactical significance)\n2. What specific event or anomaly should I search for NEXT in the graph to confirm malicious intent?`,
        timestamp: Date.now()
      });
    }
  };

  const handleApplyNodeFilter = (node: any, appendMode?: 'AND' | 'OR') => {
    setPastHistory(prev => [...prev, { searchQuery, activeFilters, timeRange }]);
    setFutureHistory([]);
    const nodeName = node.properties?.name || node.name || node.id;
    let newQuery = nodeName;
    if (appendMode && searchQuery.trim() !== '') {
      newQuery = `${searchQuery} ${appendMode} ${nodeName}`;
    }
    setSearchQuery(newQuery);
  };

  const handleApplyFieldFilter = (eventId: string, fieldName: string, value: string, appendMode?: 'AND' | 'OR') => {
    setPastHistory(prev => [...prev, { searchQuery, activeFilters, timeRange }]);
    setFutureHistory([]);
    const safeEventId = eventId || '*';
    const newTerm = `${safeEventId}.${fieldName}==${value}`;
    let newQuery = newTerm;
    if (appendMode && searchQuery.trim() !== '') {
      newQuery = `${searchQuery} ${appendMode} ${newTerm}`;
    }
    setSearchQuery(newQuery);
  };

  const handleApplyEdit = (action: 'red' | 'unred' | 'delete', targetType: 'node' | 'link' | 'group', targetData: any) => {
    setEdits(prev => {
      const newEdits = {
        redNodes: new Set(prev.redNodes),
        redLinks: new Set(prev.redLinks),
        deletedNodes: new Set(prev.deletedNodes),
        deletedLinks: new Set(prev.deletedLinks),
        unredNodes: new Set(prev.unredNodes),
        unredLinks: new Set(prev.unredLinks)
      };

      const processItems = (nodes: any[], links: any[], act: string) => {
        nodes.forEach(n => {
          const id = n.id || n;
          if (act === 'delete') newEdits.deletedNodes.add(id);
          else if (act === 'red') {
            newEdits.redNodes.add(id);
            newEdits.unredNodes.delete(id);
          } else if (act === 'unred') {
            newEdits.unredNodes.add(id);
            newEdits.redNodes.delete(id);
          }
        });
        links.forEach(l => {
          const id = l.id || l;
          if (act === 'delete') newEdits.deletedLinks.add(id);
          else if (act === 'red') {
            newEdits.redLinks.add(id);
            newEdits.unredLinks.delete(id);
          } else if (act === 'unred') {
            newEdits.unredLinks.add(id);
            newEdits.redLinks.delete(id);
          }
        });
      };

      if (targetType === 'node') {
        const connectedLinks = rawGraphData.links.filter((l: any) =>
          (l.source.id || l.source) === targetData.id ||
          (l.target.id || l.target) === targetData.id
        );
        processItems([targetData], connectedLinks, action);
      } else if (targetType === 'link') {
        if (action === 'delete') {
          processItems([], [targetData], 'delete');
        } else {
          processItems([targetData.source, targetData.target], [targetData], action);
        }
      } else if (targetType === 'group') {
        const groupNodeIds = new Set(targetData.nodes.map((n: any) => n.id));
        const connectedLinks = rawGraphData.links.filter((l: any) =>
          groupNodeIds.has(l.source.id || l.source) ||
          groupNodeIds.has(l.target.id || l.target)
        );
        processItems(targetData.nodes, connectedLinks, action);
      }

      return newEdits;
    });
  };

  const handleSaveEdited = async (newName: string) => {
    setLoadingText('Saving investigation...');
    setIsSaving(true);
    const nodesToSave = filteredGraphData.nodes.map((n: any) => ({ id: n.id, label: n.label, properties: n.properties, is_red: n.is_red }));
    const linksToSave = filteredGraphData.links.map((l: any) => ({ id: l.id, source: l.source.id, target: l.target.id, type: l.type, details: l.details, is_red: l.is_red }));

    try {
      const response = await fetch('http://localhost:8000/api/save-edited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_case_id: caseId, new_name: newName + ' (edited)', nodes: nodesToSave, links: linksToSave })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setRefreshKey(prev => prev + 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadReport = async () => {
    const redNodes = filteredGraphData.nodes.filter((n: any) => n.is_red);
    const redLinks = filteredGraphData.links.filter((l: any) => l.is_red);

    if (redNodes.length === 0 && redLinks.length === 0) {
      alert("Please mark at least one entity or interaction as red to generate a report.");
      return;
    }

    setLoadingText('Exporting report...');
    setIsSaving(true); 

    try {
      const response = await fetch('http://localhost:8000/api/generate-forensic-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: redNodes, links: redLinks })
      });

      if (!response.ok) throw new Error("Failed to generate report from server");

      // 2. מקבלים את קובץ האקסל מהשרת ומורידים אותו לדפדפן
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ForensiFlow_Incident_Report.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (e) {
      console.error(e);
      alert("Error generating the report. Make sure the server is running.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoBack = () => {
    if (pastHistory.length === 0) return;
    const current = { searchQuery, activeFilters, timeRange };
    const newPast = [...pastHistory];
    const previous = newPast.pop();
    if (previous) {
      setFutureHistory(prev => [current, ...prev]);
      setSearchQuery(previous.searchQuery);
      setActiveFilters(previous.activeFilters);
      setTimeRange(previous.timeRange);
      setPastHistory(newPast);
    }
  };

  const handleGoForward = () => {
    if (futureHistory.length === 0) return;
    const current = { searchQuery, activeFilters, timeRange };
    const newFuture = [...futureHistory];
    const next = newFuture.shift();
    if (next) {
      setPastHistory(prev => [...prev, current]);
      setSearchQuery(next.searchQuery);
      setActiveFilters(next.activeFilters);
      setTimeRange(next.timeRange);
      setFutureHistory(newFuture);
    }
  };

  const handleSaveQuery = () => {
    if (!searchQuery.trim()) return;
    const id = Date.now().toString();
    setSavedQueries(prev => [...prev, { id, query: searchQuery.trim() }]);
    setActiveSavedQueryIds(prev => [...prev, id]);
    setSearchQuery('');
  };

  const handleToggleSavedQuery = (id: string) => {
    setActiveSavedQueryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDeleteSavedQuery = (id: string) => {
    setSavedQueries(prev => prev.filter(q => q.id !== id));
    setActiveSavedQueryIds(prev => prev.filter(x => x !== id));
  };

  const handleRenameQuery = (id: string, newName: string) => {
    setSavedQueries(prev => prev.map(q => q.id === id ? { ...q, label: newName } : q));
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

    let baseNodes = rawGraphData.nodes.filter((n: any) => !edits.deletedNodes.has(n.id));
    let baseLinks = rawGraphData.links.filter((l: any) => !edits.deletedLinks.has(l.id));

    // All active query strings: current input + selected saved queries
    const activeQueries = [
      searchQuery,
      ...savedQueries.filter(q => activeSavedQueryIds.includes(q.id)).map(q => q.query)
    ].filter(q => q.trim() !== '');

    const evaluateTerm = (term: string, link: any): boolean => {
      let isNot = false;
      let cleanTerm = term.trim();
      if (cleanTerm.toLowerCase().startsWith('not ')) {
        isNot = true;
        cleanTerm = cleanTerm.substring(4).trim();
      } else if (cleanTerm.startsWith('!')) {
        isNot = true;
        cleanTerm = cleanTerm.substring(1).trim();
      }
      if (!cleanTerm) return true;
      let matchResult = false;
      const advancedPattern = /^(\d+|[a-zA-Z][a-zA-Z0-9_]*|\*)\.([a-zA-Z0-9_]+)\s*==\s*(.+)$/i;
      const advancedMatch = cleanTerm.match(advancedPattern);
      if (advancedMatch) {
        const targetIdentifier = advancedMatch[1];
        const targetField = advancedMatch[2];
        let rawValue = advancedMatch[3];
        // Strip balanced surrounding quotes ("value" or 'value')
        if (rawValue.length >= 2 &&
            ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
             (rawValue.startsWith("'") && rawValue.endsWith("'")))) {
          rawValue = rawValue.slice(1, -1);
        }
        const targetValue = rawValue.toLowerCase();
        const details = link.details || {};
        const isNumericId = /^\d+$/.test(targetIdentifier);
        let identifierMatches: boolean;
        if (targetIdentifier === '*') {
          identifierMatches = true;
        } else if (isNumericId) {
          const evId = details.event_id?.toString() || details.EventID?.toString() || "";
          identifierMatches = evId === targetIdentifier;
        } else {
          identifierMatches = (link.type || "").toLowerCase() === targetIdentifier.toLowerCase();
        }
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const dstId = typeof link.target === 'object' ? link.target.id : link.target;
        const srcNode = baseNodes.find((n: any) => n.id === srcId);
        const dstNode = baseNodes.find((n: any) => n.id === dstId);
        if (identifierMatches && (targetField === 'src' || targetField === 'source')) {
          const name = (srcNode?.properties?.name || '').toLowerCase();
          matchResult = name.includes(targetValue);
        } else if (identifierMatches && (targetField === 'target' || targetField === 'dst')) {
          const name = (dstNode?.properties?.name || '').toLowerCase();
          matchResult = name.includes(targetValue);
        } else if (identifierMatches && (targetField in details)) {
          const actualValue = details[targetField]?.toString().toLowerCase() || "";
          matchResult = actualValue.includes(targetValue) || actualValue === targetValue;
        } else {
          matchResult = false;
        }
      } else {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        const sourceNode = baseNodes.find((n: any) => n.id === sourceId);
        const targetNode = baseNodes.find((n: any) => n.id === targetId);
        const searchableText = `${sourceNode?.properties?.name || ''} ${targetNode?.properties?.name || ''} ${link.type || ''} ${link.details?.event_id || ''}`.toLowerCase();
        matchResult = searchableText.includes(cleanTerm.toLowerCase());
      }
      return isNot ? !matchResult : matchResult;
    };

    const evalQuery = (query: string, link: any): boolean => {
      const tokens = tokenize(query);
      let pos = 0;
      function peek() { return tokens[pos]; }
      function consume() { return tokens[pos++]; }
      function parseOr(): boolean {
        let result = parseAnd();
        while (peek()?.type === 'OR') { consume(); result = result || parseAnd(); }
        return result;
      }
      function parseAnd(): boolean {
        let result = parseNot();
        while (peek()?.type === 'AND') { consume(); result = result && parseNot(); }
        return result;
      }
      function parseNot(): boolean {
        if (peek()?.type === 'NOT') { consume(); return !parseNot(); }
        return parsePrimary();
      }
      function parsePrimary(): boolean {
        const token = peek();
        if (!token) return true;
        if (token.type === 'LPAREN') {
          consume();
          const result = parseOr();
          if (peek()?.type === 'RPAREN') consume();
          return result;
        }
        if (token.type === 'TERM') { consume(); return evaluateTerm(token.value, link); }
        consume();
        return true;
      }
      return tokens.length === 0 ? true : parseOr();
    };

    const matchesAnyQuery = (link: any): boolean => {
      if (activeQueries.length === 0) return true;
      return activeQueries.some(query => evalQuery(query, link));
    };

    let validLinks = baseLinks.filter((link: any) => {
      if (timeRange) {
        const t = extractTimestamp(link);
        if (t && (t < timeRange.start || t > timeRange.end)) {
          return false;
        }
      }
      if (!matchesAnyQuery(link)) return false;
      return true;
    });

    let finalNodes = baseNodes;
    let finalLinks = validLinks;

    if (activeFilters.length > 0) {
      const primaryNodeIds = new Set(
        baseNodes
          .filter((n: any) => activeFilters.includes(n.label?.toLowerCase()))
          .map((n: any) => n.id)
      );
      finalLinks = validLinks.filter((link: any) => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        return primaryNodeIds.has(sourceId) || primaryNodeIds.has(targetId);
      });
      const requiredNodeIds = new Set(primaryNodeIds);
      finalLinks.forEach((link: any) => {
        requiredNodeIds.add(typeof link.source === 'object' ? link.source.id : link.source);
        requiredNodeIds.add(typeof link.target === 'object' ? link.target.id : link.target);
      });
      finalNodes = baseNodes.filter((n: any) => requiredNodeIds.has(n.id));
    } else {
      const isTimeFiltered = timeRange && globalTimeBounds &&
        (timeRange.start > globalTimeBounds.min || timeRange.end < globalTimeBounds.max);
      if (activeQueries.length > 0 || isTimeFiltered) {
        const linkedNodeIds = new Set();
        finalLinks.forEach((l: any) => {
          linkedNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
          linkedNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
        });
        finalNodes = baseNodes.filter((n: any) => linkedNodeIds.has(n.id));
      }
    }

    finalNodes.forEach((n: any) => {
      n.is_red = (n.is_red || edits.redNodes.has(n.id)) && !edits.unredNodes.has(n.id);
    });

    finalLinks.forEach((l: any) => {
      l.is_red = (l.is_red || edits.redLinks.has(l.id)) && !edits.unredLinks.has(l.id);
    });

    return { nodes: finalNodes, links: finalLinks };
  }, [rawGraphData, searchQuery, savedQueries, activeSavedQueryIds, activeFilters, timeRange, globalTimeBounds, edits]);

  const playbackSequence = useMemo(() => {
    const redLinks = filteredGraphData.links.filter((l: any) => l.is_red);
    const validLinks = redLinks.filter((l: any) => extractTimestamp(l) !== null);
    validLinks.sort((a: any, b: any) => extractTimestamp(a)! - extractTimestamp(b)!);
    return validLinks;
  }, [filteredGraphData]);

  const { activePlaybackNodeIds, activePlaybackLinkIds } = useMemo(() => {
    if (!isPlaybackMode) {
      return { activePlaybackNodeIds: undefined, activePlaybackLinkIds: undefined };
    }

    const activeNodes = new Set<string>();
    const activeLinks = new Set<string>();

    const visibleLinks = playbackSequence.slice(0, playbackIndex);
    visibleLinks.forEach((l: any) => {
      activeLinks.add(l.id);
      activeNodes.add(typeof l.source === 'object' ? l.source.id : l.source);
      activeNodes.add(typeof l.target === 'object' ? l.target.id : l.target);
    });

    const allRedNodes = filteredGraphData.nodes.filter((n: any) => n.is_red);
    const redLinkConnectedNodeIds = new Set();
    playbackSequence.forEach((l: any) => {
      redLinkConnectedNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
      redLinkConnectedNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
    });

    const isolatedRedNodes = allRedNodes.filter((n: any) => !redLinkConnectedNodeIds.has(n.id));
    isolatedRedNodes.forEach((n: any) => activeNodes.add(n.id));

    return { activePlaybackNodeIds: activeNodes, activePlaybackLinkIds: activeLinks };
  }, [isPlaybackMode, playbackSequence, playbackIndex, filteredGraphData.nodes]);

  useEffect(() => {
    let timer: any;
    if (isPlaybackMode && isPlaying) {
      timer = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev >= playbackSequence.length) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [isPlaybackMode, isPlaying, playbackSequence.length]);

  const handleStartPlayback = () => {
    setIsPlaybackMode(true);
    setPlaybackIndex(0);
    setIsPlaying(true);
  };

  const handleExitPlayback = () => {
    setIsPlaybackMode(false);
    setIsPlaying(false);
    setPlaybackIndex(0);
  };

  const filtersUI = rawGraphData.nodes.length > 0 && !isPlaybackMode ? (
    <GraphFilters
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeFilters={activeFilters}
      onToggleFilter={toggleFilter}
      onClearFilters={() => setActiveFilters([])}
      nodes={rawGraphData.nodes}
      links={rawGraphData.links}
      globalTimeBounds={globalTimeBounds}
      timeRange={timeRange}
      onTimeRangeChange={(start, end) => setTimeRange({ start, end })}
      canGoBack={pastHistory.length > 0}
      onGoBack={handleGoBack}
      canGoForward={futureHistory.length > 0}
      onGoForward={handleGoForward}
      savedQueries={savedQueries}
      activeSavedQueryIds={activeSavedQueryIds}
      onSaveQuery={handleSaveQuery}
      onToggleSavedQuery={handleToggleSavedQuery}
      onDeleteSavedQuery={handleDeleteSavedQuery}
      onRenameQuery={handleRenameQuery}
    />
  ) : null;

  return (
    <>
      {isSaving && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '30px 50px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontSize: '20px', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 2s linear infinite' }}>
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            {loadingText}
          </div>
        </div>
      )}

      {isPlaybackMode && (
        <div style={{ position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(30, 41, 59, 0.95)', padding: '20px 30px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 1000, boxShadow: '0 10px 30px rgba(0,0,0,0.4)', color: 'white', minWidth: '450px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', animation: isPlaying ? 'pulse 1.5s infinite' : 'none' }}></div>
              <span style={{ fontWeight: '600', letterSpacing: '0.5px' }}>Attack Path Analysis</span>
              <style>{`@keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }`}</style>
            </div>
            <button onClick={handleExitPlayback} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Exit Player">✖</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', marginTop: '5px' }}>
            <button onClick={() => { setPlaybackIndex(0); setIsPlaying(false); }} style={{ background: '#334155', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Restart">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
            </button>
            <button onClick={() => { setPlaybackIndex(p => Math.max(0, p - 1)); setIsPlaying(false); }} style={{ background: '#334155', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Previous Event">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="15 18 9 12 15 6 15 18"></polygon></svg>
            </button>
            <button onClick={() => setIsPlaying(!isPlaying)} style={{ background: isPlaying ? '#f59e0b' : '#3b82f6', border: 'none', color: 'white', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              )}
            </button>
            <button onClick={() => { setPlaybackIndex(p => Math.min(playbackSequence.length, p + 1)); setIsPlaying(false); }} style={{ background: '#334155', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Next Event">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="9 18 15 12 9 6 9 18"></polygon></svg>
            </button>
            <button onClick={() => { setPlaybackIndex(playbackSequence.length); setIsPlaying(false); }} style={{ background: '#334155', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Skip to End">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={playbackSequence.length}
            value={playbackIndex}
            onChange={(e) => { setPlaybackIndex(Number(e.target.value)); setIsPlaying(false); }}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#ef4444' }}
          />
          <div style={{ textAlign: 'center', fontSize: '13px', color: '#cbd5e1' }}>
            Progress: <span style={{ color: 'white', fontWeight: '500' }}>{playbackIndex}</span> / {playbackSequence.length} Events Revealed
          </div>
        </div>
      )}

      {lineageTarget && (
        <ExecutionLineage
          targetNode={lineageTarget}
          rawGraphData={filteredGraphData}
          onClose={() => setLineageTarget(null)}
        />
      )}

      <GraphPanel
        graphData={filteredGraphData}
        caseId={caseId}
        refreshKey={refreshKey}
        isPlaybackMode={isPlaybackMode}
        activePlaybackNodeIds={activePlaybackNodeIds}
        activePlaybackLinkIds={activePlaybackLinkIds}
        hasRedItems={playbackSequence.length > 0}
        hasExistingQuery={searchQuery.trim() !== ''}
        onStartPlayback={handleStartPlayback}
        onLinkClick={handleLinkClick}
        onDataLoaded={handleDataLoaded}
        filtersComponent={filtersUI}
        onSendToAI={handleSendToAI}
        onApplyNodeFilter={handleApplyNodeFilter}
        onApplyEdit={handleApplyEdit}
        onSaveEdited={handleSaveEdited}
        onDownloadReport={handleDownloadReport}
        onIsolateLineage={(node) => setLineageTarget(node)}
      >
        <LogPanel
          selectedLink={selectedLink}
          caseId={caseId}
          hasExistingQuery={searchQuery.trim() !== ''}
          onApplyFieldFilter={handleApplyFieldFilter}
        />
      </GraphPanel>
      <AIAssistant
        caseId={caseId}
        externalPrompt={externalAIPrompt}
      />
    </>
  );
}

export default App;