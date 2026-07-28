import React from 'react';

interface PlaybackControlsProps {
    playbackSequence: any[];
    playbackIndex: number;
    isPlaying: boolean;
    onExit: () => void;
    onSetIndex: (index: number) => void;
    onSetPlaying: (playing: boolean) => void;
}

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
    playbackSequence,
    playbackIndex,
    isPlaying,
    onExit,
    onSetIndex,
    onSetPlaying,
}) => {
    return (
        <div style={{ position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: 'var(--playback-surface)', padding: '20px 30px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 1000, boxShadow: 'var(--shadow-strong)', color: 'var(--playback-text)', minWidth: '450px', border: '1px solid var(--playback-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', animation: isPlaying ? 'pulse 1.5s infinite' : 'none' }}></div>
                    <span style={{ fontWeight: '600', letterSpacing: '0.5px' }}>Attack Path Analysis</span>
                    <style>{`@keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }`}</style>
                </div>
                <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Exit Player">✖</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', marginTop: '5px' }}>
                <button onClick={() => { onSetIndex(0); onSetPlaying(false); }} style={{ background: 'var(--playback-btn-bg)', border: 'none', color: 'var(--playback-btn-text)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Restart">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
                </button>
                <button onClick={() => { onSetIndex(Math.max(0, playbackIndex - 1)); onSetPlaying(false); }} style={{ background: 'var(--playback-btn-bg)', border: 'none', color: 'var(--playback-btn-text)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Previous Event">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="15 18 9 12 15 6 15 18"></polygon></svg>
                </button>
                <button onClick={() => onSetPlaying(!isPlaying)} style={{ background: isPlaying ? '#f59e0b' : '#3b82f6', border: 'none', color: 'white', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    }
                </button>
                <button onClick={() => { onSetIndex(Math.min(playbackSequence.length, playbackIndex + 1)); onSetPlaying(false); }} style={{ background: 'var(--playback-btn-bg)', border: 'none', color: 'var(--playback-btn-text)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Next Event">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="9 18 15 12 9 6 9 18"></polygon></svg>
                </button>
                <button onClick={() => { onSetIndex(playbackSequence.length); onSetPlaying(false); }} style={{ background: 'var(--playback-btn-bg)', border: 'none', color: 'var(--playback-btn-text)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Skip to End">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                </button>
            </div>
            <input
                type="range"
                min={0}
                max={playbackSequence.length}
                value={playbackIndex}
                onChange={e => { onSetIndex(Number(e.target.value)); onSetPlaying(false); }}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#ef4444' }}
            />
            <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                Progress: <span style={{ color: 'var(--playback-text)', fontWeight: '500' }}>{playbackIndex}</span> / {playbackSequence.length} Events Revealed
            </div>
        </div>
    );
};

export default PlaybackControls;
