import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { AppSheet } from './AppSheet';
import { useTheme } from '../theme';
import { ragService, PASTE_MAX_CHARS } from '../services/rag';
import { TYPOGRAPHY, SPACING } from '../constants';

const MIN_CHARS = 100;
const WARN_CHARS = 40_000;

function autoTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  return words || 'Untitled Note';
}

export interface AddTextModalProps {
  visible: boolean;
  projectId: string;
  onClose: () => void;
  onIndexed: () => void;
}

export const AddTextModal: React.FC<AddTextModalProps> = ({ visible, projectId, onClose, onIndexed }) => {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [indexing, setIndexing] = useState(false);

  const charCount = text.length;
  const tooShort = charCount > 0 && charCount < MIN_CHARS;
  const tooLong = charCount > PASTE_MAX_CHARS;
  const canSave = charCount >= MIN_CHARS && !tooLong && !indexing;

  const counterColor = tooLong
    ? colors.error
    : charCount >= WARN_CHARS
    ? colors.trending
    : colors.textMuted;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const resolvedTitle = title.trim() || autoTitle(text);
    setIndexing(true);
    try {
      await ragService.indexTextContent({ projectId, title: resolvedTitle, text });
      setTitle('');
      setText('');
      onIndexed();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add text');
    } finally {
      setIndexing(false);
    }
  }, [canSave, title, text, projectId, onIndexed, onClose]);

  const handleClose = useCallback(() => {
    if (indexing) return;
    setTitle('');
    setText('');
    onClose();
  }, [indexing, onClose]);

  return (
    <AppSheet
      visible={visible}
      onClose={handleClose}
      onHeaderClosePress={handleClose}
      title="Add Text"
      closeLabel="Cancel"
      snapPoints={['90%']}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={{
            ...TYPOGRAPHY.body,
            color: colors.text,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingVertical: SPACING.sm,
            marginBottom: SPACING.md,
          }}
          value={title}
          onChangeText={setTitle}
          placeholder="Title (optional — auto-fills from content)"
          placeholderTextColor={colors.textMuted}
          maxLength={100}
          returnKeyType="next"
          editable={!indexing}
        />

        <TextInput
          style={{
            ...TYPOGRAPHY.body,
            color: colors.text,
            minHeight: 220,
            textAlignVertical: 'top',
          }}
          value={text}
          onChangeText={setText}
          placeholder="Paste or type text here..."
          placeholderTextColor={colors.textMuted}
          multiline
          scrollEnabled={false}
          editable={!indexing}
        />

        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: SPACING.sm,
          marginBottom: SPACING.lg,
        }}>
          {tooShort ? (
            <Text style={{ ...TYPOGRAPHY.meta, color: colors.textMuted }}>
              {`min ${MIN_CHARS} characters`}
            </Text>
          ) : tooLong ? (
            <Text style={{ ...TYPOGRAPHY.meta, color: colors.error }}>
              {`max ${PASTE_MAX_CHARS.toLocaleString()} characters`}
            </Text>
          ) : (
            <View />
          )}
          <Text style={{ ...TYPOGRAPHY.meta, color: counterColor }}>
            {`${charCount.toLocaleString()} / ${PASTE_MAX_CHARS.toLocaleString()}`}
          </Text>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: canSave ? colors.primary : colors.surfaceHover,
            borderRadius: 6,
            paddingVertical: SPACING.md,
            alignItems: 'center',
          }}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.8}
        >
          {indexing ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <Text style={{ ...TYPOGRAPHY.body, color: canSave ? colors.surface : colors.textMuted }}>
              Save to knowledge base
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </AppSheet>
  );
};
