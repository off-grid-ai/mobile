import { useRef, useEffect, useState, useCallback } from 'react';
import { Keyboard, Dimensions, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { SPACING } from '../../constants';

/**
 * Hook that manages keyboard-aware popover positioning.
 * When the keyboard is visible, dismisses it and waits for `keyboardDidHide`
 * before measuring position to ensure correct coordinates.
 */
export function useKeyboardAwarePopover(offsetX: number = SPACING.md) {
    const [anchor, setAnchor] = useState({ y: 0, x: 0 });
    const [visible, setVisible] = useState(false);
    const triggerRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
    const keyboardVisibleRef = useRef(false);
    const isWaitingForKeyboard = useRef(false);
    const pendingSubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => { keyboardVisibleRef.current = true; });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => { keyboardVisibleRef.current = false; });
        return () => {
            showSub.remove();
            hideSub.remove();
            pendingSubRef.current?.();
        };
    }, []);

    const show = useCallback(() => {
        const measureAndShow = () => {
            triggerRef.current?.measureInWindow?.((...args: number[]) => {
                const screenH = Dimensions.get('window').height;
                // On Android, measureInWindow Y includes the status bar but
                // Dimensions.get('window').height may not — subtract the offset
                // so the popover sits snugly above the trigger button.
                const statusBarOffset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
                setAnchor({ y: screenH - (args[1] ?? 0) - statusBarOffset, x: offsetX });
            });
            setVisible(true);
        };

        if (keyboardVisibleRef.current) {
            if (isWaitingForKeyboard.current) return;
            isWaitingForKeyboard.current = true;
            Keyboard.dismiss();

            let cancelled = false;
            const sub = Keyboard.addListener('keyboardDidHide', () => {
                sub.remove();
                isWaitingForKeyboard.current = false;
                if (!cancelled) requestAnimationFrame(measureAndShow);
            });

            pendingSubRef.current = () => { cancelled = true; sub.remove(); };
        } else {
            measureAndShow();
        }
    }, [offsetX]);

    const hide = useCallback(() => setVisible(false), []);

    return { anchor, visible, triggerRef, show, hide };
}
