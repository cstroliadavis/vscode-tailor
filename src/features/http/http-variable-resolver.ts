import type { HttpKeyValueRow } from './http-types.ts';

const PLACEHOLDER_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;

const ZERO_ARG_GENERATORS = new Map<string, () => string>([
  ['$isoTimestamp', () => new Date().toISOString()],
  ['$timestamp', () => String(Math.floor(Date.now() / 1000))],
  ['$uuid', () => crypto.randomUUID()],
]);

/**
 * Converts enabled file-level `HttpKeyValueRow[]` entries into a `Record<string, string>`.
 */
function buildFileVariablesMap(rows?: HttpKeyValueRow[]): Record<string, string> {
  if (!rows) return {};

  const active = rows.filter((row) => row.enabled);

  return Object.fromEntries(active.map((row) => [row.key.trim(), row.value]));
}

/**
 * Coerces an optional string value to `''`.
 */
function coalesceEmpty(value?: string): string {
  return value ?? '';
}

/**
 * Evaluates a dynamic `$`-prefixed variable expression (`$uuid`, `$timestamp`, `$randomInt`, `$keychain`, `$secret`, `$processEnv`).
 */
async function evaluateDynamicToken(
  expr: string,
  context: HttpVariableResolutionContext,
): Promise<string> {
  const parts = expr.trim().split(/\s+/);
  const command = parts[0]!;
  const zeroArgFn = ZERO_ARG_GENERATORS.get(command);

  if (zeroArgFn) return zeroArgFn();

  return evaluateParameterizedDynamicToken(command, parts.slice(1), context);
}

/**
 * Evaluates parameterized dynamic tokens (`$randomInt`, `$processEnv`, `$secret`, `$keychain`).
 */
async function evaluateParameterizedDynamicToken(
  command: string,
  args: string[],
  context: HttpVariableResolutionContext,
): Promise<string> {
  if (command === '$randomInt') return generateRandomIntString(args[0], args[1]);

  if (command === '$processEnv') return readProcessEnv(args[0], context);

  return evaluateSecretOrKeychainToken(command, args, context);
}

/**
 * Evaluates `$secret` or `$keychain` async tokens, or preserves unknown `$` expressions.
 */
async function evaluateSecretOrKeychainToken(
  command: string,
  args: string[],
  context: HttpVariableResolutionContext,
): Promise<string> {
  if (command === '$secret') return readSecretValue(args[0], context);

  if (command === '$keychain') return readKeychainValue(args[0], args[1], context);

  return `{{${[command, ...args].join(' ')}}}`;
}

/**
 * Generates a random integer string between `minArg` (default 0) and `maxArg` (default 1000).
 */
function generateRandomIntString(minArg?: string, maxArg?: string): string {
  const min = minArg !== undefined ? Number.parseInt(minArg, 10) : 0;
  const max = maxArg !== undefined ? Number.parseInt(maxArg, 10) : 1000;
  const value = Math.floor(Math.random() * (max - min + 1)) + min;

  return String(value);
}

/**
 * Checks whether `value` is wrapped in matching single or double quotes.
 */
function hasMatchingQuotes(value: string): boolean {
  return /^(?:"[\s\S]*"|'[\s\S]*')$/.test(value);
}

/**
 * Invokes the optional async keychain resolver callback and coerces `undefined` to `''`.
 */
async function invokeKeychainAdapter(
  service: string,
  account: string,
  resolveKeychain?: (s: string, a: string) => Promise<string | undefined>,
): Promise<string> {
  if (!resolveKeychain) return '';

  return coalesceEmpty(await resolveKeychain(service, account));
}

/**
 * Invokes the optional async secret storage resolver callback and coerces `undefined` to `''`.
 */
async function invokeSecretAdapter(
  key: string,
  resolveSecret?: (k: string) => Promise<string | undefined>,
): Promise<string> {
  if (!resolveSecret) return '';

  return coalesceEmpty(await resolveSecret(key));
}

/**
 * Looks up a named environment section inside an `HttpEnvironmentFileMap`.
 */
function lookupEnvMap(
  map: HttpEnvironmentFileMap | undefined,
  envName: string | undefined,
): Record<string, string> {
  if (!map || !envName) return {};

  return selectEnvRecord(map, envName);
}

/**
 * Builds a flat dictionary lookup map following precedence from lowest to highest priority.
 */
function mergeStaticVariables(context: HttpVariableResolutionContext): Map<string, string> {
  const sharedEnvVars = lookupEnvMap(context.httpClientEnv, context.activeEnv);
  const privateEnvVars = lookupEnvMap(context.httpClientPrivateEnv, context.activeEnv);
  const fileVars = buildFileVariablesMap(context.fileVariables);
  const combined: Record<string, string> = Object.assign(
    {},
    sharedEnvVars,
    privateEnvVars,
    context.dotenvVariables,
    fileVars,
    context.globalVariables,
  );

  return new Map(Object.entries(combined));
}

/**
 * Parses a single `.env` line into a `[key, value]` pair or `null` if comment/blank.
 */
function parseDotenvLine(rawLine: string): [string, string] | null {
  const trimmed = rawLine.trim();

  if (trimmed.length === 0 || trimmed.startsWith('#')) return null;

  return splitDotenvAssignment(trimmed.replace(/^export\s+/, ''));
}

/**
 * Converts a single environment dictionary of primitive values into `Record<string, string>`.
 */
function parseEnvSectionValues(rawSection: unknown): Record<string, string> {
  if (!rawSection || typeof rawSection !== 'object') return {};

  const entries = Object.entries(rawSection as Record<string, unknown>)
    .filter(([, val]) => ['string', 'number', 'boolean'].includes(typeof val))
    .map(([key, val]) => [key, String(val)] as const);

  return Object.fromEntries(entries);
}

/**
 * Resolves a macOS Keychain secret via `context.resolveKeychain`.
 */
async function readKeychainValue(
  service: string | undefined,
  account: string | undefined,
  context: HttpVariableResolutionContext,
): Promise<string> {
  if (!service || !account) return '';

  return invokeKeychainAdapter(service, account, context.resolveKeychain);
}

/**
 * Reads an OS environment variable from `context.processEnv` or `process.env`.
 */
function readProcessEnv(
  varName: string | undefined,
  context: HttpVariableResolutionContext,
): string {
  if (!varName) return '';

  const source = context.processEnv ?? process.env;

  return coalesceEmpty(source[varName]);
}

/**
 * Resolves a VS Code `SecretStorage` secret via `context.resolveSecret`.
 */
async function readSecretValue(
  key: string | undefined,
  context: HttpVariableResolutionContext,
): Promise<string> {
  if (!key) return '';

  return invokeSecretAdapter(key, context.resolveSecret);
}

/**
 * Performs a single pass replacing all `{{...}}` placeholders in `input`.
 */
async function resolvePass(
  input: string,
  staticMap: Map<string, string>,
  context: HttpVariableResolutionContext,
): Promise<string> {
  const matches = [...input.matchAll(PLACEHOLDER_REGEX)];
  let current = input;

  for (const match of matches) {
    const resolved = await resolveSingleToken(match[1]!, staticMap, context);

    current = current.replace(match[0]!, () => resolved);
  }

  return current;
}

/**
 * Resolves a single `{{...}}` token expression using `staticMap` or dynamic `$` evaluators.
 */
async function resolveSingleToken(
  tokenExpr: string,
  staticMap: Map<string, string>,
  context: HttpVariableResolutionContext,
): Promise<string> {
  const trimmed = tokenExpr.trim();

  if (trimmed.startsWith('$')) return evaluateDynamicToken(trimmed, context);

  return staticMap.get(trimmed) ?? `{{${trimmed}}}`;
}

/**
 * Selects a single named environment record from `HttpEnvironmentFileMap`.
 */
function selectEnvRecord(map: HttpEnvironmentFileMap, envName: string): Record<string, string> {
  return new Map(Object.entries(map)).get(envName) ?? {};
}

/**
 * Splits a normalized `KEY=VALUE` `.env` line into `[key, unquotedValue]` or `null`.
 */
function splitDotenvAssignment(normalized: string): [string, string] | null {
  const eqIdx = normalized.indexOf('=');

  if (eqIdx <= 0) return null;

  const key = normalized.slice(0, eqIdx).trim();
  const rawVal = normalized.slice(eqIdx + 1).trim();

  return [key, stripSurroundingQuotes(rawVal)];
}

/**
 * Strips matching single or double quotes surrounding a `.env` value.
 */
function stripSurroundingQuotes(value: string): string {
  return hasMatchingQuotes(value) ? value.slice(1, -1) : value;
}

/**
 * Collects the sorted list of environment names across `http-client.env.json` and `http-client.private.env.json`.
 *
 * @param sharedEnv - Parsed `http-client.env.json` map.
 * @param privateEnv - Parsed `http-client.private.env.json` map.
 * @returns Sorted array of unique environment names (excluding `$shared`).
 *
 * @example
 * ```ts
 * listEnvironmentNames({ dev: {}, prod: {} }, { staging: {} });
 * // ['dev', 'prod', 'staging']
 * ```
 */
export function listEnvironmentNames(
  sharedEnv: HttpEnvironmentFileMap,
  privateEnv: HttpEnvironmentFileMap = {},
): string[] {
  const names = new Set([...Object.keys(sharedEnv), ...Object.keys(privateEnv)]);

  names.delete('$shared');

  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Parses a `.env` or `.env.local` file string into a key/value dictionary.
 *
 * @param text - Raw contents of the `.env` file.
 * @returns Key/value map of parsed environment variables.
 *
 * @example
 * ```ts
 * parseDotenvFile('API_URL="https://api.example.com"\nPORT=8080');
 * // { API_URL: 'https://api.example.com', PORT: '8080' }
 * ```
 */
export function parseDotenvFile(text: string): Record<string, string> {
  const pairs = text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map(parseDotenvLine)
    .filter((pair): pair is [string, string] => pair !== null);

  return Object.fromEntries(pairs);
}

/**
 * Parses a JetBrains `http-client.env.json` or `http-client.private.env.json` string into environment maps,
 * automatically merging any `$shared` defaults into each named environment.
 *
 * @param jsonText - Raw JSON text of the environment file.
 * @returns Environment map keyed by environment name (`dev`, `staging`, `prod`, etc.).
 *
 * @example
 * ```ts
 * parseHttpClientEnvJson('{"$shared":{"port":443},"dev":{"host":"localhost"}}');
 * // { dev: { port: '443', host: 'localhost' } }
 * ```
 */
export function parseHttpClientEnvJson(jsonText: string): HttpEnvironmentFileMap {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const sharedDefaults = parseEnvSectionValues(parsed.$shared);
    const entries = Object.entries(parsed)
      .filter(([envName]) => envName !== '$shared')
      .map(([envName, section]) => [
        envName,
        { ...sharedDefaults, ...parseEnvSectionValues(section) },
      ]);

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/**
 * Resolves all `{{...}}` placeholders in `template` across static, environment, keychain, and secret sources.
 *
 * @param template - Input string containing zero or more `{{...}}` placeholders.
 * @param context - Resolution context containing environment dictionaries and secret adapters.
 * @returns Resolved string with placeholders substituted.
 *
 * @example
 * ```ts
 * await resolveTemplateVariables('GET {{baseUrl}}/items', { fileVariables: [{ enabled: true, key: 'baseUrl', value: 'https://example.com' }] });
 * // 'GET https://example.com/items'
 * ```
 */
export async function resolveTemplateVariables(
  template: string,
  context: HttpVariableResolutionContext,
): Promise<string> {
  const staticMap = mergeStaticVariables(context);
  const firstPass = await resolvePass(template, staticMap, context);

  return resolvePass(firstPass, staticMap, context);
}

/**
 * Map from environment name (`dev`, `prod`, etc.) to variable dictionary.
 */
export type HttpEnvironmentFileMap = Record<string, Record<string, string>>;

/**
 * Context passed to `resolveTemplateVariables` for resolving placeholders and secrets.
 */
export interface HttpVariableResolutionContext {
  /**
   * Currently selected environment name (e.g. `'dev'`, `'prod'`).
   */
  activeEnv?: string;

  /**
   * Variables loaded from workspace `.env` / `.env.local` files.
   */
  dotenvVariables?: Record<string, string>;

  /**
   * File-level `@variable = value` rows declared inside the `.http` document.
   */
  fileVariables?: HttpKeyValueRow[];

  /**
   * Runtime variables mutated by `client.global.set(key, val)` in response scripts.
   */
  globalVariables?: Record<string, string>;

  /**
   * Environments loaded from `http-client.env.json`.
   */
  httpClientEnv?: HttpEnvironmentFileMap;

  /**
   * Environments loaded from `http-client.private.env.json`.
   */
  httpClientPrivateEnv?: HttpEnvironmentFileMap;

  /**
   * Optional override for `process.env` in unit tests.
   */
  processEnv?: Record<string, string | undefined>;

  /**
   * Async adapter resolving `{{$keychain service account}}` from the OS keychain.
   */
  resolveKeychain?: (service: string, account: string) => Promise<string | undefined>;

  /**
   * Async adapter resolving `{{$secret key}}` from VS Code `SecretStorage`.
   */
  resolveSecret?: (key: string) => Promise<string | undefined>;
}
