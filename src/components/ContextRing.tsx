import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

interface ContextRingProps {
  used: number;
  max: number;
  size?: number;
  thickness?: number;
}

// Amber is not in the palette, so use a fixed value for the mid-warning state.
const AMBER = '#F59E0B';

export const ContextRing: React.FC<ContextRingProps> = ({ used, max, size = 16, thickness = 2 }) => {
  const { colors } = useTheme();

  if (!max || !used) return null;

  const pct = Math.min(used / max, 1);
  const fillColor = pct < 0.7 ? colors.primary : pct < 0.85 ? AMBER : colors.error;
  const emptyColor = colors.border;

  // Each border segment covers one 90-degree arc of the circle.
  // Fill order: top (0-25%) → right (25-50%) → bottom (50-75%) → left (75-100%).
  const top    = pct > 0    ? fillColor : emptyColor;
  const right  = pct >= 0.25 ? fillColor : emptyColor;
  const bottom = pct >= 0.5  ? fillColor : emptyColor;
  const left   = pct >= 0.75 ? fillColor : emptyColor;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: thickness,
        borderTopColor: top,
        borderRightColor: right,
        borderBottomColor: bottom,
        borderLeftColor: left,
      }}
    />
  );
};
