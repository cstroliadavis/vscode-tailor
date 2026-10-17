import { describe, expect, test } from 'bun:test';
import { parseHttpDocument } from '../src/features/http/http-parser.ts';
import { executeAllHttpRequests, executeHttpRequest } from '../src/features/http/http-runner.ts';
import {
  listEnvironmentNames,
  parseDotenvFile,
  parseHttpClientEnvJson,
  resolveTemplateVariables,
} from '../src/features/http/http-variable-resolver.ts';

function setupEnvContext() {
  const sharedEnv = parseHttpClientEnvJson(
    JSON.stringify({
      $shared: { apiVersion: 'v1', baseUrl: 'https://shared.example.com' },
      dev: { baseUrl: 'https://dev.example.com' },
      prod: { baseUrl: 'https://prod.example.com' },
    }),
  );
  const privateEnv = parseHttpClientEnvJson(
    JSON.stringify({
      dev: { clientSecret: 'private-dev-secret' },
    }),
  );
  const dotenvVars = parseDotenvFile('export DOTENV_KEY="from-dotenv"\n# comment\nPLAIN=123');

  return { dotenvVars, privateEnv, sharedEnv };
}

describe('HTTP Variable & Secret Resolution', () => {
  test('merges $shared defaults into http-client.env.json environments and lists env names', () => {
    const { privateEnv, sharedEnv } = setupEnvContext();

    expect(listEnvironmentNames(sharedEnv, privateEnv)).toEqual(['dev', 'prod']);
    expect(sharedEnv.dev).toEqual({
      apiVersion: 'v1',
      baseUrl: 'https://dev.example.com',
    });
  });

  test('resolves variables across env json, .env, @file vars, client.global, $keychain, $secret, and dynamic built-ins', async () => {
    const { dotenvVars, privateEnv, sharedEnv } = setupEnvContext();
    const resolved = await resolveTemplateVariables(
      '{{baseUrl}}/{{apiVersion}}?dotenv={{DOTENV_KEY}}&priv={{clientSecret}}&kc={{$keychain mySvc myAcc}}&sec={{$secret apiTok}}&env={{$processEnv NODE_ENV}}&uuid={{$uuid}}',
      {
        activeEnv: 'dev',
        dotenvVariables: dotenvVars,
        fileVariables: [{ enabled: true, key: 'apiVersion', value: 'v2-override' }],
        globalVariables: {},
        httpClientEnv: sharedEnv,
        httpClientPrivateEnv: privateEnv,
        processEnv: { NODE_ENV: 'test-runner' },
        resolveKeychain: async (service, account) => `${service}:${account}:kc-val`,
        resolveSecret: async (key) => `secret-${key}`,
      },
    );

    expect(resolved).toContain('https://dev.example.com/v2-override');
    expect(resolved).toContain('dotenv=from-dotenv');
    expect(resolved).toContain('priv=private-dev-secret');
    expect(resolved).toContain('kc=mySvc:myAcc:kc-val');
    expect(resolved).toContain('sec=secret-apiTok');
    expect(resolved).toContain('env=test-runner');
    expect(resolved).toMatch(/uuid=[0-9a-f-]{36}$/);
  });
});

describe('HTTP Runner, Chaining, CookieJar & Assertions', () => {
  test('executes a batch of requests sequentially, chaining Set-Cookie and client.global variables, and evaluates # @assert and > {% ... %} tests', async () => {
    const httpText = [
      '@baseUrl = https://api.test.local',
      '',
      '### Step 1: Login',
      'POST {{baseUrl}}/login',
      'Content-Type: application/json',
      '# @assert status == 200',
      '# @assert header.Content-Type contains application/json',
      '# @assert body.$.token == tok_live_999',
      '',
      '< ./login-payload.json',
      '> {%',
      'client.test("captures auth token", () => {',
      '  client.assert(response.status === 200, "Expected 200");',
      '  client.global.set("chainedToken", response.body.token);',
      '});',
      '%}',
      '',
      '### Step 2: Purging Cache with Chained Token & Session Cookie',
      'PURGE {{baseUrl}}/cache',
      'Authorization: Bearer {{chainedToken}}',
      '# @assert status == 202',
      '# @assert body contains purged',
    ].join('\n');

    const doc = parseHttpDocument(httpText);
    const seenRequests: {
      body?: string;
      headers: Record<string, string>;
      method: string;
      url: string;
    }[] = [];

    const mockFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = init?.body ? String(init.body) : undefined;

      seenRequests.push({ body, headers, method, url });

      if (url.endsWith('/login')) {
        return new Response(JSON.stringify({ token: 'tok_live_999', user: 'chris' }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': 'sid=session_abc; Path=/; HttpOnly',
          },
          status: 200,
          statusText: 'OK',
        });
      }

      return new Response(JSON.stringify({ result: 'purged' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 202,
        statusText: 'Accepted',
      });
    };

    const snapshots = await executeAllHttpRequests(doc, {
      fetchImpl: mockFetch,
      readExternalFile: async (path) =>
        path === './login-payload.json' ? '{"user":"{{ username }}"}' : undefined,
      variableContext: {
        dotenvVariables: { username: 'chris' },
      },
    });

    expect(snapshots).toHaveLength(2);
    expect(seenRequests[0]?.body).toBe('{"user":"chris"}');
    expect(snapshots[0]?.assertionResults.every((r) => r.passed)).toBe(true);
    expect(snapshots[0]?.assertionResults).toHaveLength(4);

    expect(seenRequests[1]?.method).toBe('PURGE');
    expect(seenRequests[1]?.headers.Authorization).toBe('Bearer tok_live_999');
    expect(seenRequests[1]?.headers.Cookie).toBe('sid=session_abc');
    expect(snapshots[1]?.assertionResults.every((r) => r.passed)).toBe(true);
  });

  test('captures network errors gracefully in HttpResponseSnapshot', async () => {
    const doc = parseHttpDocument(
      'GET https://unreachable.test.local/ping\n# @assert status == 200',
    );
    const snap = await executeHttpRequest(doc.requests[0]!, {
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
      variableContext: {},
    });

    expect(snap.status).toBe(0);
    expect(snap.error).toBe('ECONNREFUSED');
    expect(snap.assertionResults[0]?.passed).toBe(false);
  });
});
