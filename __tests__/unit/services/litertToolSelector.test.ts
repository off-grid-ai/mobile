const mockGenerateToolSelection = jest.fn();
jest.mock('../../../src/services/litert', () => ({
  liteRTService: { generateToolSelection: (...a: unknown[]) => mockGenerateToolSelection(...a) },
}));

import { selectLiteRTTools } from '../../../src/services/litertToolSelector';

const tools = [
  { function: { name: 'notion-search', description: 'Search Notion.\nsecond line ignored' } },
  { function: { name: 'web_search', description: 'Search the web' } },
  { function: { name: 'calculator', description: undefined } },
];

describe('selectLiteRTTools', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the single tool named in the reply', async () => {
    mockGenerateToolSelection.mockResolvedValueOnce('notion-search');
    expect(await selectLiteRTTools('find my notes', tools)).toEqual(['notion-search']);
  });

  it('matches multiple names regardless of formatting/casing', async () => {
    mockGenerateToolSelection.mockResolvedValueOnce('Use: WEB_SEARCH, calculator.');
    expect(await selectLiteRTTools('weather then add', tools)).toEqual(['web_search', 'calculator']);
  });

  it('returns [] when the reply is "none"', async () => {
    mockGenerateToolSelection.mockResolvedValueOnce('none');
    expect(await selectLiteRTTools('hello', tools)).toEqual([]);
  });

  it('returns [] for empty tools or blank query without calling the model', async () => {
    expect(await selectLiteRTTools('hi', [])).toEqual([]);
    expect(await selectLiteRTTools('   ', tools)).toEqual([]);
    expect(mockGenerateToolSelection).not.toHaveBeenCalled();
  });

  it('sends a name:description catalog and truncates long descriptions', async () => {
    mockGenerateToolSelection.mockResolvedValueOnce('none');
    const longTool = [{ function: { name: 'big', description: 'x'.repeat(300) } }];
    await selectLiteRTTools('q', longTool);
    const prompt = mockGenerateToolSelection.mock.calls[0][1] as string;
    expect(prompt).toContain('big:');
    expect(prompt).not.toContain('x'.repeat(150)); // first line capped at 100 chars
  });
});
