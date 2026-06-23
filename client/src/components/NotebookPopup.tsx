import React from 'react';
import './NotebookPopup.css';

interface NotebookPopupProps {
    isOpen: boolean;
    caseId: string | null;
    notebookText: string;
    onNotebookChange: (value: string) => void;
    onClearNotes: () => void;
    onClose: () => void;
}

const NotebookPopup: React.FC<NotebookPopupProps> = ({
    isOpen,
    caseId,
    notebookText,
    onNotebookChange,
    onClearNotes,
    onClose
}) => {
    if (!isOpen) return null;

    return (
        <div className="notebook-overlay" onClick={onClose}>
            <div className="notebook-modal" onClick={(e) => e.stopPropagation()}>
                <div className="notebook-header">
                    <div>
                        <div className="notebook-kicker">Investigation Notebook</div>
                        <h3>Analyst Notes</h3>
                    </div>
                    <button className="notebook-close" onClick={onClose} title="Close notebook">✕</button>
                </div>

                <div className="notebook-meta">
                    <span>{caseId ? `Case: ${caseId.substring(0, 8)}` : 'No active case'}</span>
                    <span>Autosaved per investigation</span>
                </div>

                <textarea
                    className="notebook-textarea"
                    value={notebookText}
                    onChange={(e) => onNotebookChange(e.target.value)}
                    placeholder="Write your investigative observations, hypotheses, and follow-up actions..."
                />

                <div className="notebook-footer">
                    <button
                        className="notebook-secondary-btn"
                        onClick={onClearNotes}
                        disabled={!notebookText.trim()}
                    >
                        Clear Notes
                    </button>
                    <button className="notebook-primary-btn" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};

export default NotebookPopup;