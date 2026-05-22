// NodeContextMenu.tsx
import React, { useEffect, useRef } from 'react';
import './NodeContextMenu.css';

// Context menu interface definition
interface NodeContextMenuProps {
    x: number;
    y: number;
    node: any;
    onClose: () => void;
    onSendToAI: (node: any) => void;
    onApplyFilter: (node: any) => void;
}

const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
    x,
    y,
    node,
    onClose,
    onSendToAI,
    onApplyFilter,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const nodeName = node.properties?.name || node.name || node.id;

    return (
        <div
            className="node-context-menu"
            ref={menuRef}
            style={{ top: y, left: x }}
        >
            <div className="menu-header">{nodeName}</div>
            <button
                className="menu-item"
                onClick={() => {
                    onSendToAI(node);
                    onClose();
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Send to AI
            </button>
            <button
                className="menu-item"
                onClick={() => {
                    onApplyFilter(node);
                    onClose();
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                Apply as Filter
            </button>
        </div>
    );
};

export default NodeContextMenu;