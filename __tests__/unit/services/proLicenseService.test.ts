import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  refreshProStatus,
  isPro,
  onProStatusChange,
  _resetForTesting,
} from '../../../src/services/proLicenseService';

const mockedGetItem = AsyncStorage.getItem as jest.Mock;

describe('proLicenseService', () => {
  beforeEach(() => {
    _resetForTesting();
    jest.clearAllMocks();
  });

  describe('isPro()', () => {
    it('returns false before refreshProStatus has been called', () => {
      expect(isPro()).toBe(false);
    });

    it('returns false when no receipt is stored', async () => {
      mockedGetItem.mockResolvedValueOnce(null);
      await refreshProStatus();
      expect(isPro()).toBe(false);
    });

    it('returns false when stored receipt is too short (<= 10 chars)', async () => {
      mockedGetItem.mockResolvedValueOnce('short');
      await refreshProStatus();
      expect(isPro()).toBe(false);
    });

    it('returns true when a valid receipt is stored', async () => {
      mockedGetItem.mockResolvedValueOnce('valid-receipt-longer-than-ten-chars');
      await refreshProStatus();
      expect(isPro()).toBe(true);
    });
  });

  describe('refreshProStatus()', () => {
    it('returns the resolved boolean', async () => {
      mockedGetItem.mockResolvedValueOnce('valid-receipt-longer-than-ten-chars');
      const result = await refreshProStatus();
      expect(result).toBe(true);
    });

    it('notifies all listeners after refresh', async () => {
      mockedGetItem.mockResolvedValue('valid-receipt-longer-than-ten-chars');
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      onProStatusChange(cb1);
      onProStatusChange(cb2);
      await refreshProStatus();
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe('onProStatusChange()', () => {
    it('returns an unsubscribe function that stops future notifications', async () => {
      mockedGetItem.mockResolvedValue(null);
      const cb = jest.fn();
      const unsub = onProStatusChange(cb);
      unsub();
      await refreshProStatus();
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
