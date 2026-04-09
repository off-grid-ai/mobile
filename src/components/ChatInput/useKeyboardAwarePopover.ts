import { useRef, useEffect, useState, useCallback } from 'react';
import { Keyboard, Dimensions, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { SPACING } from '../../constants';
import logger from '../../utils/logger';

/**
 * Hook that manages keyboard-aware popover positioning.
 * When the keyboard is visible, dismisses it and waits for `keyboardDidHide`
 * before measuring position to ensure correct coordinates.
 */
export function useKeyboardAwarePopover(offsetX: number = SPACING.md, debugName: string = 'popover') {
    const [anchor, setAnchor] = useState({ y: 0, x: 0 });
    const [visible, setVisible] = useState(false);
    const triggerRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
    const keyboardVisibleRef = useRef(false);
    const isWaitingForKeyboard = useRef(false);
    const pendingSubRef = useRef<(() => void) | null>(null);

    const logPopover = useCallback((message: string, extra?: Record<string, unknown>) => {
        logger.log(`[ChatInput][${debugName}]`, message, extra ?? {});
    }, [debugName]);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => {
            keyboardVisibleRef.current = true;
            logPopover('keyboard-did-show');
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            keyboardVisibleRef.current = false;
            logPopover('keyboard-did-hide');
        });
        return () => {
            showSub.remove();
            hideSub.remove();
            pendingSubRef.current?.();
        };
    }, [logPopover]);

    const show = useCallback(() => {
        const measureAndShow = () => {
            triggerRef.current?.measureInWindow?.((...args: number[]) => {
                const screenH = Dimensions.get('window').height;
                // On Android, measureInWindow Y includes the status bar but
                // Dimensions.get('window').height may not — subtract the offset
                // so the popover sits snugly above the trigger button.
                const statusBarOffset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
                setAnchor({ y: screenH - (args[1] ?? 0) - statusBarOffset, x: offsetX });
                logPopover('measured-trigger', {
                    rawY: args[1] ?? null,
                    screenH,
                    statusBarOffset,
                    anchorX: offsetX,
                });
            });
            setVisible(true);
            logPopover('popover-visible', { keyboardVisible: keyboardVisibleRef.current });
        };

        if (keyboardVisibleRef.current) {
            if (isWaitingForKeyboard.current) {
                logPopover('show-skipped-already-waiting');
                return;
            }
            isWaitingForKeyboard.current = true;
            logPopover('show-waiting-for-keyboard-hide');
            Keyboard.dismiss();

            let cancelled = false;
            const sub = Keyboard.addListener('keyboardDidHide', () => {
                sub.remove();
                isWaitingForKeyboard.current = false;
                logPopover('keyboard-hide-listener-fired', { cancelled });
                if (!cancelled) requestAnimationFrame(measureAndShow);
            });

            pendingSubRef.current = () => { cancelled = true; sub.remove(); };
        } else {
            logPopover('show-immediate');
            measureAndShow();
        }
    }, [logPopover, offsetX]);

    const hide = useCallback(() => {
        logPopover('popover-hidden');
        setVisible(false);
    }, [logPopover]);

    return { anchor, visible, triggerRef, show, hide };
}
