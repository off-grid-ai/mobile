/**
 * Unit tests for AudioSessionManager — the single owner of the iOS AVAudioSession.
 * Guards the mode state machine (playback / record / restore) and the iOS-only +
 * idempotence behaviour, so the silent-playback regressions can't come back.
 */
import { Platform } from 'react-native';
import { AudioManager } from 'react-native-audio-api';
import { audioSessionManager } from '../../../src/services/audioSessionManager';

const setOptions = AudioManager.setAudioSessionOptions as jest.Mock;
const setActivity = AudioManager.setAudioSessionActivity as jest.Mock;

const originalOS = Platform.OS;

const categoryOfLastCall = (): string | undefined =>
  setOptions.mock.calls.at(-1)?.[0]?.iosCategory;

describe('AudioSessionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audioSessionManager._reset();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  describe('iOS', () => {
    beforeEach(() => { Platform.OS = 'ios'; });

    it('ensurePlayback activates a playback-category session', async () => {
      await audioSessionManager.ensurePlayback();
      expect(categoryOfLastCall()).toBe('playback');
      expect(setActivity).toHaveBeenCalledWith(true);
      expect(audioSessionManager.getMode()).toBe('playback');
    });

    it('ensurePlayback is idempotent (no redundant re-activation)', async () => {
      await audioSessionManager.ensurePlayback();
      setOptions.mockClear();
      setActivity.mockClear();
      await audioSessionManager.ensurePlayback();
      expect(setOptions).not.toHaveBeenCalled();
      expect(setActivity).not.toHaveBeenCalled();
    });

    it('ensureRecording activates a playAndRecord session', async () => {
      await audioSessionManager.ensureRecording();
      expect(categoryOfLastCall()).toBe('playAndRecord');
      expect(audioSessionManager.getMode()).toBe('record');
    });

    it('ensurePlayback does NOT downgrade an active recording session', async () => {
      await audioSessionManager.ensureRecording();
      setOptions.mockClear();
      await audioSessionManager.ensurePlayback();
      expect(setOptions).not.toHaveBeenCalled(); // playAndRecord already permits playback
      expect(audioSessionManager.getMode()).toBe('record');
    });

    it('restorePlaybackAfterRecording switches a record session back to playback', async () => {
      await audioSessionManager.ensureRecording();
      await audioSessionManager.restorePlaybackAfterRecording();
      expect(categoryOfLastCall()).toBe('playback');
      expect(audioSessionManager.getMode()).toBe('playback');
    });

    it('restorePlaybackAfterRecording is a no-op when not recording', async () => {
      await audioSessionManager.ensurePlayback();
      setOptions.mockClear();
      await audioSessionManager.restorePlaybackAfterRecording();
      expect(setOptions).not.toHaveBeenCalled();
      expect(audioSessionManager.getMode()).toBe('playback');
    });
  });

  describe('Android', () => {
    beforeEach(() => { Platform.OS = 'android'; });

    it('every method is a no-op (no session API touched, mode stays null)', async () => {
      await audioSessionManager.ensurePlayback();
      await audioSessionManager.ensureRecording();
      await audioSessionManager.restorePlaybackAfterRecording();
      expect(setOptions).not.toHaveBeenCalled();
      expect(setActivity).not.toHaveBeenCalled();
      expect(audioSessionManager.getMode()).toBeNull();
    });
  });
});
