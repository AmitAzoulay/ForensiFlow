import React from 'react';
import './GraphFilters.css';
import TimeLineFilter from './TimeLineFilter'; // שים לב לשם הקובץ עם ה-L הגדולה

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

    // רשימת הקטגוריות לסינון מהיר
    const categories = [
        { id: 'user', label: 'Users' },
        { id: 'process', label: 'Processes' },
        { id: 'computer', label: 'Computers' },
        { id: 'file', label: 'Files' },
        { id: 'registry', label: 'Registry' },
        { id: 'service', label: 'Services' },
        { id: 'task', label: 'Scheduled Tasks' }
    ];

    return (
        <div className="filters-wrapper">
            {/* שורת ה-Quick Filters (Chips) */}
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

            {/* שורת ה-Advanced Filter (חיפוש טקסטואלי) */}
            <div className="filter-chips-row" style={{ paddingTop: 0 }}>
                <span className="filter-label">Advanced Filter:</span>
                <input
                    type="text"
                    className="modern-input"
                    style={{ flex: 1, margin: 0 }}
                    placeholder="Filter graph... (e.g., 'svchost OR 4688', 'admin AND NOT 4624')"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            {/* רכיב ה-Timeline Filter */}
            {globalTimeBounds && timeRange && (
                <TimeLineFilter
                    minTime={globalTimeBounds.min}
                    maxTime={globalTimeBounds.max}
                    startTime={timeRange.start}
                    endTime={timeRange.end}
                    onChange={onTimeRangeChange}
                />
            )}
        </div>
    );
};

export default GraphFilters;