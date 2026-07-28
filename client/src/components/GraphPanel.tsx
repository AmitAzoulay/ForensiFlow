import React, { useState } from 'react';
import InvestigationToolbar from './InvestigationToolbar';
import GraphCanvas from './GraphCanvas';
import NotebookPopup from './NotebookPopup.tsx';
import type { GraphData } from '../types';
import './GraphPanel.css';

interface GraphPanelProps {
    graphData: GraphData;
    caseId?: string | null;
    currentTheme?: 'light' | 'dark';
    notebookText?: string;
    refreshKey?: number;
    isPlaybackMode?: boolean;
    activePlaybackNodeIds?: Set<string>;
    activePlaybackLinkIds?: Set<string>;
    currentPlaybackLink?: any | null;
    hasRedItems?: boolean;
    hasExistingQuery?: boolean;
    onDownloadReport?: () => void;
    onStartPlayback?: () => void;
    onLinkClick: (link: any) => void;
    onDataLoaded: (data: any, caseId: string | null) => void;
    onSendToAI: (type: 'node' | 'link', data: any) => void;
    onApplyNodeFilter: (node: any, appendMode?: 'AND' | 'OR') => void;
    onApplyEdit: (action: 'red' | 'unred' | 'delete', targetType: 'node' | 'link' | 'group', targetData: any) => void;
    onSaveEdited: (newName: string) => void;
    onIsolateLineage: (node: any) => void;
    onNotebookChange?: (text: string) => void;
    onNotebookClear?: () => void;
    onToggleTheme?: () => void;
    onResetAppState?: () => void;
    children?: React.ReactNode;
    filtersComponent?: React.ReactNode;
}

const GraphPanel: React.FC<GraphPanelProps> = ({
    graphData,
    caseId,
    currentTheme = 'light',
    notebookText = '',
    refreshKey = 0,
    isPlaybackMode = false,
    activePlaybackNodeIds,
    activePlaybackLinkIds,
    currentPlaybackLink,
    hasRedItems = false,
    hasExistingQuery = false,
    onDownloadReport,
    onStartPlayback,
    onLinkClick,
    onDataLoaded,
    onSendToAI,
    onApplyNodeFilter,
    onApplyEdit,
    onSaveEdited,
    onIsolateLineage,
    onNotebookChange,
    onNotebookClear,
    onToggleTheme,
    onResetAppState,
    children,
    filtersComponent,
}) => {
    const [showNotebook, setShowNotebook] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    return (
        <div className="graph-panel-container">
            <InvestigationToolbar
                caseId={caseId}
                currentTheme={currentTheme}
                refreshKey={refreshKey}
                isPlaybackMode={isPlaybackMode}
                hasRedItems={hasRedItems}
                onDataLoaded={onDataLoaded}
                onToggleTheme={onToggleTheme}
                onResetAppState={onResetAppState}
                onSaveEdited={onSaveEdited}
                onDownloadReport={onDownloadReport}
                onStartPlayback={onStartPlayback}
                onOpenNotebook={() => setShowNotebook(true)}
                onUploadingChange={setIsUploading}
            />

            <div className="content-area">
                <GraphCanvas
                    graphData={graphData}
                    caseId={caseId}
                    currentTheme={currentTheme}
                    isPlaybackMode={isPlaybackMode}
                    activePlaybackNodeIds={activePlaybackNodeIds}
                    activePlaybackLinkIds={activePlaybackLinkIds}
                    currentPlaybackLink={currentPlaybackLink}
                    hasExistingQuery={hasExistingQuery}
                    isUploading={isUploading}
                    filtersComponent={filtersComponent}
                    onLinkClick={onLinkClick}
                    onSendToAI={onSendToAI}
                    onApplyNodeFilter={onApplyNodeFilter}
                    onApplyEdit={onApplyEdit}
                    onIsolateLineage={onIsolateLineage}
                />
                {children}
            </div>

            <NotebookPopup
                isOpen={showNotebook}
                caseId={caseId || null}
                notebookText={notebookText}
                onNotebookChange={(text: string) => onNotebookChange?.(text)}
                onClearNotes={() => onNotebookClear?.()}
                onClose={() => setShowNotebook(false)}
            />
        </div>
    );
};

export default GraphPanel;
