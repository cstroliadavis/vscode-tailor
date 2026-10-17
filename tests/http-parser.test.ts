import { describe, expect, test } from 'bun:test';
import {
  HTTP_METHOD_SUGGESTIONS,
  getKnownHeaderNames,
  getSuggestionsForHeader,
} from '../src/features/http/http-catalog.ts';
import {
  applyAuthToHeadersAndParams,
  buildUrlWithParams,
  inferAuthConfig,
  parseCookieHeader,
  parseQueryParams,
  parseSetCookieHeaders,
  serializeCookieHeader,
} from '../src/features/http/http-decomposition.ts';
import { parseHttpDocument, serializeHttpDocument } from '../src/features/http/http-parser.ts';

function setupSampleHttpFile(): string {
  return [
    '@baseUrl = https://api.example.com',
    '@apiVersion = v2',
    '',
    '### Login User',
    '# @name loginRequest',
    'POST {{baseUrl}}/{{apiVersion}}/auth/login?redirect=/dashboard&locale={{lang}} HTTP/1.1',
    'Content-Type: application/json',
    'Authorization: Bearer {{initialToken}}',
    'Cookie: session_id=abc123; theme=dark',
    '# @assert status == 200',
    '# @assert header.Content-Type contains application/json',
    '# @assert body.$.token exists',
    '',
    '{"username": "chris", "password": "{{$secret login_pwd}}"}',
    '> {%',
    'client.test("saves token", () => {',
    '  client.assert(response.status === 200, "Expected 200");',
    '  client.global.set("authToken", response.body.token);',
    '});',
    '%}',
    '',
    '### Fastly Cache Purge',
    'PURGE {{baseUrl}}/cache/items',
    'X-API-Key: {{$keychain fastly prod}}',
    '',
    '< ./payloads/purge.json',
  ].join('\n');
}

describe('HTTP Catalog & Combo-Box Suggestions', () => {
  test('includes standard REST methods and extended methods like PURGE and PROPFIND', () => {
    expect(HTTP_METHOD_SUGGESTIONS).toContain('GET');
    expect(HTTP_METHOD_SUGGESTIONS).toContain('POST');
    expect(HTTP_METHOD_SUGGESTIONS).toContain('PURGE');
    expect(HTTP_METHOD_SUGGESTIONS).toContain('PROPFIND');
  });

  test('returns known header names and case-insensitive header value presets', () => {
    const names = getKnownHeaderNames();

    expect(names).toContain('Content-Type');
    expect(names).toContain('Authorization');
    expect(getSuggestionsForHeader('content-type')).toContain('application/json');
    expect(getSuggestionsForHeader('unknown-custom-header')).toEqual([]);
  });
});

describe('HTTP Query, Cookie & Auth Decomposition', () => {
  test('parses and reconstructs query parameters while preserving unencoded {{variables}}', () => {
    const params = parseQueryParams('https://example.com/items?page={{pageNum}}&limit=25#top');

    expect(params).toEqual([
      { enabled: true, key: 'page', value: '{{pageNum}}' },
      { enabled: true, key: 'limit', value: '25' },
    ]);

    const updatedUrl = buildUrlWithParams('https://example.com/items?old=1', [
      ...params,
      { enabled: false, key: 'debug', value: 'true' },
    ]);

    expect(updatedUrl).toBe('https://example.com/items?page={{pageNum}}&limit=25');
  });

  test('parses Cookie request headers, Set-Cookie response headers, and re-serializes cookies', () => {
    const cookies = parseCookieHeader('sid=xyz987; mode=compact');

    expect(cookies).toEqual([
      { enabled: true, key: 'sid', value: 'xyz987' },
      { enabled: true, key: 'mode', value: 'compact' },
    ]);
    expect(serializeCookieHeader(cookies)).toBe('sid=xyz987; mode=compact');

    const responseCookies = parseSetCookieHeaders([
      'session=tok_111; Path=/; HttpOnly; Secure',
      'pref=dark; Max-Age=3600',
    ]);

    expect(responseCookies).toEqual([
      { enabled: true, key: 'session', value: 'tok_111' },
      { enabled: true, key: 'pref', value: 'dark' },
    ]);
  });

  test('infers and synchronizes Bearer, Basic, and API Key authentication configs', () => {
    const bearerSync = applyAuthToHeadersAndParams(
      { bearerToken: '{{myToken}}', scheme: 'bearer' },
      [],
      [],
    );

    expect(bearerSync.headers).toEqual([
      { enabled: true, key: 'Authorization', value: 'Bearer {{myToken}}' },
    ]);
    expect(inferAuthConfig(bearerSync.headers)).toEqual({
      bearerToken: '{{myToken}}',
      scheme: 'bearer',
    });

    const basicSync = applyAuthToHeadersAndParams(
      { basicPassword: 'secret', basicUsername: 'admin', scheme: 'basic' },
      bearerSync.headers,
      [],
    );

    expect(inferAuthConfig(basicSync.headers)).toEqual({
      basicPassword: 'secret',
      basicUsername: 'admin',
      scheme: 'basic',
    });

    const apiKeyQuerySync = applyAuthToHeadersAndParams(
      { apiKeyIn: 'query', apiKeyName: 'api_key', apiKeyValue: '{{key}}', scheme: 'apiKey' },
      basicSync.headers,
      [],
    );

    expect(apiKeyQuerySync.headers).toEqual([]);
    expect(apiKeyQuerySync.params).toEqual([{ enabled: true, key: 'api_key', value: '{{key}}' }]);
  });
});

describe('HTTP Document Parser & Serializer', () => {
  test('parses file variables, multiple requests, custom methods, cookies, assertions, file refs, and scripts', () => {
    const raw = setupSampleHttpFile();
    const doc = parseHttpDocument(raw);

    expect(doc.variables).toEqual([
      { enabled: true, key: 'baseUrl', value: 'https://api.example.com' },
      { enabled: true, key: 'apiVersion', value: 'v2' },
    ]);
    expect(doc.requests).toHaveLength(2);

    const first = doc.requests[0]!;

    expect(first.name).toBe('loginRequest');
    expect(first.method).toBe('POST');
    expect(first.httpVersion).toBe('HTTP/1.1');
    expect(first.params).toEqual([
      { enabled: true, key: 'redirect', value: '/dashboard' },
      { enabled: true, key: 'locale', value: '{{lang}}' },
    ]);
    expect(first.cookies).toEqual([
      { enabled: true, key: 'session_id', value: 'abc123' },
      { enabled: true, key: 'theme', value: 'dark' },
    ]);
    expect(first.assertions).toEqual([
      { expected: '200', operator: '==', target: 'status' },
      { expected: 'application/json', operator: 'contains', target: 'header.Content-Type' },
      { expected: '', operator: 'exists', target: 'body.$.token' },
    ]);
    expect(first.body).toBe('{"username": "chris", "password": "{{$secret login_pwd}}"}');
    expect(first.responseScript).toContain('client.global.set("authToken"');

    const second = doc.requests[1]!;

    expect(second.name).toBe('Fastly Cache Purge');
    expect(second.method).toBe('PURGE');
    expect(second.bodyFileRef).toBe('./payloads/purge.json');
  });

  test('round-trips a parsed HttpDocumentModel back to .http text and re-parses identically', () => {
    const doc = parseHttpDocument(setupSampleHttpFile());
    const serialized = serializeHttpDocument(doc);
    const reparsed = parseHttpDocument(serialized);

    expect(reparsed.variables).toEqual(doc.variables);
    expect(reparsed.requests).toHaveLength(2);
    expect(reparsed.requests[0]?.method).toBe('POST');
    expect(reparsed.requests[0]?.cookies).toEqual(doc.requests[0]?.cookies);
    expect(reparsed.requests[0]?.assertions).toEqual(doc.requests[0]?.assertions);
    expect(reparsed.requests[0]?.responseScript).toBe(doc.requests[0]?.responseScript);
    expect(reparsed.requests[1]?.method).toBe('PURGE');
    expect(reparsed.requests[1]?.bodyFileRef).toBe('./payloads/purge.json');
  });
});
