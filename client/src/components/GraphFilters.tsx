import React, { useState, useRef, useMemo, useCallback } from 'react';
import './GraphFilters.css';
import TimeLineFilter from './TimeLineFilter';

interface Suggestion {
    label: string;
    badge: string;
    completion: string;
}

interface GraphFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    activeFilters: string[];
    onToggleFilter: (category: string) => void;
    onClearFilters: () => void;
    nodes: any[];
    links: any[];
    globalTimeBounds: { min: number; max: number } | null;
    timeRange: { start: number; end: number } | null;
    onTimeRangeChange: (start: number, end: number) => void;
    canGoBack?: boolean;
    onGoBack?: () => void;
    canGoForward?: boolean;
    onGoForward?: () => void;
    savedQueries: Array<{ id: string; query: string; label?: string }>;
    activeSavedQueryIds: string[];
    onSaveQuery: () => void;
    onToggleSavedQuery: (id: string) => void;
    onDeleteSavedQuery: (id: string) => void;
    onRenameQuery: (id: string, newName: string) => void;
}

const EXCLUDED_FIELDS = new Set(['event_id', 'EventID', 'timestamp']);

import { formatFilterValue } from '../utils/formatters';

function getTokenAtEnd(query: string): { token: string; start: number } {
    let start = query.length;
    while (start > 0 && !/[\s()]/.test(query[start - 1])) start--;
    return { token: query.slice(start), start };
}

function computeSuggestions(token: string, links: any[], nodes: any[], hasContentBefore: boolean): Suggestion[] {
    const valueMatch = token.match(/^([a-zA-Z][a-zA-Z0-9_]*|\d+|\*)\.([a-zA-Z0-9_]+)==(.*)$/i);
    if (valueMatch) {
        const [, id, field, valuePrefix] = valueMatch;
        const isNumeric = /^\d+$/.test(id);
        const matchingLinks = links.filter(l =>
            id === '*'
                ? true
                : isNumeric
                    ? (l.details?.event_id?.toString() === id || l.details?.EventID?.toString() === id)
                    : (l.type || '').toLowerCase() === id.toLowerCase()
        );

        const getNodeById = (idOrObj: any): string => {
            const id = typeof idOrObj === 'object' ? idOrObj?.id : idOrObj;
            const found = nodes.find(n => n.id === id);
            return found?.properties?.name || found?.name || id || '';
        };

        const lowerField = field.toLowerCase();
        const isSrc = lowerField === 'src' || lowerField === 'source';
        const isDst = lowerField === 'dst' || lowerField === 'target';

        const rawValues = [...new Set(
            matchingLinks
                .map((l: any) => {
                    if (isSrc) return getNodeById(l.source);
                    if (isDst) return getNodeById(l.target);
                    return l.details?.[field]?.toString();
                })
                .filter(Boolean)
        )] as string[];

        const prefixLower = valuePrefix.toLowerCase();
        return rawValues
            .filter(v => v.toLowerCase().includes(prefixLower))
            .slice(0, 8)
            .map(v => {
                const label = formatFilterValue(field, v);
                return {
                    label,
                    badge: 'value',
                    completion: `${id}.${field}=="${label}"`,
                };
            });
    }


    const fieldMatch = token.match(/^([a-zA-Z][a-zA-Z0-9_]*|\d+)\.([a-zA-Z0-9_]*)$/);
    if (fieldMatch) {
        const [, id, fieldPrefix] = fieldMatch;
        const isNumeric = /^\d+$/.test(id);
        const matchingLinks = links.filter(l =>
            isNumeric
                ? (l.details?.event_id?.toString() === id || l.details?.EventID?.toString() === id)
                : (l.type || '').toLowerCase() === id.toLowerCase()
        );
        const nodeFields = ['src', 'target']
            .filter(f => f.startsWith(fieldPrefix.toLowerCase()))
            .map(f => ({ label: `${f}==`, badge: 'node', completion: `${id}.${f}==` }));

        const detailFields = [...new Set(
            matchingLinks
                .flatMap(l => Object.keys(l.details || {}))
                .filter(f => !EXCLUDED_FIELDS.has(f) && f.toLowerCase().startsWith(fieldPrefix.toLowerCase()))
        )]
            .slice(0, 8 - nodeFields.length)
            .map(f => ({ label: `${f}==`, badge: 'field', completion: `${id}.${f}==` }));

        return [...nodeFields, ...detailFields];
    }

    const idMatch = token.match(/^([a-zA-Z0-9_]*)$/);
    if (!idMatch) return [];

    const prefix = idMatch[1].toLowerCase();
    const results: Suggestion[] = [];

    if (hasContentBefore) {
        ['AND', 'OR', 'NOT']
            .filter(op => op.toLowerCase().startsWith(prefix))
            .forEach(op => results.push({ label: op, badge: 'op', completion: `${op} ` }));
    }

    const actionNames = [...new Set(links.map(l => l.type).filter(Boolean))] as string[];
    actionNames
        .filter(t => t.toLowerCase().startsWith(prefix))
        .slice(0, 6)
        .forEach(a => results.push({ label: `${a}.`, badge: 'action', completion: `${a}.` }));

    const eventIds = [...new Set(
        links
            .map(l => l.details?.event_id?.toString() || l.details?.EventID?.toString())
            .filter(Boolean)
    )] as string[];
    eventIds
        .filter(id => id.startsWith(prefix))
        .slice(0, 4)
        .forEach(id => results.push({ label: `${id}.`, badge: 'event', completion: `${id}.` }));

    return results;
}

const GraphFilters: React.FC<GraphFiltersProps> = ({
    searchQuery,
    onSearchChange,
    activeFilters,
    onToggleFilter,
    onClearFilters,
    nodes,
    links,
    globalTimeBounds,
    timeRange,
    onTimeRangeChange,
    canGoBack,
    onGoBack,
    canGoForward,
    onGoForward,
    savedQueries,
    activeSavedQueryIds,
    onSaveQuery,
    onToggleSavedQuery,
    onDeleteSavedQuery,
    onRenameQuery
}) => {
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isDragOverQueryBar, setIsDragOverQueryBar] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const renameInputRef = useRef<HTMLInputElement>(null);

    const categories = [
        { id: 'user', label: 'Users' },
        { id: 'group', label: 'Groups' },
        { id: 'process', label: 'Processes' },
        { id: 'computer', label: 'Computers' },
        { id: 'file', label: 'Files' },
        { id: 'registry', label: 'Registry' },
        { id: 'service', label: 'Services' },
        { id: 'task', label: 'Scheduled Tasks' }
    ];

    const { token, start: tokenStart } = useMemo(
        () => getTokenAtEnd(searchQuery),
        [searchQuery]
    );

    const hasContentBefore = useMemo(() => {
        if (tokenStart === 0) return false;
        const lastMeaningfulChar = searchQuery.slice(0, tokenStart).trimEnd().slice(-1);
        return lastMeaningfulChar !== '' && lastMeaningfulChar !== '(';
    }, [searchQuery, tokenStart]);

    const suggestions = useMemo(
        () => computeSuggestions(token, links, nodes, hasContentBefore),
        [token, links, nodes, hasContentBefore]
    );

    const applySuggestion = useCallback((suggestion: Suggestion) => {
        const newQuery = searchQuery.slice(0, tokenStart) + suggestion.completion;
        onSearchChange(newQuery);
        setSuggestionIndex(-1);
        setShowSuggestions(true);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [searchQuery, tokenStart, onSearchChange]);

    const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
            e.preventDefault();
            inputRef.current?.focus();
        }
    }, []);

    React.useEffect(() => {
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleGlobalKeyDown]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchChange(e.target.value);
        setSuggestionIndex(-1);
        setShowSuggestions(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                setSuggestionIndex(prev => (prev <= 0 ? suggestions.length - 1 : prev - 1));
            } else {
                setSuggestionIndex(prev => (prev >= suggestions.length - 1 ? 0 : prev + 1));
            }
        } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && suggestionIndex >= 0) {
            e.preventDefault();
            applySuggestion(suggestions[suggestionIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowSuggestions(false);
            setSuggestionIndex(-1);
        }
    };

    return (
        <div className="filters-wrapper">
            <div className="filter-chips-row">
                <span className="filter-label">QUICK FILTER:</span>
                {categories.map(cat => {
                    const count = nodes.filter((n: any) => n.label?.toLowerCase() === cat.id).length;
                    if (count === 0) return null;
                    return (
                        <button
                            key={cat.id}
                            className={`chip ${activeFilters.includes(cat.id) ? 'active' : ''}`}
                            onClick={() => onToggleFilter(cat.id)}
                        >
                            <span className="chip-count">{count}</span>
                            {cat.label}
                        </button>
                    );
                })}

                {activeFilters.length > 0 && (
                    <button className="clear-filters" onClick={onClearFilters}>
                        Clear All
                    </button>
                )}

                <div className="history-nav-container">
                    {canGoBack && onGoBack && (
                        <button className="back-history-btn" onClick={onGoBack} title="Go back to previous view">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                            Back
                        </button>
                    )}
                    {canGoForward && onGoForward && (
                        <button className="forward-history-btn" onClick={onGoForward} title="Go forward to next view">
                            Forward
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="advanced-filters-row">
                <div className="search-group">
                    <span className="filter-label">ADVANCED:</span>
                    <div
                        className={`search-input-wrapper${isDragOverQueryBar ? ' drag-over' : ''}`}
                        onDragOver={e => {
                            e.preventDefault();
                            setIsDragOverQueryBar(true);
                        }}
                        onDragLeave={() => setIsDragOverQueryBar(false)}
                        onDrop={e => {
                            e.preventDefault();
                            setIsDragOverQueryBar(false);
                            const droppedQuery = e.dataTransfer.getData('text/plain');
                            if (droppedQuery) {
                                onSearchChange(droppedQuery);
                                setShowSuggestions(false);
                                requestAnimationFrame(() => inputRef.current?.focus());
                            }
                        }}
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            className="modern-input"
                            placeholder="Example: PROCESS_CREATED.src==chrome.exe"
                            value={searchQuery}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setShowSuggestions(false)}
                        />
                        <button
                            className="save-query-btn"
                            onClick={onSaveQuery}
                            disabled={!searchQuery.trim()}
                            title="Save current query as a tab"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z" />
                            </svg>
                            Save
                        </button>
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="autocomplete-dropdown" style={{ right: 'auto', width: inputRef.current?.offsetWidth }}>
                                {suggestions.map((s, i) => (
                                    <div
                                        key={i}
                                        className={`autocomplete-item${i === suggestionIndex ? ' active' : ''}`}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => applySuggestion(s)}
                                    >
                                        <span className="autocomplete-label">{s.label}</span>
                                        <span className={`autocomplete-badge badge-${s.badge}`}>{s.badge}</span>
                                    </div>
                                ))}
                                <div className="autocomplete-hint">
                                    Tab / Shift+Tab to navigate &nbsp;&middot;&nbsp; Enter / &rarr; to accept &nbsp;&middot;&nbsp; Esc to close
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {globalTimeBounds && timeRange && (
                    <div className="time-group">
                        <TimeLineFilter
                            minTime={globalTimeBounds.min}
                            maxTime={globalTimeBounds.max}
                            startTime={timeRange.start}
                            endTime={timeRange.end}
                            onChange={onTimeRangeChange}
                        />
                    </div>
                )}
            </div>

            {savedQueries.length > 0 && (
                <div className="saved-queries-row">
                    <span className="filter-label">Applied Filters:</span>
                    {savedQueries.map(q => {
                        const isEditing = editingId === q.id;
                        const isActive = activeSavedQueryIds.includes(q.id);
                        const displayLabel = q.label ?? q.query;
                        const displayTitle = q.label ? `${q.label} — ${q.query}` : q.query;

                        const startEdit = () => {
                            setEditingId(q.id);
                            setEditingValue(q.label ?? q.query);
                            requestAnimationFrame(() => renameInputRef.current?.select());
                        };

                        const commitEdit = () => {
                            if (editingValue.trim()) onRenameQuery(q.id, editingValue.trim());
                            setEditingId(null);
                        };

                        const cancelEdit = () => setEditingId(null);

                        return (
                            <div
                                key={q.id}
                                className={`saved-query-tab${isActive ? ' active' : ''}`}
                                draggable={!isEditing}
                                onDragStart={e => {
                                    if (!isEditing) {
                                        e.dataTransfer.setData('text/plain', q.query);
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }
                                }}
                                onClick={() => !isEditing && onToggleSavedQuery(q.id)}
                                onContextMenu={e => { e.preventDefault(); startEdit(); }}
                                title={displayTitle}
                            >
                                {isEditing ? (
                                    <input
                                        ref={renameInputRef}
                                        className="saved-query-rename-input"
                                        value={editingValue}
                                        onChange={e => setEditingValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                            e.stopPropagation();
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <span className="saved-query-label">{displayLabel}</span>
                                )}
                                <button
                                    className="saved-query-delete"
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={e => { e.stopPropagation(); onDeleteSavedQuery(q.id); }}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default GraphFilters;
