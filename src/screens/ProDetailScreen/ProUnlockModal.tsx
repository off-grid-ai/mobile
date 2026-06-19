import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemeColors, ThemeShadows } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import { activateProByEmail, getWebPurchaseUrl } from '../../services/proLicenseService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

// Two modes: pay (default) or verify (already paid).
// One primary button, one text toggle. No competing button rows.
type Mode = 'pay' | 'verify';
type ErrorMsg = string | null;

export const ProUnlockModal: React.FC<Props> = ({ visible, onClose, onUnlocked }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<Mode>('pay');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMsg>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setEmail('');
    setMode('pay');
    setLoading(false);
    setError(null);
    setSuccess(false);
  };

  const close = () => {
    if (loading || success) return;
    reset();
    onClose();
  };

  const clearError = () => { if (error) setError(null); };

  const handlePrimary = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email first.');
      return;
    }

    if (mode === 'pay') {
      try {
        await Linking.openURL(getWebPurchaseUrl(trimmed));
      } catch {
        setError('Could not open checkout. Please try again.');
      }
      return;
    }

    // verify mode
    setLoading(true);
    setError(null);
    try {
      const unlocked = await activateProByEmail(trimmed);
      if (unlocked) {
        setSuccess(true);
        onUnlocked();
      } else {
        setError('No Pro purchase found for that email. Check the address and try again.');
      }
    } catch {
      setError('Verification failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.successIconWrap}>
              <Icon name="check" size={26} color={colors.primary} />
            </View>
            <Text style={styles.successTitle}>Pro activated</Text>
            <Text style={styles.successSub}>Close and reopen the app to load your Pro features.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const isPay = mode === 'pay';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>

          {/* Close X */}
          <TouchableOpacity style={styles.closeBtn} onPress={close} disabled={loading} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Icon name="x" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Header */}
          <Text style={styles.title}>Unlock Off Grid Pro</Text>
          <Text style={styles.subtitle}>
            {isPay
              ? 'Enter your email to pay. One-time $50, no subscription.'
              : 'Enter the email you used when you paid.'}
          </Text>

          {/* Email input */}
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError(); }}
            editable={!loading}
          />

          {/* Inline error */}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Primary CTA */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.disabled]}
            onPress={handlePrimary}
            disabled={loading}
            activeOpacity={0.85}
          >
            {isPay ? (
              <>
                <Text style={styles.primaryBtnText}>Continue to payment</Text>
                <View style={styles.pricePill}>
                  <Text style={styles.priceText}>$50</Text>
                </View>
              </>
            ) : (
              <Text style={styles.primaryBtnText}>
                {loading ? 'Verifying...' : 'Verify and unlock'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Mode toggle — plain text, no button chrome */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => { setMode(isPay ? 'verify' : 'pay'); setError(null); }}
            disabled={loading}
          >
            <Text style={styles.toggleText}>
              {isPay ? 'Already paid? Verify email instead' : 'Not paid yet? Back to checkout'}
            </Text>
            <Icon name={isPay ? 'arrow-right' : 'arrow-left'} size={13} color={colors.textSecondary} />
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center' as const,
    paddingHorizontal: SPACING.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    ...shadows.small,
  },

  closeBtn: {
    alignSelf: 'flex-end' as const,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },

  input: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.xs,
  },

  errorText: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: '#E05252',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
    lineHeight: 18,
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  pricePill: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },

  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  toggleText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
  },

  disabled: {
    opacity: 0.5,
  },

  // Success state
  successIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'center' as const,
    marginBottom: SPACING.lg,
  },
  successTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: SPACING.sm,
  },
  successSub: {
    ...TYPOGRAPHY.body,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },
});
