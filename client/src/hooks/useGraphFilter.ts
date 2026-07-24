import { useMemo } from 'react';
import type { GraphData, GraphNode, GraphLink, EditState, SavedQuery } from '../types';
import { formatFilterValue } from '../utils/formatters';

type QueryToken =
  | { type: 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' }
  | { type: 'TERM'; value: string };

export function extractTimestamp(obj: any): number | null {
  if (!obj) return null;
  if (obj.timestamp) return new Date(obj.timestamp).getTime();
  if (obj.time) return new Date(obj.time).getTime();
  if (obj.details?.timestamp) return new Date(obj.details.timestamp).getTime();
  if (obj.details?.System?.TimeCreated?.SystemTime)
    return new Date(obj.details.System.TimeCreated.SystemTime).getTime();
  return null;
}

function tokenize(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) { i++; continue; }
    if (query[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (query[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    const start = i;
    while (i < query.length && !/[\s()]/.test(query[i])) {
      if (query[i] === '"' || query[i] === "'") {
        const q = query[i++];
        while (i < query.length && query[i] !== q) i++;
        if (i < query.length) i++;
      } else {
        i++;
      }
    }
    const word = query.slice(start, i);
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

function evaluateTerm(term: string, link: GraphLink, baseNodes: GraphNode[]): boolean {
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
    if (rawValue.length >= 2 &&
        ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
         (rawValue.startsWith("'") && rawValue.endsWith("'")))) {
      rawValue = rawValue.slice(1, -1);
    }
    const targetValue = rawValue.toLowerCase();
    const details = link.details ?? {};
    const isNumericId = /^\d+$/.test(targetIdentifier);

    let identifierMatches: boolean;
    if (targetIdentifier === '*') {
      identifierMatches = true;
    } else if (isNumericId) {
      const evId = details.event_id?.toString() ?? details.EventID?.toString() ?? '';
      identifierMatches = evId === targetIdentifier;
    } else {
      identifierMatches = (link.type ?? '').toLowerCase() === targetIdentifier.toLowerCase();
    }

    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const dstId = typeof link.target === 'object' ? link.target.id : link.target;
    const srcNode = baseNodes.find(n => n.id === srcId);
    const dstNode = baseNodes.find(n => n.id === dstId);

    if (identifierMatches && (targetField === 'src' || targetField === 'source')) {
      matchResult = (srcNode?.properties?.name ?? '').toLowerCase().includes(targetValue);
    } else if (identifierMatches && (targetField === 'target' || targetField === 'dst')) {
      matchResult = (dstNode?.properties?.name ?? '').toLowerCase().includes(targetValue);
    } else if (identifierMatches && targetField in details) {
      const actualValue = details[targetField]?.toString() ?? '';
      const formattedValue = formatFilterValue(targetField, actualValue);
      matchResult = [actualValue, formattedValue].some(v => v.toLowerCase().includes(targetValue));
    } else {
      matchResult = false;
    }
  } else {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    const sourceNode = baseNodes.find(n => n.id === sourceId);
    const targetNode = baseNodes.find(n => n.id === targetId);
    const searchableText = [
      sourceNode?.properties?.name ?? '',
      targetNode?.properties?.name ?? '',
      link.type ?? '',
      link.details?.event_id ?? '',
    ].join(' ').toLowerCase();
    matchResult = searchableText.includes(cleanTerm.toLowerCase());
  }

  return isNot ? !matchResult : matchResult;
}

function evalQuery(query: string, link: GraphLink, baseNodes: GraphNode[]): boolean {
  const tokens = tokenize(query);
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

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
    if (token.type === 'TERM') { consume(); return evaluateTerm(token.value, link, baseNodes); }
    consume();
    return true;
  }
  return tokens.length === 0 ? true : parseOr();
}

interface FilterParams {
  rawGraphData: GraphData;
  searchQuery: string;
  savedQueries: SavedQuery[];
  activeSavedQueryIds: string[];
  activeFilters: string[];
  timeRange: { start: number; end: number } | null;
  globalTimeBounds: { min: number; max: number } | null;
  edits: EditState;
}

export function useGraphFilter({
  rawGraphData,
  searchQuery,
  savedQueries,
  activeSavedQueryIds,
  activeFilters,
  timeRange,
  globalTimeBounds,
  edits,
}: FilterParams): GraphData {
  return useMemo(() => {
    if (!rawGraphData?.nodes) return { nodes: [], links: [] };

    const baseNodes = rawGraphData.nodes.filter(n => !edits.deletedNodes.has(n.id));
    const baseLinks = rawGraphData.links.filter(l => !edits.deletedLinks.has(l.id));

    const activeQueries = [
      searchQuery,
      ...savedQueries.filter(q => activeSavedQueryIds.includes(q.id)).map(q => q.query),
    ].filter(q => q.trim() !== '');

    const matchesAnyQuery = (link: GraphLink): boolean => {
      if (activeQueries.length === 0) return true;
      return activeQueries.some(q => evalQuery(q, link, baseNodes));
    };

    const validLinks = baseLinks.filter(link => {
      if (timeRange) {
        const t = extractTimestamp(link);
        if (t && (t < timeRange.start || t > timeRange.end)) return false;
      }
      return matchesAnyQuery(link);
    });

    let finalNodes: GraphNode[];
    let finalLinks: GraphLink[];

    if (activeFilters.length > 0) {
      const primaryNodeIds = new Set(
        baseNodes
          .filter(n => activeFilters.includes(n.label?.toLowerCase() ?? ''))
          .map(n => n.id),
      );
      finalLinks = validLinks.filter(link => {
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const dstId = typeof link.target === 'object' ? link.target.id : link.target;
        return primaryNodeIds.has(srcId) || primaryNodeIds.has(dstId);
      });
      const requiredNodeIds = new Set(primaryNodeIds);
      finalLinks.forEach(link => {
        requiredNodeIds.add(typeof link.source === 'object' ? link.source.id : link.source);
        requiredNodeIds.add(typeof link.target === 'object' ? link.target.id : link.target);
      });
      finalNodes = baseNodes.filter(n => requiredNodeIds.has(n.id));
    } else {
      finalLinks = validLinks;
      const isTimeFiltered = timeRange && globalTimeBounds &&
        (timeRange.start > globalTimeBounds.min || timeRange.end < globalTimeBounds.max);
      if (activeQueries.length > 0 || isTimeFiltered) {
        const linkedNodeIds = new Set<string>();
        finalLinks.forEach(l => {
          linkedNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
          linkedNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
        });
        finalNodes = baseNodes.filter(n => linkedNodeIds.has(n.id));
      } else {
        finalNodes = baseNodes;
      }
    }

    finalNodes.forEach(n => {
      n.is_red = (n.is_red || edits.redNodes.has(n.id)) && !edits.unredNodes.has(n.id);
    });
    finalLinks.forEach(l => {
      l.is_red = (l.is_red || edits.redLinks.has(l.id)) && !edits.unredLinks.has(l.id);
    });

    return { nodes: finalNodes, links: finalLinks };
  }, [rawGraphData, searchQuery, savedQueries, activeSavedQueryIds, activeFilters, timeRange, globalTimeBounds, edits]);
}
