import React from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AppSheet } from './AppSheet';
import { useTheme, useThemedStyles } from '../theme';
import { FONTS, TYPOGRAPHY, SPACING } from '../constants';
import { AVAILABLE_TOOLS } from '../services/tools';
import { getToolExtensions } from '../services/tools/extensions';
import { useAppStore } from '../stores';
import type { ThemeColors, ThemeShadows } from '../theme';

const TOOL_WARNING_COLOR = '#F59E0B';

interface ToolPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
}

export const ToolPickerSheet: React.FC<ToolPickerSheetProps> = ({
  visible,
  onClose,
  enabledTools,
  onToggleTool,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { toolCountHintDismissed, setToolCountHintDismissed } = useAppStore();

  // Pro extensions (e.g. email/calendar) advertise tools that belong in the main
  // picker and toggle through the same enabledTools array. MCP is excluded here
  // because it has its own dedicated picker. Dedupe by id so a tool never doubles.
  const extensionTools = getToolExtensions().flatMap(e => e.getToolDefinitions?.() ?? []);
  const availableTools = [...AVAILABLE_TOOLS, ...extensionTools].filter(
    (tool, index, all) => all.findIndex(t => t.id === tool.id) === index,
  );

  const showHint = enabledTools.length > 3 && !toolCountHintDismissed;

  return (
    <AppSheet
      visible={visible}
      onClose={onClose}
      enableDynamicSizing
      title="Tools"
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {showHint && (
          <View style={[styles.hintBanner, { backgroundColor: colors.surface }]}>
            <Icon name="alert-circle" size={16} color={TOOL_WARNING_COLOR} style={styles.hintIcon} />
            <View style={styles.hintBody}>
              <Text style={[styles.hintText, { color: colors.text }]}>
                Too many tools can confuse the model and increase latency on the first response. Stick to 2-3 tools for best results.
              </Text>
              <TouchableOpacity onPress={setToolCountHintDismissed} style={styles.hintDismiss}>
                <Text style={styles.hintDismissText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {availableTools.map(tool => {
          const isEnabled = enabledTools.includes(tool.id);
          return (
            <View key={tool.id} style={styles.toolRow} testID={`tool-picker-row-${tool.id}`}>
              <View style={styles.toolIcon}>
                <Icon name={tool.icon} size={20} color={isEnabled ? colors.primary : colors.textMuted} />
              </View>
              <View style={styles.toolInfo}>
                <View style={styles.toolNameRow}>
                  <Text style={styles.toolName} testID={`tool-picker-name-${tool.id}`}>{tool.displayName}</Text>
                  {tool.requiresNetwork && (
                    <Icon name="wifi" size={12} color={colors.textMuted} style={styles.networkIcon} />
                  )}
                </View>
                <Text style={styles.toolDescription}>{tool.description}</Text>
              </View>
              <Switch
                value={isEnabled}
                onValueChange={() => onToggleTool(tool.id)}
                trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                thumbColor={isEnabled ? colors.primary : colors.textMuted}
              />
            </View>
          );
        })}
        <Text style={styles.hint}>
          Enabling more tools can confuse the model and increases latency on first response.
        </Text>
      </ScrollView>
    </AppSheet>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  container: {
    maxHeight: 420,
  },
  contentContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  toolRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  toolInfo: {
    flex: 1,
    marginRight: 12,
  },
  toolNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  toolName: {
    fontSize: 15,
    fontFamily: FONTS.mono,
    fontWeight: '600' as const,
    color: colors.text,
  },
  networkIcon: {
    marginLeft: 6,
  },
  toolDescription: {
    fontSize: 12,
    fontFamily: FONTS.mono,
    color: colors.textMuted,
    marginTop: 2,
  },
  hint: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    marginTop: SPACING.lg,
    textAlign: 'center' as const,
  },
  hintBanner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    borderWidth: 1,
    borderColor: TOOL_WARNING_COLOR,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  hintIcon: {
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  hintBody: {
    flex: 1,
  },
  hintText: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 18,
  },
  hintDismiss: {
    marginTop: SPACING.sm,
  },
  hintDismissText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '400' as const,
    color: TOOL_WARNING_COLOR,
  },
});
