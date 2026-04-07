import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { useTTSStore } from '../../stores/ttsStore';
import { TYPOGRAPHY, SPACING } from '../../constants';
import type { ThemeColors, ThemeShadows } from '../../theme';

const WAVEFORM_BARS = 40; // number of bars to display (subset of 200 data points)
const SPEED_STEPS: number[] = [0.5, 1.0, 1.5, 2.0];

interface AudioMessageBubbleProps {
  messageId: string;
  audioPath: string;
  waveformData: number[];
  durationSeconds: number;
  /** Optional plain-text transcript to show when user expands */
  transcript?: string;
  isGenerating?: boolean;
  /** True for user-sent voice recordings (right-aligned) */
  isUser?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function subsample(data: number[], count: number): number[] {
  if (data.length === 0) {
    return Array(count).fill(0.1);
  }
  const step = data.length / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(data[Math.floor(i * step)] ?? 0.1);
  }
  return result;
}

function normalize(data: number[]): number[] {
  const max = Math.max(...data, 0.001);
  return data.map((v) => v / max);
}

const WaveformBars: React.FC<{
  data: number[];
  colors: ThemeColors;
}> = ({ data, colors }) => {
  const bars = normalize(subsample(data, WAVEFORM_BARS));
  return (
    <View style={barStyles.container}>
      {bars.map((amp, i) => {
        const height = Math.max(3, Math.round(amp * 28));
        return (
          <View
            key={i}
            style={[
              barStyles.bar,
              {
                height,
                backgroundColor: colors.primary,
                opacity: 0.6 + amp * 0.4,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const barStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
});

export const AudioMessageBubble: React.FC<AudioMessageBubbleProps> = ({
  messageId,
  audioPath,
  waveformData,
  durationSeconds,
  transcript,
  isGenerating,
  isUser = false,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isSpeaking, currentMessageId, settings, playMessage, stopPlayback, updateSettings } =
    useTTSStore();

  const [showTranscript, setShowTranscript] = useState(false);
  const initialSpeedIdx = SPEED_STEPS.indexOf(settings.speed);
  const [speedIndex, setSpeedIndex] = useState(initialSpeedIdx >= 0 ? initialSpeedIdx : 1);

  const isThisPlaying = isSpeaking && currentMessageId === messageId;

  const handlePlayPause = useCallback(() => {
    if (isThisPlaying) {
      stopPlayback();
      return;
    }
    playMessage(messageId, audioPath);
  }, [isThisPlaying, stopPlayback, playMessage, messageId, audioPath]);

  const handleSpeedCycle = useCallback(() => {
    const next = (speedIndex + 1) % SPEED_STEPS.length;
    setSpeedIndex(next);
    updateSettings({ speed: SPEED_STEPS[next] });
  }, [speedIndex, updateSettings]);

  if (isGenerating) {
    return (
      <View style={[styles.bubble, isUser && styles.bubbleUser]} testID={`audio-bubble-generating-${messageId}`}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.generatingText}>Generating audio...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.bubble, isUser && styles.bubbleUser]} testID={`audio-bubble-${messageId}`}>
      {/* Playback row */}
      <View style={styles.playRow}>
        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon
            name={isThisPlaying ? 'pause' : 'play'}
            size={16}
            color={colors.primary}
          />
        </TouchableOpacity>

        <WaveformBars data={waveformData} colors={colors} />

        <Text style={styles.duration}>{formatDuration(durationSeconds)}</Text>

        <TouchableOpacity
          onPress={handleSpeedCycle}
          style={styles.speedChip}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.speedText}>{SPEED_STEPS[speedIndex]}x</Text>
        </TouchableOpacity>
      </View>

      {/* Transcript toggle */}
      {transcript ? (
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
      ) : null}

      {showTranscript && transcript ? (
        <Text style={styles.transcript}>{transcript}</Text>
      ) : null}
    </View>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.md,
    maxWidth: '80%' as const,
    alignSelf: 'flex-start' as const,
    gap: SPACING.sm,
  },
  bubbleUser: {
    alignSelf: 'flex-end' as const,
    backgroundColor: `${colors.primary}18`,
    borderColor: `${colors.primary}40`,
  },
  generatingText: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    marginLeft: SPACING.sm,
  },
  playRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  duration: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    minWidth: 32,
    textAlign: 'right' as const,
  },
  speedChip: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedText: {
    ...TYPOGRAPHY.metaSmall,
    color: colors.textSecondary,
  },
  transcriptToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
  },
  transcriptToggleText: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  transcript: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
