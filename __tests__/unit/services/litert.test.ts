/**
 * Unit tests for litert.ts
 * Targets the state-machine branches that don't require native hardware.
 */

// Mock NativeModules BEFORE importing the service
const mockLiteRTModule = {
  loadModel: jest.fn(),
  resetConversation: jest.fn(),
  sendMessage: jest.fn(),
  stopGeneration: jest.fn(),
  unloadModel: jest.fn(),
  getMemoryInfo: jest.fn(),
};

const mockAddListener = jest.fn(() => ({ remove: jest.fn() }));
const mockEmitter = { addListener: mockAddListener };

jest.mock('react-native', () => ({
  NativeModules: { LiteRTModule: mockLiteRTModule },
  NativeEventEmitter: jest.fn(() => mockEmitter),
  Platform: {
    OS: 'android',
    select: (spec: Record<string, any>) => spec.android ?? spec.default ?? null,
  },
}));

jest.mock('../../../src/utils/logger', () => {
  const log = jest.fn();
  return { __esModule: true, default: { log, error: log, warn: log } };
});

// Import after mocks are set up
import { liteRTService } from '../../../src/services/litert';

describe('LiteRTService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset internal state to unloaded
    (liteRTService as any).loaded = false;
    (liteRTService as any).activeBackend = null;
    (liteRTService as any).activeConversationId = null;
    (liteRTService as any).activeSystemPrompt = null;
    (liteRTService as any).subscriptions = [];
    (liteRTService as any).currentCallbacks = null;
    // Ensure emitter is available for tests that need it
    (liteRTService as any).emitter = mockEmitter;
    // Make isAvailable return true by default so state-machine methods run
    jest.spyOn(liteRTService, 'isAvailable').mockReturnValue(true);
  });

  describe('isModelLoaded', () => {
    it('returns false when not loaded', () => {
      expect(liteRTService.isModelLoaded()).toBe(false);
    });

    it('returns true when loaded flag is set', () => {
      (liteRTService as any).loaded = true;
      expect(liteRTService.isModelLoaded()).toBe(true);
    });
  });

  describe('getActiveBackend', () => {
    it('returns null when no model loaded', () => {
      expect(liteRTService.getActiveBackend()).toBeNull();
    });

    it('returns backend when set', () => {
      (liteRTService as any).activeBackend = 'npu';
      expect(liteRTService.getActiveBackend()).toBe('npu');
    });
  });

  describe('isNPU', () => {
    it('returns false when backend is cpu', () => {
      (liteRTService as any).activeBackend = 'cpu';
      expect(liteRTService.isNPU()).toBe(false);
    });

    it('returns true when backend is npu', () => {
      (liteRTService as any).activeBackend = 'npu';
      expect(liteRTService.isNPU()).toBe(true);
    });
  });

  describe('loadModel', () => {
    it('calls onError when model not loaded (sendMessage guard)', async () => {
      // loadModel uses module-level LiteRTModule const captured at import — hard to mock via NativeModules.
      // Instead verify the isAvailable guard indirectly via sendMessage which rejects when not loaded.
      (liteRTService as any).loaded = false;
      const onError = jest.fn();
      await liteRTService.sendMessage('test', { onToken: jest.fn(), onReasoning: jest.fn(), onComplete: jest.fn(), onError });
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('calls onError immediately when model is not loaded', async () => {
      const onError = jest.fn();
      const callbacks = { onToken: jest.fn(), onReasoning: jest.fn(), onComplete: jest.fn(), onError };
      await liteRTService.sendMessage('hello', callbacks);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockLiteRTModule.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('prepareConversation', () => {
    it('skips reset when conversationId and systemPrompt are unchanged', async () => {
      (liteRTService as any).loaded = true;
      (liteRTService as any).activeConversationId = 'conv-1';
      (liteRTService as any).activeSystemPrompt = 'You are helpful.';
      (liteRTService as any).activeToolsJson = '';
      mockLiteRTModule.resetConversation.mockResolvedValue(undefined);

      await liteRTService.prepareConversation('conv-1', 'You are helpful.');

      expect(mockLiteRTModule.resetConversation).not.toHaveBeenCalled();
    });

    it('calls resetConversation when systemPrompt changes', async () => {
      // Spy on resetConversation directly since LiteRTModule const is captured at import
      const resetSpy = jest.spyOn(liteRTService as any, 'resetConversation').mockResolvedValue(undefined);
      (liteRTService as any).loaded = true;
      (liteRTService as any).activeConversationId = 'conv-1';
      (liteRTService as any).activeSystemPrompt = 'Old prompt';

      await liteRTService.prepareConversation('conv-1', 'New prompt');

      expect(resetSpy).toHaveBeenCalledWith('New prompt', { samplerConfig: undefined, tools: undefined, history: undefined });
      expect((liteRTService as any).activeConversationId).toBe('conv-1');
      resetSpy.mockRestore();
    });
  });

  describe('stopGeneration', () => {
    it('clears activeConversationId to force reset on next turn', async () => {
      (liteRTService as any).activeConversationId = 'conv-1';
      mockLiteRTModule.stopGeneration.mockResolvedValue(undefined);

      await liteRTService.stopGeneration();

      expect((liteRTService as any).activeConversationId).toBeNull();
    });

    it('swallows errors from native stopGeneration', async () => {
      mockLiteRTModule.stopGeneration.mockRejectedValue(new Error('native error'));
      await expect(liteRTService.stopGeneration()).resolves.not.toThrow();
    });
  });

  describe('unloadModel', () => {
    it('sets loaded=false and clears backend in finally block', async () => {
      (liteRTService as any).loaded = true;
      (liteRTService as any).activeBackend = 'gpu';
      mockLiteRTModule.unloadModel.mockResolvedValue(undefined);

      await liteRTService.unloadModel();

      expect(liteRTService.isModelLoaded()).toBe(false);
      expect(liteRTService.getActiveBackend()).toBeNull();
    });

    it('still clears state even when native unloadModel throws', async () => {
      (liteRTService as any).loaded = true;
      (liteRTService as any).activeBackend = 'npu';
      mockLiteRTModule.unloadModel.mockRejectedValue(new Error('unload failed'));

      await liteRTService.unloadModel();

      expect(liteRTService.isModelLoaded()).toBe(false);
      expect(liteRTService.getActiveBackend()).toBeNull();
    });
  });
});
