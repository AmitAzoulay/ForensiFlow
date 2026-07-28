import { useState, useEffect, useMemo } from 'react';
import GraphPanel from './components/GraphPanel';
import LogPanel from './components/LogPanel';
import AIAssistant from './components/AIAssistant';
import GraphFilters from './components/GraphFilters';
import LoadingOverlay from './components/LoadingOverlay';
import PlaybackControls from './components/PlaybackControls';
import { apiService } from './services/api';
import ExecutionLineage from './components/ExecutionLineage';
import { useGraphFilter } from './hooks/useGraphFilter';
import { usePlayback } from './hooks/usePlayback';
import { formatFilterValue } from './utils/formatters';
import type { GraphData, ViewState, EditState, SavedQuery } from './types';
import './App.css';

interface ViewState {
  searchQuery: string;
  activeFilters: string[];
  timeRange: { start: number; end: number } | null;
}

interface GraphDataState {
  nodes: any[];
  links: any[];
}

type QueryToken =
  | { type: 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' }
  | { type: 'TERM'; value: string };

export function tokenize(query: string): QueryToken[] {
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

const WINDOWS_CODE_MAP: Record<string, string> = {
  '%%1904': 'New value created',
  '%%1905': 'Value modified',
  '%%1906': 'Value deleted',
  '%%1936': 'Type 1 - Default',
  '%%1937': 'Type 2 - Elevated',
  '%%1938': 'Type 3 - Limited',
  '%%1832': 'Anonymous',
  '%%1833': 'Identification',
  '%%1840': 'Impersonation',
  '%%1841': 'Delegation',
  '%%1842': 'Yes',
  '%%1843': 'No',
  '%%14592': 'Inbound',
  '%%14593': 'Outbound',
};

const FIELD_VALUE_MAPS: Record<string, Record<string, string>> = {
  OperationType: {
    '%%1904': 'New value created',
    '%%1905': 'Value modified',
    '%%1906': 'Value deleted',
  },
  Status: {
    '0x0': 'Success',
    '0xc0000064': 'Unknown username',
    '0xc000006a': 'Wrong password',
    '0xc000006d': 'Bad credentials',
  },
  SubStatus: {
    '0x0': 'Success',
    '0xc0000064': 'Unknown username',
    '0xc000006a': 'Wrong password',
    '0xc000006d': 'Bad credentials',
  },
  FailureCode: {
    '0x0': 'Success',
    '0x1': 'Client not found in Kerberos database',
    '0x18': 'Pre-authentication failed (wrong password)',
  },
};

export function parseNumericValue(value: string): number | null {
  if (!value) return null;
  const normalized = value.trim();
  const parsed = parseInt(normalized.startsWith('0x') ? normalized.slice(2) : normalized, normalized.startsWith('0x') ? 16 : 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatFilterValue(fieldName: string, rawValue: string | number | null | undefined): string {
  const normalized = String(rawValue ?? '').trim();
  if (!normalized || normalized === '-') return normalized;

  if (normalized.includes('(') && normalized.includes(')')) {
    return normalized;
  }

  const lowerField = fieldName.toLowerCase();
  if (lowerField === 'accessmask' || lowerField === 'accesses') {
    const hexVal = parseNumericValue(normalized);
    if (hexVal !== null) {
      const accessTypes: string[] = [];
      if (hexVal & 0x1) accessTypes.push('Read Data / List Dir');
      if (hexVal & 0x2) accessTypes.push('Write Data / Add File');
      if (hexVal & 0x4) accessTypes.push('Append Data / Add Subdir');
      if (hexVal & 0x8) accessTypes.push('Read Extended Attrs');
      if (hexVal & 0x10) accessTypes.push('Write Extended Attrs');
      if (hexVal & 0x20) accessTypes.push('Execute / Traverse');
      if (hexVal & 0x40) accessTypes.push('Delete Child');
      if (hexVal & 0x80) accessTypes.push('Read Attributes');
      if (hexVal & 0x100) accessTypes.push('Write Attributes');
      if (hexVal & 0x10000) accessTypes.push('Delete');
      if (hexVal & 0x20000) accessTypes.push('Read Control');
      if (hexVal & 0x40000) accessTypes.push('Write DAC');
      if (hexVal & 0x80000) accessTypes.push('Write Owner');
      if (hexVal & 0x100000) accessTypes.push('Synchronize');
      if (accessTypes.length > 0) {
        return `${normalized} (${accessTypes.join(', ')})`;
      }
    }
  }

  const fieldMap = FIELD_VALUE_MAPS[fieldName] || FIELD_VALUE_MAPS[fieldName.toLowerCase()];
  if (fieldMap) {
    const translated = fieldMap[normalized.toLowerCase()];
    if (translated) {
      return `${translated} (${normalized})`;
    }
  }

  const codeMapValue = WINDOWS_CODE_MAP[normalized.toLowerCase()];
  if (codeMapValue) {
    return `${codeMapValue} (${normalized})`;
  }

  return normalized;
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('forensiflow-theme') === 'dark' ? 'dark' : 'light'
  );
  const [rawGraphData, setRawGraphData] = useState<GraphData>(EMPTY_GRAPH);
  const [selectedLink, setSelectedLink] = useState<any>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [notebookText, setNotebookText] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [globalTimeBounds, setGlobalTimeBounds] = useState<{ min: number; max: number } | null>(null);
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);

  const [externalAIPrompt, setExternalAIPrompt] = useState<{ text: string; timestamp: number } | null>(null);
  const [lineageTarget, setLineageTarget] = useState<any>(null);

  const [pastHistory, setPastHistory] = useState<ViewState[]>([]);
  const [futureHistory, setFutureHistory] = useState<ViewState[]>([]);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [activeSavedQueryIds, setActiveSavedQueryIds] = useState<string[]>([]);

  const [edits, setEdits] = useState<EditState>(EMPTY_EDITS);

  const [isSaving, setIsSaving] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('forensiflow-theme', theme);
  }, [theme]);

  const filteredGraphData = useGraphFilter({
    rawGraphData,
    searchQuery,
    savedQueries,
    activeSavedQueryIds,
    activeFilters,
    timeRange,
    globalTimeBounds,
    edits,
  });

  const {
    isPlaybackMode,
    isPlaying,
    playbackIndex,
    playbackSequence,
    currentPlaybackLink,
    activePlaybackNodeIds,
    activePlaybackLinkIds,
    handleStartPlayback,
    handleExitPlayback,
    resetPlayback,
    setPlaybackIndex,
    setIsPlaying,
  } = usePlayback(filteredGraphData);

  const handleDataLoaded = (data: GraphData, newCaseId: string | null) => {
    setRawGraphData(data);
    setCaseId(newCaseId);
    setSelectedLink(null);
    setSearchQuery('');
    setActiveFilters([]);
    setPastHistory([]);
    setFutureHistory([]);
    resetPlayback();
    setLineageTarget(null);
    setEdits(EMPTY_EDITS);
  };

  const resetToCleanState = () => {
    setRawGraphData(EMPTY_GRAPH);
    setSelectedLink(null);
    setCaseId(null);
    setNotebookText('');
    setSearchQuery('');
    setActiveFilters([]);
    setGlobalTimeBounds(null);
    setTimeRange(null);
    setExternalAIPrompt(null);
    setLineageTarget(null);
    setPastHistory([]);
    setFutureHistory([]);
    setSavedQueries([]);
    setActiveSavedQueryIds([]);
    setEdits(EMPTY_EDITS);
    setIsSaving(false);
    setLoadingText('');
    resetPlayback();
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    if (!caseId) { setNotebookText(''); return; }
    const saved = localStorage.getItem(`forensiflow-notebook:${caseId}`) ?? '';
    setNotebookText(saved);
  }, [caseId]);

  const handleNotebookChange = (nextText: string) => {
    setNotebookText(nextText);
    if (caseId) localStorage.setItem(`forensiflow-notebook:${caseId}`, nextText);
  };

  const handleNotebookClear = () => {
    setNotebookText('');
    if (caseId) localStorage.removeItem(`forensiflow-notebook:${caseId}`);
  };

  const toggleFilter = (category: string) => {
    setActiveFilters(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const handleSendToAI = (type: 'node' | 'link', data: any) => {
    const flattenData = (obj: any): string => {
      if (!obj) return 'No details available';
      const parts: string[] = [];
      const extract = (d: any, prefix = '') => {
        if (typeof d !== 'object' || d === null) {
          parts.push(`${prefix.replace(/_$/, '')}: ${d}`);
          return;
        }
        for (const [key, value] of Object.entries(d)) {
          if (value === null || value === undefined || value === '') continue;
          if (key.toLowerCase() === 'id' || key.toLowerCase() === 'label') continue;
          if (typeof value === 'object') extract(value, `${prefix}${key}_`);
          else parts.push(`${prefix}${key}: ${value}`);
        }
      };
      extract(obj);
      return parts.length > 0 ? parts.join(' | ') : 'No details available';
    };

    if (type === 'node') {
      const nodeName = data.properties?.name ?? data.name ?? data.id;
      const nodeDetails = flattenData(data.properties ?? data);
      setExternalAIPrompt({
        text: `TACTICAL ANALYSIS REQUIRED: I am investigating the entity "${nodeName}".\nDetails: ${nodeDetails}\nDO NOT define what this entity is. Focus on this node, its connected entities, and related chronological graph logs you have in your context.\n\nTell me:\n1. Why would an attacker target or use this entity?\n2. What specific anomalies or connections should I look for NEXT in the graph to confirm suspicious activity?`,
        timestamp: Date.now(),
      });
    } else {
      const logDetails = flattenData(data.details);
      const sourceName = data?.source?.properties?.name ?? data?.source?.name ?? 'Unknown Source';
      const targetName = data?.target?.properties?.name ?? data?.target?.name ?? 'Unknown Target';
      const actionType = data?.type ?? 'Unknown Action';
      setExternalAIPrompt({
        text: `TACTICAL ANALYSIS REQUIRED: I am investigating this interaction: ${sourceName} -> ${actionType} -> ${targetName}.\nTelemetry: ${logDetails}\n\nDO NOT explain what this log means (I already know). Focus on this interaction and the related chronological graph logs you have in your context.\n\nIn 2-3 concise sentences, tell me: \n1. Why might an attacker do this? (Tactical significance)\n2. What specific event or anomaly should I search for NEXT in the graph to confirm malicious intent?`,
        timestamp: Date.now(),
      });
    }
  };

  const handleApplyNodeFilter = (node: any, appendMode?: 'AND' | 'OR') => {
    setPastHistory(prev => [...prev, { searchQuery, activeFilters, timeRange }]);
    setFutureHistory([]);
    const nodeName = node.properties?.name ?? node.name ?? node.id;
    const newQuery = appendMode && searchQuery.trim() !== ''
      ? `${searchQuery} ${appendMode} ${nodeName}`
      : nodeName;
    setSearchQuery(newQuery);
  };

  const handleApplyFieldFilter = (eventId: string, fieldName: string, value: string, appendMode?: 'AND' | 'OR') => {
    setPastHistory(prev => [...prev, { searchQuery, activeFilters, timeRange }]);
    setFutureHistory([]);
    const safeEventId = eventId || '*';
    const formattedValue = formatFilterValue(fieldName, value);
    const newTerm = `${safeEventId}.${fieldName}=="${formattedValue}"`;
    const newQuery = appendMode && searchQuery.trim() !== ''
      ? `${searchQuery} ${appendMode} ${newTerm}`
      : newTerm;
    setSearchQuery(newQuery);
  };

  const handleApplyEdit = (action: 'red' | 'unred' | 'delete', targetType: 'node' | 'link' | 'group', targetData: any) => {
    setEdits(prev => {
      const next: EditState = {
        redNodes: new Set(prev.redNodes),
        redLinks: new Set(prev.redLinks),
        deletedNodes: new Set(prev.deletedNodes),
        deletedLinks: new Set(prev.deletedLinks),
        unredNodes: new Set(prev.unredNodes),
        unredLinks: new Set(prev.unredLinks),
      };

      const processItems = (nodes: any[], links: any[], act: string) => {
        nodes.forEach(n => {
          const id = n.id ?? n;
          if (act === 'delete') next.deletedNodes.add(id);
          else if (act === 'red') { next.redNodes.add(id); next.unredNodes.delete(id); }
          else if (act === 'unred') { next.unredNodes.add(id); next.redNodes.delete(id); }
        });
        links.forEach(l => {
          const id = l.id ?? l;
          if (act === 'delete') next.deletedLinks.add(id);
          else if (act === 'red') { next.redLinks.add(id); next.unredLinks.delete(id); }
          else if (act === 'unred') { next.unredLinks.add(id); next.redLinks.delete(id); }
        });
      };

      if (targetType === 'node') {
        const connectedLinks = rawGraphData.links.filter(l =>
          (typeof l.source === 'object' ? l.source.id : l.source) === targetData.id ||
          (typeof l.target === 'object' ? l.target.id : l.target) === targetData.id
        );
        processItems([targetData], connectedLinks, action);
      } else if (targetType === 'link') {
        if (action === 'delete') processItems([], [targetData], 'delete');
        else processItems([targetData.source, targetData.target], [targetData], action);
      } else if (targetType === 'group') {
        const groupNodeIds = new Set(targetData.nodes.map((n: any) => n.id));
        const connectedLinks = rawGraphData.links.filter(l =>
          groupNodeIds.has(typeof l.source === 'object' ? l.source.id : l.source) ||
          groupNodeIds.has(typeof l.target === 'object' ? l.target.id : l.target)
        );
        processItems(targetData.nodes, connectedLinks, action);
      }

      return next;
    });
  };

  const handleApplyAIQuery = (query: string, label: string) => {
    if (!query.trim()) return;
    const id = Date.now().toString();
    setSavedQueries(prev => [...prev, { id, query: query.trim(), label }]);
    setActiveSavedQueryIds(prev => [...prev, id]);
  };

  const handleReparseComplete = async () => {
    if (!caseId) return;
    const data = await apiService.getGraphData(caseId);
    handleDataLoaded(data, caseId);
  };

  const handleSaveEdited = async (newName: string) => {
    if (!caseId) return;
    setLoadingText('Saving investigation...');
    setIsSaving(true);
    const nodesToSave = filteredGraphData.nodes.map((n: any) => ({
      id: n.id, label: n.label, properties: n.properties, is_red: n.is_red,
    }));
    const linksToSave = filteredGraphData.links.map((l: any) => ({
      id: l.id,
      source: typeof l.source === 'object' ? l.source.id : l.source,
      target: typeof l.target === 'object' ? l.target.id : l.target,
      type: l.type, details: l.details, is_red: l.is_red,
    }));
    try {
      const result = await apiService.saveEdited(caseId, newName, nodesToSave, linksToSave);
      if (result.status === 'success') setRefreshKey(prev => prev + 1);
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
      alert('Please mark at least one entity or interaction as red to generate a report.');
      return;
    }
    setLoadingText('Exporting report...');
    setIsSaving(true);
    try {
      const blob = await apiService.generateForensicReport(redNodes, redLinks, notebookText);
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
      alert('Error generating the report. Make sure the server is running.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoBack = () => {
    if (pastHistory.length === 0) return;
    const current: ViewState = { searchQuery, activeFilters, timeRange };
    const newPast = [...pastHistory];
    const previous = newPast.pop()!;
    setFutureHistory(prev => [current, ...prev]);
    setSearchQuery(previous.searchQuery);
    setActiveFilters(previous.activeFilters);
    setTimeRange(previous.timeRange);
    setPastHistory(newPast);
  };

  const handleGoForward = () => {
    if (futureHistory.length === 0) return;
    const current: ViewState = { searchQuery, activeFilters, timeRange };
    const newFuture = [...futureHistory];
    const next = newFuture.shift()!;
    setPastHistory(prev => [...prev, current]);
    setSearchQuery(next.searchQuery);
    setActiveFilters(next.activeFilters);
    setTimeRange(next.timeRange);
    setFutureHistory(newFuture);
  };

  const handleSaveQuery = () => {
    if (!searchQuery.trim()) return;
    const id = Date.now().toString();
    setSavedQueries(prev => [...prev, { id, query: searchQuery.trim() }]);
    setActiveSavedQueryIds(prev => [...prev, id]);
    setSearchQuery('');
  };

  const handleToggleSavedQuery = (id: string) =>
    setActiveSavedQueryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleDeleteSavedQuery = (id: string) => {
    setSavedQueries(prev => prev.filter(q => q.id !== id));
    setActiveSavedQueryIds(prev => prev.filter(x => x !== id));
  };

  const handleRenameQuery = (id: string, newName: string) =>
    setSavedQueries(prev => prev.map(q => q.id === id ? { ...q, label: newName } : q));

  useEffect(() => {
    if (!rawGraphData?.links?.length) {
      setGlobalTimeBounds(null);
      setTimeRange(null);
      return;
    }
    let min = Infinity;
    let max = -Infinity;
    rawGraphData.links.forEach(link => {
      const t = link.details?.timestamp
        ? new Date(link.details.timestamp as string).getTime()
        : null;
      if (t) { if (t < min) min = t; if (t > max) max = t; }
    });
    if (min !== Infinity && max !== -Infinity && min !== max) {
      setGlobalTimeBounds({ min, max });
      setTimeRange({ start: min, end: max });
    } else {
      setGlobalTimeBounds(null);
      setTimeRange(null);
    }
  }, [rawGraphData]);

  const currentViewContext = useMemo(() => {
    if (!filteredGraphData.nodes.length && !filteredGraphData.links.length) return '';

    const nodeNames = filteredGraphData.nodes
      .slice(0, 20)
      .map(node => node.properties?.name ?? node.name ?? node.label ?? node.id)
      .filter(Boolean);

    const linkSummaries = filteredGraphData.links.slice(0, 20).map(link => {
      const sourceName = typeof link.source === 'object'
        ? (link.source.properties?.name ?? link.source.name ?? link.source.label ?? link.source.id)
        : link.source;
      const targetName = typeof link.target === 'object'
        ? (link.target.properties?.name ?? link.target.name ?? link.target.label ?? link.target.id)
        : link.target;
      return `${link.type ?? link.label ?? 'LINK'}: ${sourceName} -> ${targetName}`;
    });

    return [
      'Current graph view only.',
      `Visible nodes: ${filteredGraphData.nodes.length}`,
      `Visible links: ${filteredGraphData.links.length}`,
      searchQuery.trim() ? `Active graph query: ${searchQuery.trim()}` : 'Active graph query: none',
      activeFilters.length > 0 ? `Active node filters: ${activeFilters.join(', ')}` : 'Active node filters: none',
      timeRange
        ? `Active time range: ${new Date(timeRange.start).toISOString()} to ${new Date(timeRange.end).toISOString()}`
        : 'Active time range: none',
      nodeNames.length > 0 ? `Visible node names: ${nodeNames.join(', ')}` : 'Visible node names: none',
      linkSummaries.length > 0 ? `Visible links: ${linkSummaries.join(' | ')}` : 'Visible links: none',
    ].join('\n');
  }, [filteredGraphData, activeFilters, searchQuery, timeRange]);

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
      <LoadingOverlay isVisible={isSaving} text={loadingText} />

      {isPlaybackMode && (
        <PlaybackControls
          playbackSequence={playbackSequence}
          playbackIndex={playbackIndex}
          isPlaying={isPlaying}
          onExit={handleExitPlayback}
          onSetIndex={setPlaybackIndex}
          onSetPlaying={setIsPlaying}
        />
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
        currentTheme={theme}
        notebookText={notebookText}
        refreshKey={refreshKey}
        isPlaybackMode={isPlaybackMode}
        activePlaybackNodeIds={activePlaybackNodeIds}
        activePlaybackLinkIds={activePlaybackLinkIds}
        hasRedItems={playbackSequence.length > 0}
        hasExistingQuery={searchQuery.trim() !== ''}
        onStartPlayback={handleStartPlayback}
        onLinkClick={setSelectedLink}
        onDataLoaded={handleDataLoaded}
        filtersComponent={filtersUI}
        onSendToAI={handleSendToAI}
        onApplyNodeFilter={handleApplyNodeFilter}
        onApplyEdit={handleApplyEdit}
        onSaveEdited={handleSaveEdited}
        onDownloadReport={handleDownloadReport}
        onIsolateLineage={node => setLineageTarget(node)}
        onNotebookChange={handleNotebookChange}
        onNotebookClear={handleNotebookClear}
        onToggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
        onResetAppState={resetToCleanState}
        currentPlaybackLink={currentPlaybackLink}
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
        currentViewContext={currentViewContext}
        onReparseComplete={handleReparseComplete}
        onApplyAIQuery={handleApplyAIQuery}
      />
    </>
  );
}

export default App;
