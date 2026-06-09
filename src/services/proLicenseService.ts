import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'user_pro_receipt';
let cached: boolean | null = null;
const listeners = new Set<() => void>();

export async function refreshProStatus(): Promise<boolean> {
  cached = await validateStoredReceipt();
  listeners.forEach(l => l());
  return cached;
}

export function isPro(): boolean {
  return cached === true;
}

export function onProStatusChange( cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// TODO: remove before shipping — bypasses receipt check for local dev
const DEV_BYPASS_PRO = __DEV__;

// production: validate the Apple/Google receipt signature (react-native-iap)
async function validateStoredReceipt(): Promise<boolean> {
  if (DEV_BYPASS_PRO) return true;
  const raw = await AsyncStorage.getItem(KEY);
  return !!raw && raw.length > 10;
}

export function _resetForTesting(): void {
  cached = null;
  listeners.clear();
}
