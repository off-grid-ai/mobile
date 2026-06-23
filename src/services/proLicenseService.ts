import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import * as Keychain from 'react-native-keychain';
import logger from '../utils/logger';
import {
  RC_API_KEY_IOS,
  RC_API_KEY_ANDROID,
  RC_API_KEY_TEST_STORE,
  RC_WEB_PURCHASE_URL,
  USE_RC_TEST_STORE,
} from '../config/revenueCatKeys';

const KEYCHAIN_SERVICE = 'off-grid-pro-license';
const ENTITLEMENT_ID = 'pro';

// react-native-purchases only ships native modules for iOS and Android. On any
// other platform configure is skipped and this stays false, so the RC-backed
// entry points below no-op or fail loudly instead of throwing native errors.
let isConfigured = false;

// Identity model: there is no login. The user's email is used as the RevenueCat
// App User ID. They pay on the web (RC Web Billing) with that email, then enter
// the same email in the app to unlock Pro. We cache { isPro, email } locally and
// re-validate against RC when online so a revoked entitlement locks the app.
type ProLicense = { isPro: boolean; email: string | null; verifiedAt: number };

function setProInStore(isPro: boolean): void {
  const { useAppStore } = require('../stores/appStore');
  useAppStore.getState().setHasRegisteredPro(isPro);
}

export function configureRevenueCat(): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    logger.log(`[RC] configure skipped: unsupported platform ${Platform.OS}`);
    return;
  }
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
    const useTestStore = __DEV__ && USE_RC_TEST_STORE;
    const apiKey = useTestStore
      ? RC_API_KEY_TEST_STORE
      : Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    logger.log(`[RC] configure platform=${Platform.OS} store=${useTestStore ? 'TEST' : Platform.OS} key=${apiKey.slice(0, 12)}...`);
    // Trusted Entitlements (informational): RC cryptographically signs the
    // entitlement payload and the SDK verifies it on-device. We treat a FAILED
    // signature as not-Pro (forgery/MITM defense, see hasVerifiedPro). It has no
    // performance or behaviour cost otherwise.
    Purchases.configure({
      apiKey,
      entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
    });
    isConfigured = true;
    logger.log('[RC] configure: SDK configured OK');
  } catch (e: any) {
    logger.error(`[RC] configure FAILED: ${e?.message ?? e}`);
    throw e;
  }
}

// An entitlement counts as Pro only when it is active AND its Trusted-Entitlements
// signature did not fail. We allow NOT_REQUESTED / VERIFIED / VERIFIED_ON_DEVICE
// (legitimate cached or unverified states) and reject only FAILED, so we never
// false-lock a paying user while still blocking forged entitlement payloads.
function hasVerifiedPro(customerInfo: any): boolean {
  const ent = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
  if (!ent) return false;
  if (ent.verification === Purchases.VERIFICATION_RESULT.FAILED) {
    logger.error('[RC] entitlement present but verification FAILED — treating as not Pro');
    return false;
  }
  return true;
}

async function writeLicense(isPro: boolean, email: string | null): Promise<void> {
  const license: ProLicense = { isPro, email, verifiedAt: Date.now() };
  logger.log(`[RC] writeLicense isPro=${isPro} email=${email ?? 'none'}`);
  try {
    await Keychain.setGenericPassword('license', JSON.stringify(license), {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    });
  } catch (e) {
    // A keychain write failure (locked keychain, unsupported platform) must not
    // surface as a failure to the user. RC still holds the entitlement and the
    // next re-validate re-writes the cache, so log and continue.
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`[RC] writeLicense failed to persist to keychain: ${message}`);
  }
}

async function readProLicense(): Promise<ProLicense> {
  try {
    const result = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!result) {
      return { isPro: false, email: null, verifiedAt: 0 };
    }
    const license: ProLicense = JSON.parse(result.password);
    return {
      isPro: license.isPro ?? false,
      email: license.email ?? null,
      verifiedAt: license.verifiedAt ?? 0,
    };
  } catch (e: any) {
    logger.error(`[RC] readProLicense error: ${e?.message ?? e}`);
    return { isPro: false, email: null, verifiedAt: 0 };
  }
}

export async function readProFromKeychain(): Promise<boolean> {
  const { isPro } = await readProLicense();
  return isPro;
}

export async function checkProStatus(): Promise<boolean> {
  const { isPro } = await readProLicense();
  logger.log(`[RC] checkProStatus: cached=${isPro}, firing background revalidate`);
  revalidatePro().catch(() => {});
  return isPro;
}

// Re-checks the stored email's entitlement with RevenueCat when online. This is
// the revocation path: if Pro is revoked in the RC dashboard, the next online
// launch flips the cached flag to false and locks the app. Network errors are
// swallowed so offline users keep their cached access (grace period).
export async function revalidatePro(): Promise<void> {
  if (!isConfigured) {
    logger.log('[RC] revalidatePro skipped: SDK not configured');
    return;
  }
  const { email } = await readProLicense();
  try {
    if (email) {
      await Purchases.logIn(email);
    }
    await Purchases.invalidateCustomerInfoCache();
    const info = await Purchases.getCustomerInfo();
    const isPro = hasVerifiedPro(info);
    logger.log(`[RC] revalidatePro: email=${email ?? 'none'} isPro=${isPro} active=[${Object.keys(info.entitlements.active).join(', ') || 'none'}]`);
    await writeLicense(isPro, email);
    setProInStore(isPro);
  } catch (e: any) {
    // Offline / transient failure — keep the cached state, do NOT lock the user.
    logger.error(`[RC] revalidatePro error (keeping cached state): ${e?.message ?? e} (code=${e?.code ?? 'none'} underlying=${e?.underlyingErrorMessage ?? 'none'})`);
  }
}

// Public web pay page. "Get Pro" opens this directly (no in-app email): the page
// collects the buyer's email and runs checkout, and that email becomes the
// membership the user later verifies in-app via activateProByEmail.
export const PRO_PAY_PAGE_URL = 'https://offgridmobileai.co/pay';

// Builds the RevenueCat Web Purchase Link URL. RC identifies the customer by
// the App User ID, which is a path segment (not a query parameter). We use the
// email as the App User ID so the Stripe purchase ties to the same identity the
// app uses when calling logIn(email). The ?email= param prefills the email
// field on the checkout page.
//   https://pay.rev.cat/<token>/<urlEncodedEmail>?email=<urlEncodedEmail>
export function getWebPurchaseUrl(email: string): string {
  const normalized = email.trim().toLowerCase();
  const encoded = encodeURIComponent(normalized);
  const base = RC_WEB_PURCHASE_URL.endsWith('/') ? RC_WEB_PURCHASE_URL : `${RC_WEB_PURCHASE_URL}/`;
  return `${base}${encoded}?email=${encoded}`;
}

// Unlocks Pro by logging in as the email (the RC App User ID) and checking the
// entitlement. Used both after a web purchase and to "restore" on a new device.
export async function activateProByEmail(email: string): Promise<boolean> {
  if (!isConfigured) {
    logger.error('[RC] activateProByEmail ABORT: SDK not configured');
    throw new Error('RevenueCat is not configured');
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Email is required');
  }
  logger.log(`[RC] activateProByEmail: calling logIn for ${normalized}`);
  let customerInfo: any;
  try {
    const result = await Purchases.logIn(normalized);
    customerInfo = result.customerInfo;
    logger.log(`[RC] activateProByEmail: logIn OK — appUserId=${customerInfo?.originalAppUserId}`);
  } catch (e: any) {
    logger.error(`[RC] activateProByEmail: logIn FAILED — ${e?.message ?? e} (code=${e?.code ?? 'none'} underlying=${e?.underlyingErrorMessage ?? 'none'})`);
    throw e;
  }
  const isPro = hasVerifiedPro(customerInfo);
  logger.log(`[RC] activateProByEmail: isPro=${isPro} active=[${Object.keys(customerInfo.entitlements.active).join(', ') || 'none'}] verification=${customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]?.verification ?? 'n/a'}`);
  if (isPro) {
    await writeLicense(true, normalized);
    setProInStore(true);
    return true;
  }
  // No entitlement for that email (wrong email, typo, or no purchase). Log back
  // out so the device is not stranded on an empty identity, and don't cache it.
  try {
    await Purchases.logOut();
  } catch (e: any) {
    logger.error(`[RC] activateProByEmail: logOut after miss failed: ${e?.message ?? e}`);
  }
  return false;
}

export async function clearProForTesting(): Promise<void> {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  setProInStore(false);
}

export async function resetProIdentityForTesting(): Promise<void> {
  if (!isConfigured) {
    logger.log('[RC] resetProIdentityForTesting skipped: SDK not configured');
    return;
  }
  logger.log('[RC] resetProIdentityForTesting: start');
  await Purchases.invalidateCustomerInfoCache();
  try {
    const before = await Purchases.getCustomerInfo();
    const isAnonymous = before.originalAppUserId.startsWith('$RCAnonymousID:');
    logger.log(`[RC] resetProIdentityForTesting: customerID before=${before.originalAppUserId} anonymous=${isAnonymous}`);
    if (!isAnonymous) {
      await Purchases.logOut();
    } else {
      logger.log('[RC] resetProIdentityForTesting: anonymous user — skipping logOut');
    }
  } catch (e: any) {
    logger.error(`[RC] resetProIdentityForTesting: ${e?.message ?? e} — continuing`);
  }
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  setProInStore(false);
  logger.log('[RC] resetProIdentityForTesting: done');
}
