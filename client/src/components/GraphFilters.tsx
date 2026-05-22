import React from 'react';
import './GraphFilters.css';
import TimeLineFilter from './TimeLineFilter';

interface GraphFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    activeFilters: string[];
    onToggleFilter: (category: string) => void;
    onClearFilters: () => void;
    nodes: any[];
    globalTimeBounds: { min: number; max: number } | null;
    timeRange: { start: number; end: number } | null;
    onTimeRangeChange: (start: number, end: number) => void;
    canGoBack?: boolean;
    onGoBack?: () => void;
    canGoForward?: boolean;
    onGoForward?: () => void;
}

const GraphFilters: React.FC<GraphFiltersProps> = ({
    searchQuery,
    onSearchChange,
    activeFilters,
    onToggleFilter,
    onClearFilters,
    nodes,
    globalTimeBounds,
    timeRange,
    onTimeRangeChange,
    canGoBack,
    onGoBack,
    canGoForward,
    onGoForward
}) => {

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
                    <input
                        type="text"
                        className="modern-input"
                        placeholder="Search OR format: 4688.ProcessName==cmd.exe"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
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
        </div>
    );
};

export default GraphFilters;