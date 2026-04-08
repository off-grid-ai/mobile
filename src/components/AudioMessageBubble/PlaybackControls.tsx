import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { stripMarkdownForSpeech } from '../../utils/messageContent';
import { MarkdownText } from '../MarkdownText';
import Icon from 'react-native-vector-icons/Feather';
import { useTTSStore } from '../../stores/ttsStore';
import type { ThemeColors } from '../../theme';

const SPEED_STEPS: number[] = [0.5, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 2.0];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlaybackState {
  isThisPlaying: boolean;
  isThisPaused: boolean;
  isThisAudible: boolean;
  isThisLoading: boolean;
}

/** Derives playback state for a given messageId from TTS store selectors */
export function usePlaybackState(messageId: string): PlaybackState {
  const isSpeaking = useTTSStore((s) => s.isSpeaking);
  const isPaused = useTTSStore((s) => s.isPaused);
  const isAudioPlaying = useTTSStore((s) => s.isAudioPlaying);
  const currentMessageId = useTTSStore((s) => s.currentMessageId);

  const isThisPlaying = isSpeaking && currentMessageId === messageId && !isPaused;
  const isThisPaused = isSpeaking && currentMessageId === messageId && isPaused;
  const isThisAudible = isAudioPlaying && currentMessageId === messageId && !isPaused;
  const isThisLoading = isThisPlaying && !isThisAudible;

  return { isThisPlaying, isThisPaused, isThisAudible, isThisLoading };
}

/** Hook for wall-clock elapsed timer */
export function useElapsedTimer(
  isThisAudible: boolean,
  isThisPaused: boolean,
  seekOffsetRef: React.MutableRefObject<number>,
) {
  const [localElapsed, setLocalElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isThisAudible && !isThisPaused) {
      if (seekOffsetRef.current === 0) {
        setLocalElapsed(0);
        pausedAtRef.current = 0;
      }
      return;
    }
    if (isThisPaused) {
      pausedAtRef.current = localElapsed;
      return;
    }
    const offset = seekOffsetRef.current || pausedAtRef.current;
    seekOffsetRef.current = 0;
    startTimeRef.current = Date.now() - offset * 1000;
    const id = setInterval(() => {
      setLocalElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThisAudible, isThisPaused]);

  return { localElapsed, setLocalElapsed };
}

/** Play/pause button with loading states */
export const PlayButton: React.FC<{
  isLoading: boolean;
  isThisLoading: boolean;
  isThisPlaying: boolean;
  onPlayPause: () => void;
  colors: ThemeColors;
  styles: any;
}> = ({ isLoading, isThisLoading, isThisPlaying, onPlayPause, colors, styles }) => {
  if (isLoading) {
    return (
      <View style={[styles.playButton, styles.playButtonDisabled]}>
        <Icon name="play" size={16} color={colors.primary} />
      </View>
    );
  }
  if (isThisLoading) {
    return (
      <View style={styles.playButton}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPlayPause}
      style={styles.playButton}
      hitSlop={{ top: 8, left: 8, right: 8 }}
    >
      <Icon
        name={isThisPlaying ? 'pause' : 'play'}
        size={16}
        color={colors.primary}
      />
    </TouchableOpacity>
  );
};

/** Speed cycle chip */
export const SpeedChip: React.FC<{
  styles: any;
}> = ({ styles }) => {
  const speed = useTTSStore((s) => s.settings.speed);
  const updateSettings = useTTSStore((s) => s.updateSettings);

  const handleSpeedCycle = useCallback(() => {
    let idx = SPEED_STEPS.indexOf(speed);
    if (idx < 0) {
      idx = SPEED_STEPS.findIndex((s) => s > speed) - 1;
      if (idx < 0) idx = 0;
    }
    const next = (idx + 1) % SPEED_STEPS.length;
    updateSettings({ speed: SPEED_STEPS[next] });
  }, [speed, updateSettings]);

  return (
    <TouchableOpacity
      onPress={handleSpeedCycle}
      style={styles.speedChip}
      hitSlop={{ top: 8, left: 8, right: 8 }}
    >
      <Text style={styles.speedText}>{speed}x</Text>
    </TouchableOpacity>
  );
};

/** Duration display */
export const DurationText: React.FC<{
  isLoading: boolean;
  totalDuration: number;
  styles: any;
}> = ({ isLoading, totalDuration, styles }) => (
  <Text style={styles.duration}>
    {isLoading ? '—' : formatDuration(totalDuration)}
  </Text>
);

/** Seekable progress bar with drag support */
export const SeekBar: React.FC<{
  displayProgress: number;
  colors: ThemeColors;
  styles: any;
  onSeek: (fraction: number) => void;
}> = ({ displayProgress, colors, styles, onSeek }) => {
  const seekBarWidth = useRef(0);
  const seekBarX = useRef(0);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const isDragging = useRef(false);
  const dragFractionRef = useRef(0);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const seekPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      if (!seekBarWidth.current) return;
      isDragging.current = true;
      const fraction = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekBarWidth.current));
      dragFractionRef.current = fraction;
      setDragProgress(fraction);
    },
    onPanResponderMove: (e) => {
      if (!seekBarWidth.current || !isDragging.current) return;
      const fraction = Math.max(0, Math.min(1, (e.nativeEvent.pageX - seekBarX.current) / seekBarWidth.current));
      dragFractionRef.current = fraction;
      setDragProgress(fraction);
    },
    onPanResponderRelease: () => {
      if (isDragging.current) {
        onSeekRef.current(dragFractionRef.current);
      }
      isDragging.current = false;
      setDragProgress(null);
    },
    onPanResponderTerminate: () => {
      isDragging.current = false;
      setDragProgress(null);
    },
  })).current;

  const effectiveProgress = dragProgress !== null ? dragProgress : displayProgress;
  const pct = `${Math.round(effectiveProgress * 100)}%` as any;

  return (
    <View
      {...seekPanResponder.panHandlers}
      onLayout={(e) => {
        seekBarWidth.current = e.nativeEvent.layout.width;
        e.target.measure((...args: number[]) => {
          seekBarX.current = args[4]; // pageX
        });
      }}
      style={styles.seekBarTouchable}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: pct, backgroundColor: colors.primary }]} />
      </View>
      <View style={[styles.progressThumb, { left: pct, backgroundColor: colors.primary }]} />
    </View>
  );
};

/** Transcript toggle and content */
export const TranscriptSection: React.FC<{
  transcript?: string;
  colors: ThemeColors;
  styles: any;
}> = ({ transcript, colors, styles }) => {
  const [showTranscript, setShowTranscript] = useState(false);

  if (!transcript) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowTranscript((v) => !v)}
        style={styles.transcriptToggle}
      >
        <Text style={styles.transcriptToggleText}>
          {showTranscript ? 'Hide transcript' : 'Show transcript'}
        </Text>
        <Icon
          name={showTranscript ? 'chevron-up' : 'chevron-down'}
          size={11}
          color={colors.textMuted}
        />
      </TouchableOpacity>
      {showTranscript && (
        <View style={styles.transcriptContent}>
          <MarkdownText>{transcript}</MarkdownText>
        </View>
      )}
    </>
  );
};

/** Hook for seek logic */
interface SeekHandlerParams {
  transcript: string | undefined;
  audioPath: string;
  messageId: string;
  totalDurationRef: React.MutableRefObject<number>;
  seekOffsetRef: React.MutableRefObject<number>;
  setLocalElapsed: (v: number) => void;
  setIsSeeking: (v: boolean) => void;
}

export function useSeekHandler({
  transcript, audioPath, messageId,
  totalDurationRef, seekOffsetRef, setLocalElapsed, setIsSeeking,
}: SeekHandlerParams) {
  const stop = useTTSStore((s) => s.stop);
  const speak = useTTSStore((s) => s.speak);

  return useCallback((fraction: number) => {
    if (!transcript || audioPath) return;
    const text = stripMarkdownForSpeech(transcript);
    const charOffset = Math.floor(fraction * text.length);
    const seekPoint = text.lastIndexOf('. ', charOffset) + 2 || charOffset;
    const remaining = text.slice(seekPoint).trim();
    console.log(`[AudioBubble] seeking to ${Math.round(fraction * 100)}%`, 'charOffset:', charOffset, 'remaining:', remaining.length, 'chars');
    if (!remaining) return;
    const seekSeconds = Math.floor(fraction * totalDurationRef.current);
    seekOffsetRef.current = seekSeconds;
    setLocalElapsed(seekSeconds);
    setIsSeeking(true);
    stop();
    setTimeout(() => {
      speak(remaining, messageId).finally(() => setIsSeeking(false));
    }, 200);
  }, [transcript, audioPath, stop, speak, messageId, totalDurationRef, seekOffsetRef, setLocalElapsed, setIsSeeking]);
}
