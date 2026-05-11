// GraphFilters.tsx
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
    onTimeRangeChange
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
                <span className="filter-label">Quick Filter:</span>
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
            </div>

            <div className="advanced-filters-row">
                <div className="search-group">
                    <span className="filter-label">Advanced:</span>
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