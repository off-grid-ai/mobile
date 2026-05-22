import RNFS from 'react-native-fs';
import { validateModelFile, checkMemoryForModel, safeCompletion } from '../../../src/services/llmSafetyChecks';

const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;

describe('validateModelFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns invalid when file is too small', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 100 } as any);

    const result = await validateModelFile('/models/tiny.gguf');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too small');
  });

  it('returns valid for a proper GGUF file', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 1_000_000 } as any);
    mockedRNFS.read.mockResolvedValue('GGUF');

    const result = await validateModelFile('/models/test.gguf');
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid when header is not GGUF', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 1_000_000 } as any);
    mockedRNFS.read.mockResolvedValue('NOPE');

    const result = await validateModelFile('/models/test.bin');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not a GGUF file');
  });

  it('returns valid when RNFS.read() throws (iOS bridging workaround)', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: 1_000_000 } as any);
    mockedRNFS.read.mockRejectedValueOnce(new Error('NSInteger bridge error'));

    const result = await validateModelFile('/models/test.gguf');
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid when stat throws', async () => {
    mockedRNFS.stat.mockRejectedValue(new Error('file not found'));

    const result = await validateModelFile('/models/missing.gguf');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Failed to validate');
  });

  it('handles string file size from stat', async () => {
    mockedRNFS.stat.mockResolvedValue({ size: '5000000' } as any);
    mockedRNFS.read.mockResolvedValue('GGUF');

    const result = await validateModelFile('/models/test.gguf');
    expect(result).toEqual({ valid: true });
  });
});

describe('checkMemoryForModel', () => {
  const mockGetMemory = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns safe when enough memory is available', async () => {
    mockGetMemory.mockResolvedValue({
      available: 4 * 1024 * 1024 * 1024, // 4 GB
      total: 8 * 1024 * 1024 * 1024,
    });

    const result = await checkMemoryForModel(
      500 * 1024 * 1024, // 500 MB model
      2048,
      mockGetMemory,
    );
    expect(result.safe).toBe(true);
  });

  it('returns unsafe when not enough memory', async () => {
    mockGetMemory.mockResolvedValue({
      available: 300 * 1024 * 1024, // 300 MB
      total: 4 * 1024 * 1024 * 1024,
    });

    const result = await checkMemoryForModel(
      2 * 1024 * 1024 * 1024, // 2 GB model
      4096,
      mockGetMemory,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Not enough memory');
  });

  it('returns safe when memory check throws', async () => {
    mockGetMemory.mockRejectedValue(new Error('not supported'));

    const result = await checkMemoryForModel(500 * 1024 * 1024, 2048, mockGetMemory);
    expect(result.safe).toBe(true);
  });
});

describe('safeCompletion', () => {
  it('returns result of completionFn on success', async () => {
    const mockContext = { clearCache: jest.fn() };
    const result = await safeCompletion(mockContext as any, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('throws wrapped error and clears KV cache on native crash (ggml)', async () => {
    const mockContext = { clearCache: jest.fn().mockResolvedValue(undefined) };
    await expect(
      safeCompletion(mockContext as any, async () => {
        throw new Error('ggml alloc failed');
      }),
    ).rejects.toThrow('Model inference failed (native error)');
    expect(mockContext.clearCache).toHaveBeenCalledWith(true);
  });

  it('throws wrapped error even when clearCache also fails', async () => {
    const mockContext = { clearCache: jest.fn().mockRejectedValue(new Error('cache clear failed')) };
    await expect(
      safeCompletion(mockContext as any, async () => {
        throw new Error('abort detected');
      }),
    ).rejects.toThrow('Model inference failed (native error)');
  });

  it('re-throws non-native errors unchanged', async () => {
    const mockContext = { clearCache: jest.fn() };
    await expect(
      safeCompletion(mockContext as any, async () => {
        throw new Error('unknown error');
      }),
    ).rejects.toThrow('unknown error');
    expect(mockContext.clearCache).not.toHaveBeenCalled();
  });

  it('recognises OOM as native crash keyword', async () => {
    const mockContext = { clearCache: jest.fn().mockResolvedValue(undefined) };
    await expect(
      safeCompletion(mockContext as any, async () => {
        throw new Error('OOM: out of memory');
      }),
    ).rejects.toThrow('Model inference failed (native error)');
    expect(mockContext.clearCache).toHaveBeenCalled();
  });

  it('uses String(error) when thrown value has no message', async () => {
    const mockContext = { clearCache: jest.fn().mockResolvedValue(undefined) };
    await expect(
      safeCompletion(mockContext as any, async () => {
        throw 'tensor error string';
      }),
    ).rejects.toThrow('Model inference failed (native error)');
  });
});
