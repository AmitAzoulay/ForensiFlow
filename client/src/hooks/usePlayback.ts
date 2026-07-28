import { useState, useEffect, useMemo } from 'react';
import type { GraphData } from '../types';
import { extractTimestamp } from './useGraphFilter';

interface PlaybackState {
  isPlaybackMode: boolean;
  isPlaying: boolean;
  playbackIndex: number;
  playbackSequence: any[];
  currentPlaybackLink: any | null;
  activePlaybackNodeIds: Set<string> | undefined;
  activePlaybackLinkIds: Set<string> | undefined;
  handleStartPlayback: () => void;
  handleExitPlayback: () => void;
  resetPlayback: () => void;
  setPlaybackIndex: React.Dispatch<React.SetStateAction<number>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePlayback(filteredGraphData: GraphData): PlaybackState {
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const playbackSequence = useMemo(() => {
    const redLinks = filteredGraphData.links.filter(l => l.is_red);
    const validLinks = redLinks.filter(l => extractTimestamp(l) !== null);
    return [...validLinks].sort((a, b) => extractTimestamp(a)! - extractTimestamp(b)!);
  }, [filteredGraphData]);

  const currentPlaybackLink = useMemo(() => {
    if (!isPlaybackMode || playbackIndex <= 0) return null;
    return playbackSequence[Math.min(playbackIndex - 1, playbackSequence.length - 1)] ?? null;
  }, [isPlaybackMode, playbackIndex, playbackSequence]);

  const { activePlaybackNodeIds, activePlaybackLinkIds } = useMemo(() => {
    if (!isPlaybackMode) return { activePlaybackNodeIds: undefined, activePlaybackLinkIds: undefined };

    const activeNodes = new Set<string>();
    const activeLinks = new Set<string>();

    playbackSequence.slice(0, playbackIndex).forEach(l => {
      activeLinks.add(l.id);
      activeNodes.add(typeof l.source === 'object' ? l.source.id : l.source);
      activeNodes.add(typeof l.target === 'object' ? l.target.id : l.target);
    });

    const redLinkNodeIds = new Set<string>();
    playbackSequence.forEach(l => {
      redLinkNodeIds.add(typeof l.source === 'object' ? l.source.id : l.source);
      redLinkNodeIds.add(typeof l.target === 'object' ? l.target.id : l.target);
    });

    filteredGraphData.nodes
      .filter(n => n.is_red && !redLinkNodeIds.has(n.id))
      .forEach(n => activeNodes.add(n.id));

    return { activePlaybackNodeIds: activeNodes, activePlaybackLinkIds: activeLinks };
  }, [isPlaybackMode, playbackSequence, playbackIndex, filteredGraphData.nodes]);

  useEffect(() => {
    if (!isPlaybackMode || !isPlaying) return;
    const timer = setInterval(() => {
      setPlaybackIndex(prev => {
        if (prev >= playbackSequence.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [isPlaybackMode, isPlaying, playbackSequence.length]);

  const handleStartPlayback = () => {
    setIsPlaybackMode(true);
    setPlaybackIndex(0);
    setIsPlaying(true);
  };

  const handleExitPlayback = () => {
    setIsPlaybackMode(false);
    setIsPlaying(false);
    setPlaybackIndex(0);
  };

  const resetPlayback = () => {
    setIsPlaybackMode(false);
    setIsPlaying(false);
    setPlaybackIndex(0);
  };

  return {
    isPlaybackMode,
    isPlaying,
    playbackIndex,
    playbackSequence,
    currentPlaybackLink,
    activePlaybackNodeIds,
    activePlaybackLinkIds,
    handleStartPlayback,
    handleExitPlayback,
    resetPlayback,
    setPlaybackIndex,
    setIsPlaying,
  };
}
