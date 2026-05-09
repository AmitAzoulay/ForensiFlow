import React from 'react';
import './GraphFilters.css';

interface GraphFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    nodesCount: number;
}

const GraphFilters: React.FC<GraphFiltersProps> = ({ searchQuery, onSearchChange, nodesCount }) => {
    return (
        <div className="filters-container">
            <div className="filter-row">
                <span className="filter-label">Quick Filter:</span>
                <button className="chip active">
                    <span className="chip-count">{nodesCount}</span> Nodes
                </button>
                {/* Add more quick filters here in the future */}
            </div>

            <div className="filter-row">
                <span className="filter-label">Advanced Filter:</span>
                <input
                    type="text"
                    className="modern-input full-width"
                    placeholder="Filter graph by process name, event ID, action type, or time..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>
        </div>
    );
};

export default GraphFilters;