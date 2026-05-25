import React, { useEffect, useRef } from 'react';
import './NodeContextMenu.css';

interface NodeContextMenuProps {
    x: number;
    y: number;
    targetLabel: string;
    targetType: 'node' | 'link' | 'group';
    node: any;
    onClose: () => void;
    onSendToAI?: (node: any) => void;
    onApplyFilter?: (node: any) => void;
    onApplyEdit?: (action: 'red' | 'unred' | 'delete') => void;
}

const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
    x,
    y,
    targetLabel,
    targetType,
    node,
    onClose,
    onSendToAI,
    onApplyFilter,
    onApplyEdit,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

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

    return (
        <div
            className="node-context-menu"
            ref={menuRef}
            style={{ top: y, left: x }}
        >
            <div className="menu-header">{targetLabel}</div>

            {onApplyEdit && (
                <>
                    <button
                        className="menu-item"
                        onClick={() => {
                            onApplyEdit('red');
                            onClose();
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <path d="M12 2L2 22h20L12 2z"></path>
                        </svg>
                        Mark Red
                    </button>
                    <button
                        className="menu-item"
                        onClick={() => {
                            onApplyEdit('unred');
                            onClose();
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                            <path d="M3 3l18 18"></path>
                            <path d="M12 2L2 22h20L12 2z"></path>
                        </svg>
                        Unmark Red
                    </button>
                    <button
                        className="menu-item"
                        onClick={() => {
                            onApplyEdit('delete');
                            onClose();
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete
                    </button>
                </>
            )}

            {targetType === 'node' && node && onSendToAI && onApplyFilter && (
                <>
                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }}></div>
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
                </>
            )}
        </div>
    );
};

export default NodeContextMenu;