import vm from 'node:vm';
import type {
  HttpAssertionOperator,
  HttpAssertionResult,
  HttpAssertionRule,
  HttpKeyValueRow,
  HttpResponseSnapshot,
} from './http-types.ts';

const OPERATOR_EVALUATORS = new Map<
  HttpAssertionOperator,
  (actual: string | undefined, expected: string) => boolean
>([
  ['!=', (actual, expected) => (actual ?? '') !== expected],
  ['<', (actual, expected) => Number(actual) < Number(expected)],
  ['==', (actual, expected) => (actual ?? '') === expected],
  ['>', (actual, expected) => Number(actual) > Number(expected)],
  ['contains', (actual, expected) => (actual ?? '').includes(expected)],
  ['exists', (actual) => actual !== undefined && actual !== 'undefined' && actual !== 'null'],
  ['matches', (actual, expected) => safeRegexTest(expected, actual ?? '')],
]);

/**
 * Builds the `client` and `response` sandbox context objects for `> {% ... %}` response scripts.
 */
function createScriptSandbox(
  response: HttpResponseSnapshot,
  globalVariables: Record<string, string>,
  results: HttpAssertionResult[],
): vm.Context {
  const parsedBody = tryParseJsonBody(response.body);
  const client = {
    assert(condition: boolean, message = 'Assertion failed') {
      if (condition) return;

      throw new Error(message);
    },
    global: {
      clear(key: string) {
        Reflect.deleteProperty(globalVariables, key);
      },
      get(key: string) {
        return globalVariables[key];
      },
      set(key: string, value: unknown) {
        globalVariables[key] = String(value);
      },
    },
    test(name: string, fn: () => void) {
      runSingleClientTest(name, fn, results);
    },
  };

  const responseObj = {
    body: parsedBody,
    headers: {
      valueOf(headerName: string) {
        return findHeaderValue(response.headers, headerName);
      },
    },
    status: response.status,
  };

  return vm.createContext({ client, console, response: responseObj });
}

/**
 * Evaluates an operator against `actual` and `expected`.
 */
function evaluateOperator(
  operator: HttpAssertionOperator,
  actual: string | undefined,
  expected: string,
): boolean {
  const evaluator = OPERATOR_EVALUATORS.get(operator);

  return evaluator ? evaluator(actual, expected) : false;
}

/**
 * Evaluates a single declarative `HttpAssertionRule` against an `HttpResponseSnapshot`.
 */
function evaluateSingleRule(
  rule: HttpAssertionRule,
  response: HttpResponseSnapshot,
): HttpAssertionResult {
  const actual = extractTargetValue(rule.target, response);
  const passed = evaluateOperator(rule.operator, actual, rule.expected);
  const expectedDesc = formatExpectedDescription(rule);

  return {
    actual: actual ?? 'undefined',
    expected: expectedDesc,
    label: `${rule.target} ${expectedDesc}`.trim(),
    passed,
    source: 'declarative',
  };
}

/**
 * Extracts either `header.<Name>`, `body.$.<path>`, or raw `body` from `response`.
 */
function extractHeaderOrBodyTarget(
  target: string,
  response: HttpResponseSnapshot,
): string | undefined {
  if (target.toLowerCase().startsWith('header.')) {
    return findHeaderValue(response.headers, target.slice(7));
  }

  return target.startsWith('body.$')
    ? extractJsonPathValue(response.body, target.slice(5))
    : response.body;
}

/**
 * Resolves a dot/bracket JSON path (`$.data.items[0].id`) against a parsed JSON value.
 */
function extractJsonPathValue(bodyText: string, pathExpr: string): string | undefined {
  const root = tryParseJsonObject(bodyText);

  if (root === undefined) return undefined;

  const segments = pathExpr
    .replace(/^\$\.?/, '')
    .split(/\.|\[|\]/)
    .filter((s) => s.length > 0);

  return traverseSegments(root, segments);
}

/**
 * Extracts the string value targeted by a declarative `# @assert <target>` rule.
 */
function extractTargetValue(target: string, response: HttpResponseSnapshot): string | undefined {
  if (target === 'status') return String(response.status);

  if (target === 'duration') return String(response.durationMs);

  return extractHeaderOrBodyTarget(target, response);
}

/**
 * Finds a response header value case-insensitively.
 */
function findHeaderValue(headers: HttpKeyValueRow[], name: string): string | undefined {
  const lower = name.trim().toLowerCase();
  const match = headers.find((h) => h.key.trim().toLowerCase() === lower);

  return match?.value;
}

/**
 * Formats an error value into a concise message string.
 */
function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Formats the expected description string for an assertion rule.
 */
function formatExpectedDescription(rule: HttpAssertionRule): string {
  return rule.operator === 'exists' ? 'exists' : `${rule.operator} ${rule.expected}`;
}

/**
 * Formats an extracted JSON node value into a scalar string for assertion comparison.
 */
function formatExtractedJsonNode(current: unknown): string | undefined {
  if (current === undefined || current === null) return undefined;

  return stringifyJsonNode(current);
}

/**
 * Executes a single `client.test(name, fn)` callback and appends the pass/fail result.
 */
function runSingleClientTest(name: string, fn: () => void, results: HttpAssertionResult[]): void {
  try {
    fn();
    results.push({
      actual: 'passed',
      expected: 'passed',
      label: name,
      passed: true,
      source: 'script',
    });
  } catch (err) {
    const msg = formatErrorMessage(err);

    results.push({
      actual: msg,
      expected: 'passed',
      label: name,
      message: msg,
      passed: false,
      source: 'script',
    });
  }
}

/**
 * Safely tests a regular expression pattern against `input`, returning `false` on invalid syntax.
 */
function safeRegexTest(pattern: string, input: string): boolean {
  try {
    return new RegExp(pattern).test(input);
  } catch {
    return false;
  }
}

/**
 * Steps into a child property or array index on `current`.
 */
function stepIntoProperty(current: unknown, segment: string): unknown {
  if (!current || typeof current !== 'object') return undefined;

  return (current as Record<string, unknown>)[segment];
}

/**
 * Converts a non-null JSON value into a string or JSON string.
 */
function stringifyJsonNode(current: unknown): string {
  return typeof current === 'object' ? JSON.stringify(current) : String(current);
}

/**
 * Traverses an array of property/index segments through `root`.
 */
function traverseSegments(root: unknown, segments: string[]): string | undefined {
  let current: unknown = root;

  for (const segment of segments) {
    current = stepIntoProperty(current, segment);
  }

  return formatExtractedJsonNode(current);
}

/**
 * Parses `bodyText` as JSON if valid, otherwise returns the raw string for `response.body`.
 */
function tryParseJsonBody(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

/**
 * Parses `bodyText` as JSON, returning `undefined` on parse failure.
 */
function tryParseJsonObject(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return undefined;
  }
}

/**
 * Evaluates all declarative `# @assert` rules for an HTTP response.
 *
 * @param rules - Declarative assertion rules attached to the request block.
 * @param response - Executed HTTP response snapshot.
 * @returns Array of `HttpAssertionResult` items.
 *
 * @example
 * ```ts
 * const res = evaluateDeclarativeAssertions([{ target: 'status', operator: '==', expected: '200' }], snapshot);
 * ```
 */
export function evaluateDeclarativeAssertions(
  rules: HttpAssertionRule[],
  response: HttpResponseSnapshot,
): HttpAssertionResult[] {
  return rules.map((rule) => evaluateSingleRule(rule, response));
}

/**
 * Executes a JetBrains-style `> {% ... %}` response handler script against `response`,
 * recording `client.test(...)` results and mutating `globalVariables` via `client.global.set(...)`.
 *
 * @param script - JavaScript code inside `> {% ... %}`.
 * @param response - Executed HTTP response snapshot.
 * @param globalVariables - Mutable global variable store shared across sequential requests.
 * @returns Array of `HttpAssertionResult` items produced by the script.
 *
 * @example
 * ```ts
 * const results = executeResponseHandlerScript('client.test("ok", () => client.assert(response.status === 200));', snap, globals);
 * ```
 */
export function executeResponseHandlerScript(
  script: string,
  response: HttpResponseSnapshot,
  globalVariables: Record<string, string>,
): HttpAssertionResult[] {
  const trimmed = script.trim();

  if (trimmed.length === 0) return [];

  const results: HttpAssertionResult[] = [];
  const context = createScriptSandbox(response, globalVariables, results);

  try {
    vm.runInContext(trimmed, context, { timeout: 2000 });
  } catch (err) {
    const msg = formatErrorMessage(err);

    results.push({
      actual: msg,
      expected: 'script execution without uncaught error',
      label: 'Response Script',
      message: msg,
      passed: false,
      source: 'script',
    });
  }

  return results;
}
