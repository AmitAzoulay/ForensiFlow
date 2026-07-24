import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';

interface InvestigationToolbarProps {
    caseId?: string | null;
    currentTheme?: 'light' | 'dark';
    refreshKey?: number;
    isPlaybackMode?: boolean;
    hasRedItems?: boolean;
    onDataLoaded: (data: any, caseId: string | null) => void;
    onToggleTheme?: () => void;
    onResetAppState?: () => void;
    onSaveEdited: (newName: string) => void;
    onDownloadReport?: () => void;
    onStartPlayback?: () => void;
    onOpenNotebook: () => void;
    onUploadingChange?: (isUploading: boolean) => void;
}

const InvestigationToolbar: React.FC<InvestigationToolbarProps> = ({
    caseId,
    currentTheme = 'light',
    refreshKey = 0,
    isPlaybackMode = false,
    hasRedItems = false,
    onDataLoaded,
    onToggleTheme,
    onResetAppState,
    onSaveEdited,
    onDownloadReport,
    onStartPlayback,
    onOpenNotebook,
    onUploadingChange,
}) => {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [investigationsList, setInvestigationsList] = useState<any[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [newInvestigationName, setNewInvestigationName] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const setUploading = (uploading: boolean) => {
        setStatus(uploading ? 'uploading' : 'idle');
        onUploadingChange?.(uploading);
    };

    useEffect(() => {
        const loadInvestigations = async () => {
            try {
                const data = await apiService.getInvestigations();
                setInvestigationsList(data);
                if (data.length > 0 && !selectedCaseId) {
                    setSelectedCaseId(data[0].case_id);
                }
            } catch (error) {
                console.error(error);
            }
        };
        loadInvestigations();
    }, [selectedCaseId, refreshKey]);

    const fetchExistingInvestigation = async () => {
        if (!selectedCaseId) return;
        setUploading(true);
        try {
            const data = await apiService.getGraphData(selectedCaseId);
            onDataLoaded(data, selectedCaseId);
            setStatus('success');
            onUploadingChange?.(false);
        } catch (error) {
            console.error(error);
            setStatus('error');
            onUploadingChange?.(false);
        }
    };

    const processNewInvestigation = async () => {
        if (!selectedFile) return;
        setUploading(true);
        try {
            const uploadResult = await apiService.uploadEvtx(selectedFile, newInvestigationName || 'Investigation');
            const data = await apiService.getGraphData(uploadResult.case_id);
            onDataLoaded(data, uploadResult.case_id);
            setStatus('success');
            onUploadingChange?.(false);
            setNewInvestigationName('');
        } catch (error) {
            console.error(error);
            setStatus('error');
            onUploadingChange?.(false);
        }
    };

    const handleDeleteInvestigation = async (idToDelete: string) => {
        if (!window.confirm('Are you sure you want to delete this investigation?')) return;
        try {
            await apiService.deleteInvestigation(idToDelete);
            setInvestigationsList(prev => prev.filter(inv => inv.case_id !== idToDelete));
            if (selectedCaseId === idToDelete) {
                const remaining = investigationsList.filter(inv => inv.case_id !== idToDelete);
                setSelectedCaseId(remaining.length > 0 ? remaining[0].case_id : '');
            }
            if (caseId === idToDelete) {
                onDataLoaded({ nodes: [], links: [] }, null);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const triggerSave = () => {
        const name = prompt('Enter a name for the edited investigation:');
        if (name) onSaveEdited(name);
    };

    return (
        <div className="top-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '16px 32px', gap: '24px', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', boxSizing: 'border-box' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                <button
                    type="button"
                    onClick={onResetAppState}
                    title="Reset to clean state"
                    aria-label="Reset to clean state"
                    style={{ background: 'none', border: 'none', padding: 0, margin: 0, cursor: onResetAppState ? 'pointer' : 'default', color: 'inherit' }}
                >
                    <h2 className="toolbar-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>ForensiFlow</h2>
                </button>
                <button
                    onClick={onToggleTheme}
                    title={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
                    aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
                    style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer', boxShadow: 'var(--shadow-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    {currentTheme === 'light' ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0a7 7 0 0 0 9.79 9.79z"></path>
                        </svg>
                    ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                        </svg>
                    )}
                </button>
                <div style={{ display: 'flex', backgroundColor: 'var(--surface-alt)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border)' }}>
                    <button
                        onClick={() => setMode('new')}
                        disabled={isPlaybackMode}
                        style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: mode === 'new' ? 600 : 500, backgroundColor: mode === 'new' ? 'var(--surface)' : 'transparent', color: mode === 'new' ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: mode === 'new' ? 'var(--shadow-soft)' : 'none', cursor: isPlaybackMode ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isPlaybackMode ? 0.6 : 1 }}
                    >
                        New Investigation
                    </button>
                    <button
                        onClick={() => setMode('existing')}
                        disabled={isPlaybackMode}
                        style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: mode === 'existing' ? 600 : 500, backgroundColor: mode === 'existing' ? 'var(--surface)' : 'transparent', color: mode === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: mode === 'existing' ? 'var(--shadow-soft)' : 'none', cursor: isPlaybackMode ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isPlaybackMode ? 0.6 : 1 }}
                    >
                        Open Existing
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                {mode === 'new' ? (
                    <>
                        <input
                            type="text"
                            className="modern-input"
                            placeholder="Investigation Name"
                            value={newInvestigationName}
                            onChange={(e) => setNewInvestigationName(e.target.value)}
                            disabled={isPlaybackMode}
                        />
                        <input
                            type="file"
                            className="modern-file-input"
                            accept=".evtx"
                            onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
                            disabled={isPlaybackMode}
                        />
                        <button className="btn-primary" onClick={processNewInvestigation} disabled={!selectedFile || status === 'uploading' || isPlaybackMode} style={{ minWidth: '90px' }}>
                            {status === 'uploading' ? 'Analyzing...' : 'Analyze'}
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <select
                                className="modern-select"
                                value={selectedCaseId}
                                onChange={(e) => setSelectedCaseId(e.target.value)}
                                disabled={isPlaybackMode}
                            >
                                <option value="" disabled>Select an Investigation...</option>
                                {investigationsList.map(inv => (
                                    <option key={inv.case_id} value={inv.case_id}>
                                        {inv.name} ({inv.case_id.substring(0, 8)})
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleDeleteInvestigation(selectedCaseId)}
                                disabled={!selectedCaseId || isPlaybackMode}
                                style={{ background: 'none', border: 'none', cursor: selectedCaseId && !isPlaybackMode ? 'pointer' : 'default', padding: '5px', opacity: selectedCaseId && !isPlaybackMode ? 1 : 0.5 }}
                                title="Delete Investigation"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                        <button className="btn-primary" onClick={fetchExistingInvestigation} disabled={!selectedCaseId || status === 'uploading' || isPlaybackMode} style={{ minWidth: '90px' }}>
                            {status === 'uploading' ? 'Loading...' : 'Load'}
                        </button>
                    </>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', flexShrink: 0 }}>
                {caseId && !isPlaybackMode && hasRedItems && onDownloadReport && (
                    <button
                        onClick={onDownloadReport}
                        title="Download Forensics Report"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', boxShadow: 'var(--shadow-soft)', height: '36px' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                )}

                {caseId && (
                    <button
                        onClick={onOpenNotebook}
                        disabled={isPlaybackMode}
                        style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: isPlaybackMode ? 'default' : 'pointer', boxShadow: 'var(--shadow-soft)', height: '36px', opacity: isPlaybackMode ? 0.6 : 1 }}
                    >
                        Notebook
                    </button>
                )}

                {caseId && (
                    <button
                        onClick={triggerSave}
                        disabled={isPlaybackMode}
                        style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: isPlaybackMode ? 'default' : 'pointer', boxShadow: 'var(--shadow-soft)', height: '36px', opacity: isPlaybackMode ? 0.6 : 1 }}
                    >
                        Save Edited
                    </button>
                )}

                {caseId && !isPlaybackMode && hasRedItems && onStartPlayback && (
                    <button
                        onClick={onStartPlayback}
                        style={{ background: 'linear-gradient(to right, #ef4444, #b91c1c)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', height: '36px', boxShadow: '0 4px 6px rgba(239, 68, 68, 0.25)' }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        Play Attack Path
                    </button>
                )}
            </div>
        </div>
    );
};

export default InvestigationToolbar;
