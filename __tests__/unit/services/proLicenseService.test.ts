import {
  readProFromKeychain,
  checkProStatus,
  activateProByEmail,
  getWebPurchaseUrl,
  revalidatePro,
  clearProForTesting,
  configureRevenueCat,
} from '../../../src/services/proLicenseService';

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure: jest.fn(),
    getCustomerInfo: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(() => Promise.resolve()),
    invalidateCustomerInfoCache: jest.fn(() => Promise.resolve()),
    ENTITLEMENT_VERIFICATION_MODE: { DISABLED: 'DISABLED', INFORMATIONAL: 'INFORMATIONAL' },
    VERIFICATION_RESULT: { NOT_REQUESTED: 'NOT_REQUESTED', VERIFIED: 'VERIFIED', FAILED: 'FAILED', VERIFIED_ON_DEVICE: 'VERIFIED_ON_DEVICE' },
  },
  LOG_LEVEL: { DEBUG: 'debug', ERROR: 'error' },
}));

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  ACCESSIBLE: { AFTER_FIRST_UNLOCK: 'AfterFirstUnlock' },
}));

const mockSetHasRegisteredPro = jest.fn();
jest.mock('../../../src/stores/appStore', () => ({
  useAppStore: { getState: () => ({ setHasRegisteredPro: mockSetHasRegisteredPro }) },
}));

const { getGenericPassword: mockGetGenericPassword, setGenericPassword: mockSetGenericPassword, resetGenericPassword: mockResetGenericPassword } =
  require('react-native-keychain');
const Purchases = require('react-native-purchases').default;
const VERIFIED = 'VERIFIED';
const FAILED = 'FAILED';

const proLicense = (email: string | null) => ({ password: JSON.stringify({ isPro: true, email, verifiedAt: 0 }) });
const customerWith = (verification: string | null) => ({
  entitlements: { active: verification ? { pro: { productIdentifier: 'off_grid_pro_lifetime', verification } } : {} },
  originalAppUserId: 'someone@example.com',
});

describe('proLicenseService', () => {
  beforeAll(() => {
    // configureRevenueCat sets the module-level isConfigured flag the RC-backed
    // entry points require. Pin Platform.OS first (its default varies in RN test env).
    require('react-native').Platform.OS = 'ios';
    configureRevenueCat();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configureRevenueCat()', () => {
    it('configures the SDK with Trusted Entitlements (informational)', () => {
      configureRevenueCat();
      expect(Purchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ entitlementVerificationMode: 'INFORMATIONAL' }),
      );
    });
  });

  describe('readProFromKeychain()', () => {
    it('returns false when no entry exists', async () => {
      mockGetGenericPassword.mockResolvedValueOnce(false);
      expect(await readProFromKeychain()).toBe(false);
    });

    it('returns true when the stored license is pro', async () => {
      mockGetGenericPassword.mockResolvedValueOnce(proLicense('a@b.com'));
      expect(await readProFromKeychain()).toBe(true);
    });

    it('returns false when the stored license is malformed', async () => {
      mockGetGenericPassword.mockResolvedValueOnce({ password: 'not-json' });
      expect(await readProFromKeychain()).toBe(false);
    });
  });

  describe('checkProStatus()', () => {
    it('returns the cached value immediately', async () => {
      mockGetGenericPassword.mockResolvedValue(proLicense('a@b.com'));
      Purchases.logIn.mockResolvedValue({ customerInfo: customerWith(VERIFIED) });
      Purchases.getCustomerInfo.mockResolvedValue(customerWith(VERIFIED));
      expect(await checkProStatus()).toBe(true);
    });
  });

  describe('getWebPurchaseUrl()', () => {
    it('puts the normalized email as a path segment and prefills the email param', () => {
      const url = getWebPurchaseUrl('  Test@Example.com  ');
      expect(url).toContain('/test%40example.com');
      expect(url).toContain('?email=test%40example.com');
      expect(url).not.toContain('app_user_id');
    });
  });

  describe('activateProByEmail()', () => {
    it('unlocks Pro when the email has a verified active entitlement', async () => {
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: customerWith(VERIFIED) });
      mockSetGenericPassword.mockResolvedValueOnce(true);
      expect(await activateProByEmail('Buyer@Example.com')).toBe(true);
      expect(Purchases.logIn).toHaveBeenCalledWith('buyer@example.com');
      expect(mockSetHasRegisteredPro).toHaveBeenCalledWith(true);
    });

    it('returns false and logs out when the email has no entitlement', async () => {
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: customerWith(null) });
      expect(await activateProByEmail('nope@example.com')).toBe(false);
      expect(Purchases.logOut).toHaveBeenCalledTimes(1);
      expect(mockSetHasRegisteredPro).not.toHaveBeenCalledWith(true);
    });

    it('treats a FAILED verification signature as not Pro (forgery defense)', async () => {
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: customerWith(FAILED) });
      expect(await activateProByEmail('forged@example.com')).toBe(false);
      expect(Purchases.logOut).toHaveBeenCalledTimes(1);
    });

    it('throws when email is empty', async () => {
      await expect(activateProByEmail('   ')).rejects.toThrow('Email is required');
    });
  });

  describe('revalidatePro() — revocation', () => {
    it('locks Pro when the entitlement was revoked (no longer active)', async () => {
      mockGetGenericPassword.mockResolvedValue(proLicense('a@b.com'));
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: customerWith(null) });
      Purchases.getCustomerInfo.mockResolvedValueOnce(customerWith(null));
      mockSetGenericPassword.mockResolvedValueOnce(true);
      await revalidatePro();
      expect(mockSetHasRegisteredPro).toHaveBeenCalledWith(false);
      // wrote isPro=false back to the keychain
      const written = JSON.parse(mockSetGenericPassword.mock.calls[0][1]);
      expect(written.isPro).toBe(false);
    });

    it('keeps cached state when offline (network error)', async () => {
      mockGetGenericPassword.mockResolvedValue(proLicense('a@b.com'));
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: customerWith(VERIFIED) });
      Purchases.getCustomerInfo.mockRejectedValueOnce(new Error('network'));
      await revalidatePro();
      expect(mockSetGenericPassword).not.toHaveBeenCalled();
      expect(mockSetHasRegisteredPro).not.toHaveBeenCalled();
    });

    it('keeps Pro active when the entitlement is still valid', async () => {
      mockGetGenericPassword.mockResolvedValue(proLicense('a@b.com'));
      Purchases.logIn.mockResolvedValueOnce({ customerInfo: customerWith(VERIFIED) });
      Purchases.getCustomerInfo.mockResolvedValueOnce(customerWith(VERIFIED));
      mockSetGenericPassword.mockResolvedValueOnce(true);
      await revalidatePro();
      expect(mockSetHasRegisteredPro).toHaveBeenCalledWith(true);
    });
  });

  describe('clearProForTesting()', () => {
    it('resets the keychain and clears the store flag', async () => {
      mockResetGenericPassword.mockResolvedValueOnce(true);
      await clearProForTesting();
      expect(mockResetGenericPassword).toHaveBeenCalledTimes(1);
      expect(mockSetHasRegisteredPro).toHaveBeenCalledWith(false);
    });
  });
});
