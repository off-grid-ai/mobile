/**
 * Unit tests for the pure pieces of MCP OAuth: PKCE/base64url, metadata header
 * parsing, token expiry logic, and the McpClient 401 refresh-and-retry path.
 */
import { base64UrlEncode, generatePkce } from '../../../pro/mcp/oauth/pkce';
import { parseResourceMetadataUrl } from '../../../pro/mcp/oauth/metadata';
import { isAccessTokenExpired } from '../../../pro/mcp/oauth/tokenStore';
import type { CryptoAdapter } from '../../../pro/mcp/oauth/adapters';
import { McpClient } from '../../../pro/mcp/mcpClient';

describe('pkce / base64url', () => {
  it('base64url-encodes bytes without padding and with url-safe chars', () => {
    // 0xFB,0xFF,0xFE -> base64 "+//+" -> base64url "-__-"
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-');
    expect(base64UrlEncode(new Uint8Array([0]))).toBe('AA');
  });

  it('derives the challenge as base64url(sha256(verifier))', async () => {
    const crypto: CryptoAdapter = {
      randomBytes: async (n) => new Uint8Array(n).fill(1),
      sha256: async () => new Uint8Array([0xfb, 0xff, 0xfe]),
    };
    const { verifier, challenge } = await generatePkce(crypto);
    expect(verifier).toBe(base64UrlEncode(new Uint8Array(32).fill(1)));
    expect(challenge).toBe('-__-');
  });
});

describe('parseResourceMetadataUrl', () => {
  it('extracts the resource_metadata URL from a WWW-Authenticate header', () => {
    const h = 'Bearer resource_metadata="https://api.x.com/.well-known/oauth-protected-resource"';
    expect(parseResourceMetadataUrl(h)).toBe('https://api.x.com/.well-known/oauth-protected-resource');
  });
  it('returns null when absent or header missing', () => {
    expect(parseResourceMetadataUrl('Bearer realm="x"')).toBeNull();
    expect(parseResourceMetadataUrl(null)).toBeNull();
  });
});

describe('isAccessTokenExpired', () => {
  const base = { accessToken: 'a', tokenType: 'Bearer' };
  it('treats a missing access token as expired', () => {
    expect(isAccessTokenExpired({ ...base, accessToken: '' })).toBe(true);
  });
  it('treats an undefined expiry as long-lived', () => {
    expect(isAccessTokenExpired({ ...base })).toBe(false);
  });
  it('expires within the skew window', () => {
    expect(isAccessTokenExpired({ ...base, expiresAt: Date.now() + 5_000 })).toBe(true);
    expect(isAccessTokenExpired({ ...base, expiresAt: Date.now() + 10 * 60_000 })).toBe(false);
  });
});

describe('McpClient 401 refresh-and-retry', () => {
  // Minimal fake XHR that returns a queued status/body per send().
  function installFakeXhr(responses: Array<{ status: number; body: any; www?: string }>) {
    const sent: any[] = [];
    class FakeXhr {
      status = 0;
      responseText = '';
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      private headers: Record<string, string> = {};
      open() {}
      setRequestHeader(k: string, v: string) { this.headers[k] = v; }
      getResponseHeader(name: string) {
        if (name === 'content-type') return 'application/json';
        if (name === 'www-authenticate') return this._www ?? null;
        if (name === 'mcp-session-id') return null;
        return null;
      }
      private _www: string | null = null;
      send(payload: string) {
        sent.push({ payload, headers: this.headers });
        const next = responses.shift()!;
        this.status = next.status;
        this.responseText = JSON.stringify(next.body);
        this._www = next.www ?? null;
        queueMicrotask(() => this.onload?.());
      }
    }
    (global as any).XMLHttpRequest = FakeXhr;
    return sent;
  }

  it('refreshes on 401 and retries once with the new header', async () => {
    const sent = installFakeXhr([
      { status: 401, body: {}, www: 'Bearer' },
      { status: 200, body: { jsonrpc: '2.0', id: 1, result: { tools: [] } } },
    ]);
    let token = 'old';
    const onUnauthorized = jest.fn(async () => { token = 'new'; return true; });
    const client = new McpClient({
      url: 'https://mcp.example.com/mcp',
      getAuthHeader: async () => ({ name: 'Authorization', value: `Bearer ${token}` }),
      onUnauthorized,
    });

    const tools = await client.listTools();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(sent[0].headers.Authorization).toBe('Bearer old');
    expect(sent[1].headers.Authorization).toBe('Bearer new');
    expect(tools).toEqual([]);
  });

  it('throws unauthorized when refresh declines to retry', async () => {
    installFakeXhr([{ status: 401, body: {}, www: 'Bearer' }]);
    const client = new McpClient({
      url: 'https://mcp.example.com/mcp',
      getAuthHeader: async () => ({ name: 'Authorization', value: 'Bearer x' }),
      onUnauthorized: async () => false,
    });
    await expect(client.listTools()).rejects.toThrow(/unauthorized/i);
  });
});
