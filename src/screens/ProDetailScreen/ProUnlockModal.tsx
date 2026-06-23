import React, { useState, useEffect } from 'react';
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
import { activateProByEmail, PRO_PAY_PAGE_URL } from '../../services/proLicenseService';

type ErrorMsg = string | null;

type Props = {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

// Verify-only modal: the user enters the email tied to their Pro membership and
// we re-check the entitlement. Paying is a separate path — "Get Pro" opens the
// web pay page directly (no email collected in-app), so this modal never asks
// for payment, only verification of an existing membership.
export const ProUnlockModal: React.FC<Props> = ({ visible, onClose, onUnlocked }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorMsg>(null);
  const [success, setSuccess] = useState(false);

  // The modal stays mounted across opens, so clear transient state each time it
  // opens so a previous attempt's email/error never leaks into a fresh open.
  useEffect(() => {
    if (visible) {
      setEmail('');
      setError(null);
      setSuccess(false);
      setLoading(false);
    }
  }, [visible]);

  const close = () => {
    if (loading || success) return;
    setEmail('');
    setError(null);
    onClose();
  };

  // Dismiss the success card once the user has read it. The keychain write is
  // already done at this point; Pro features load on the next app launch.
  const finishSuccess = () => {
    setEmail('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  const clearError = () => { if (error) setError(null); };

  const handleVerify = async () => {
    // Strip whitespace so stray spaces never reach the RevenueCat identity. The
    // button is disabled when empty, so this is a defensive guard.
    const trimmed = email.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const unlocked = await activateProByEmail(trimmed);
      if (unlocked) {
        setSuccess(true);
        onUnlocked();
      } else {
        setError('No Pro membership found for that email. Check the address and try again.');
      }
    } catch {
      setError('Verification failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Not a member yet — send them to the web pay page. No email is collected here;
  // the page handles checkout and the buyer's email becomes their membership.
  const handleGetPro = () => {
    Linking.openURL(PRO_PAY_PAGE_URL).catch(() => {
      setError('Could not open the Pro page. Please try again.');
    });
  };

  if (success) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={finishSuccess}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.successIconWrap}>
              <Icon name="check" size={26} color={colors.primary} />
            </View>
            <Text style={styles.successTitle}>Pro activated</Text>
            <Text style={styles.successSub}>Close and reopen the app to load your Pro features.</Text>
            <TouchableOpacity style={styles.successBtn} onPress={finishSuccess} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const hasInput = email.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>

          {/* Close X */}
          <TouchableOpacity style={styles.closeBtn} onPress={close} disabled={loading} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Icon name="x" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Header */}
          <Text style={styles.title}>Verify your membership</Text>
          <Text style={styles.subtitle}>
            Enter the email tied to your Pro membership.
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
            testID="unlock-cta"
            style={[styles.primaryBtn, (loading || !hasInput) && styles.disabled]}
            onPress={handleVerify}
            disabled={loading || !hasInput}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? 'Verifying...' : 'Verify membership'}
            </Text>
          </TouchableOpacity>

          {/* Footer — not a member yet, go to the pay page */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={handleGetPro}
            disabled={loading}
          >
            <Text style={styles.toggleText}>Not a member yet? Get Pro</Text>
            <Icon name="external-link" size={13} color={colors.textSecondary} />
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
    borderWidth: 1,
    borderColor: colors.border,
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
  successBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'stretch' as const,
    marginTop: SPACING.xl,
  },
});
