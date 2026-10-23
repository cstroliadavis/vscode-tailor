import { describe, expect, it } from 'bun:test';
import { convertHttpText } from '../src/features/utils/utils-http-convert.ts';
import {
  smartSortText,
  toggleBase64,
  toggleHtml,
  toggleUrl,
  toUpperKebabCase,
  toUpperSnakeCase,
} from '../src/features/utils/utils-transforms.ts';

describe('Utils Text Transforms', () => {
  const setup = () =>
    Object.freeze({
      arrayInline: "['zeta', 'alpha', 'beta']",
      arrayMultiline: '[\n  "charlie",\n  "alpha",\n  "bravo",\n]',
      nestedArray: '[fn(2, 1), "b, a", alpha]',
      objectInline: '{ z: 1, a: 2, m: 3 }',
      objectMultiline: '{\n  zebra: true,\n  apple: false,\n  mango: 42,\n}',
      paramsInline: '(c: string, a: number = 1, b?: boolean)',
      plainList: 'cherry, apple, banana',
      plainRows: 'charlie\nalpha\nbravo',
    });

  it('sorts inline and multiline array literals while respecting nested commas', () => {
    const data = setup();

    expect(smartSortText(data.arrayInline)).toBe("['alpha', 'beta', 'zeta']");
    expect(smartSortText(data.arrayMultiline)).toBe('[\n  "alpha",\n  "bravo",\n  "charlie",\n]');
    expect(smartSortText(data.nestedArray)).toBe('[alpha, "b, a", fn(2, 1)]');
  });

  it('sorts inline and multiline object literals by property key', () => {
    const data = setup();

    expect(smartSortText(data.objectInline)).toBe('{ a: 2, m: 3, z: 1 }');
    expect(smartSortText(data.objectMultiline)).toBe(
      '{\n  apple: false,\n  mango: 42,\n  zebra: true,\n}',
    );
  });

  it('sorts function parameter lists, comma lists, and multiline rows', () => {
    const data = setup();

    expect(smartSortText(data.paramsInline)).toBe('(a: number = 1, b?: boolean, c: string)');
    expect(smartSortText(data.plainList)).toBe('apple, banana, cherry');
    expect(smartSortText(data.plainRows)).toBe('alpha\nbravo\ncharlie');
  });

  it('auto-detects and toggles Base64, URL, and HTML encoding/decoding', () => {
    const raw = 'hello world?foo=bar&baz=100%';
    const b64 = toggleBase64(raw);
    const url = toggleUrl(raw);

    expect(b64).toBe('aGVsbG8gd29ybGQ/Zm9vPWJhciZiYXo9MTAwJQ==');
    expect(toggleBase64(b64)).toBe(raw);
    expect(toggleBase64('test')).toBe('dGVzdA==');
    expect(toggleBase64('dGVzdA==')).toBe('test');

    expect(url).toBe('hello%20world%3Ffoo%3Dbar%26baz%3D100%25');
    expect(toggleUrl(url)).toBe(raw);

    const htmlRaw = '<div class="card">Tom & Jerry\'s</div>';
    const htmlEncoded = toggleHtml(htmlRaw);

    expect(htmlEncoded).toBe('&lt;div class=&quot;card&quot;&gt;Tom &amp; Jerry&#39;s&lt;/div&gt;');
    expect(toggleHtml(htmlEncoded)).toBe(htmlRaw);
  });

  it('converts identifiers and phrases to UPPER_SNAKE_CASE and UPPER-KEBAB-CASE', () => {
    expect(toUpperSnakeCase('camelCaseValue')).toBe('CAMEL_CASE_VALUE');
    expect(toUpperSnakeCase('parseXMLHttpRequest')).toBe('PARSE_XML_HTTP_REQUEST');
    expect(toUpperSnakeCase('already-kebab_and space')).toBe('ALREADY_KEBAB_AND_SPACE');
    expect(toUpperKebabCase('camelCaseValue')).toBe('CAMEL-CASE-VALUE');
    expect(toUpperKebabCase('parseXMLHttpRequest')).toBe('PARSE-XML-HTTP-REQUEST');
  });
});

describe('Utils HTTP Format Conversions (cURL <-> fetch <-> .http)', () => {
  const setup = () =>
    Object.freeze({
      curlInput: [
        "curl -X POST 'https://api.example.com/v1/users' \\",
        "  -H 'Content-Type: application/json' \\",
        "  -H 'Authorization: Bearer secret-token' \\",
        '  -d \'{"name":"Ada"}\'',
      ].join('\n'),
      fetchInput: [
        'fetch("https://api.example.com/v1/users", {',
        '  method: "POST",',
        '  headers: {',
        '    "Content-Type": "application/json",',
        '    "Authorization": "Bearer secret-token"',
        '  },',
        '  body: JSON.stringify({"name":"Ada"})',
        '});',
      ].join('\n'),
      httpInput: [
        'POST https://api.example.com/v1/users',
        'Content-Type: application/json',
        'Authorization: Bearer secret-token',
        '',
        '{"name":"Ada"}',
      ].join('\n'),
    });

  it('auto-detects cURL and converts to fetch() and .http', () => {
    const { curlInput } = setup();
    const asFetch = convertHttpText(curlInput, 'fetch');
    const asHttp = convertHttpText(curlInput, 'http');

    expect(asFetch).toContain("fetch('https://api.example.com/v1/users'");
    expect(asFetch).toContain("method: 'POST'");
    expect(asFetch).toContain("'Authorization': 'Bearer secret-token'");
    expect(asFetch).toContain('{"name":"Ada"}');

    expect(asHttp).toBe(
      [
        'POST https://api.example.com/v1/users',
        'Content-Type: application/json',
        'Authorization: Bearer secret-token',
        '',
        '{"name":"Ada"}',
      ].join('\n'),
    );
  });

  it('auto-detects fetch() and converts to cURL and .http', () => {
    const { fetchInput } = setup();
    const asCurl = convertHttpText(fetchInput, 'curl');
    const asHttp = convertHttpText(fetchInput, 'http');

    expect(asCurl).toContain("curl -X POST 'https://api.example.com/v1/users'");
    expect(asCurl).toContain("-H 'Content-Type: application/json'");
    expect(asCurl).toContain('-d \'{"name":"Ada"}\'');
    expect(asHttp).toContain('POST https://api.example.com/v1/users');
    expect(asHttp).toContain('Authorization: Bearer secret-token');
  });

  it('auto-detects .http format and converts to cURL and fetch()', () => {
    const { httpInput } = setup();
    const asCurl = convertHttpText(httpInput, 'curl');
    const asFetch = convertHttpText(httpInput, 'fetch');

    expect(asCurl).toContain("curl -X POST 'https://api.example.com/v1/users'");
    expect(asCurl).toContain("-H 'Authorization: Bearer secret-token'");
    expect(asFetch).toContain("fetch('https://api.example.com/v1/users'");
    expect(asFetch).toContain("method: 'POST'");
  });
});
