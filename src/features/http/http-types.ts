/**
 * Supported authentication scheme types in the HTTP Workbench Auth tab.
 */
export type HttpAuthScheme = 'apiKey' | 'basic' | 'bearer' | 'none';

/**
 * Location where an API key is attached to the request.
 */
export type HttpApiKeyLocation = 'header' | 'query';

/**
 * Comparison operators supported by declarative `# @assert` rules.
 */
export type HttpAssertionOperator = '!=' | '<' | '==' | '>' | 'contains' | 'exists' | 'matches';

/**
 * Specification for a single declarative `# @assert` rule on an HTTP request.
 */
export interface HttpAssertionRule {
  /**
   * Expected value string (unused when `operator === 'exists'`).
   */
  expected: string;

  /**
   * Comparison operator applied to the extracted actual value.
   */
  operator: HttpAssertionOperator;

  /**
   * Target expression such as `'status'`, `'duration'`, `'body'`, `'body.$.id'`, or `'header.Content-Type'`.
   */
  target: string;
}

/**
 * Evaluated pass/fail outcome for a single declarative assertion or `client.test` script block.
 */
export interface HttpAssertionResult {
  /**
   * Actual value observed in the HTTP response.
   */
  actual: string;

  /**
   * Expected description or value.
   */
  expected: string;

  /**
   * Human-readable label for the assertion or test case.
   */
  label: string;

  /**
   * Optional error or failure explanation.
   */
  message?: string;

  /**
   * Whether the assertion passed.
   */
  passed: boolean;

  /**
   * Source of the assertion (`'declarative'` for `# @assert` or `'script'` for `> {% ... %}`).
   */
  source: 'declarative' | 'script';
}

/**
 * Structured authentication configuration synchronized with headers or query parameters.
 */
export interface HttpAuthConfig {
  /**
   * Location where the API key is sent (`'header'` or `'query'`).
   */
  apiKeyIn?: HttpApiKeyLocation;

  /**
   * Header name or query parameter key for `scheme === 'apiKey'`.
   */
  apiKeyName?: string;

  /**
   * API key secret or placeholder token.
   */
  apiKeyValue?: string;

  /**
   * Password for `scheme === 'basic'`.
   */
  basicPassword?: string;

  /**
   * Username for `scheme === 'basic'`.
   */
  basicUsername?: string;

  /**
   * Bearer token string or `{{variable}}` placeholder for `scheme === 'bearer'`.
   */
  bearerToken?: string;

  /**
   * Active authentication scheme.
   */
  scheme: HttpAuthScheme;
}

/**
 * Parsed representation of a `.http` or `.rest` document.
 */
export interface HttpDocumentModel {
  /**
   * Ordered request blocks contained in the document.
   */
  requests: HttpRequestBlock[];

  /**
   * File-level `@variable = value` definitions declared in the document.
   */
  variables: HttpKeyValueRow[];
}

/**
 * Single editable key/value row used across Params, Headers, Cookies, and Variables tables.
 */
export interface HttpKeyValueRow {
  /**
   * Whether the row is active and included when serializing/sending.
   */
  enabled: boolean;

  /**
   * Parameter, header, cookie, or variable name.
   */
  key: string;

  /**
   * Parameter, header, cookie, or variable value.
   */
  value: string;
}

/**
 * Parsed and decomposed representation of a single HTTP request block within a `.http` file.
 */
export interface HttpRequestBlock {
  /**
   * Unique identifier for the request block within the document (`req-0`, `req-1`, ...).
   */
  id: string;

  /**
   * Display name extracted from `# @name <name>` or `### <title>`, or fallback summary.
   */
  name: string;

  /**
   * Declarative `# @assert` rules attached to this request.
   */
  assertions: HttpAssertionRule[];

  /**
   * Inferred or explicitly configured Auth settings for the GUI Auth tab.
   */
  auth: HttpAuthConfig;

  /**
   * Raw request body text (excluding external file reference if `bodyFileRef` is set).
   */
  body: string;

  /**
   * Optional relative or absolute file path referenced via `< ./path/to/file.json`.
   */
  bodyFileRef?: string;

  /**
   * Decomposed key/value pairs from the `Cookie` request header.
   */
  cookies: HttpKeyValueRow[];

  /**
   * Zero-based ending line number of this request block in the source `.http` file.
   */
  endLine: number;

  /**
   * HTTP request headers (excluding `Cookie`, which is synced from `cookies`).
   */
  headers: HttpKeyValueRow[];

  /**
   * Optional HTTP version string such as `'HTTP/1.1'` or `'HTTP/2'`.
   */
  httpVersion?: string;

  /**
   * HTTP method verb (e.g. `'GET'`, `'POST'`, `'PURGE'`, or custom verb).
   */
  method: string;

  /**
   * Decomposed query string parameters from `url`.
   */
  params: HttpKeyValueRow[];

  /**
   * Leading non-directive comments preserved above the request line.
   */
  preComments: string[];

  /**
   * Zero-based line number of the `METHOD URL` line in the source `.http` file.
   */
  requestLine: number;

  /**
   * Inline JetBrains-style `> {% ... %}` response handler JavaScript code.
   */
  responseScript: string;

  /**
   * Zero-based starting line number of this request block in the source `.http` file.
   */
  startLine: number;

  /**
   * Full request URL including query string parameters and `{{variable}}` placeholders.
   */
  url: string;
}

/**
 * Complete snapshot of an executed HTTP request and its evaluated assertions.
 */
export interface HttpResponseSnapshot {
  /**
   * Evaluated declarative `# @assert` and script `client.test` results.
   */
  assertionResults: HttpAssertionResult[];

  /**
   * Response body text (decoded UTF-8).
   */
  body: string;

  /**
   * Parsed `Set-Cookie` entries returned by the server.
   */
  cookies: HttpKeyValueRow[];

  /**
   * Round-trip execution time in milliseconds.
   */
  durationMs: number;

  /**
   * Error message if network resolution or request execution failed before receiving a status.
   */
  error?: string;

  /**
   * Response headers as key/value rows.
   */
  headers: HttpKeyValueRow[];

  /**
   * Identifier of the `HttpRequestBlock` that produced this response.
   */
  requestId: string;

  /**
   * Display name of the executed request.
   */
  requestName: string;

  /**
   * Final resolved HTTP method sent over the wire.
   */
  resolvedMethod: string;

  /**
   * Final resolved URL after `{{variable}}` interpolation.
   */
  resolvedUrl: string;

  /**
   * Payload size in bytes.
   */
  sizeBytes: number;

  /**
   * Numeric HTTP status code (`0` if network error occurred).
   */
  status: number;

  /**
   * HTTP status text (e.g. `'OK'`, `'Not Found'`).
   */
  statusText: string;

  /**
   * ISO-8601 timestamp when the request completed.
   */
  timestamp: string;
}

/**
 * Message sent from the Extension Host to the HTTP Workbench Webview.
 */
export type HttpExtensionToWebviewMessage =
  | {
      activeEnv: string;
      availableEnvs: string[];
      cookieJar: HttpKeyValueRow[];
      fileName: string;
      model: HttpDocumentModel;
      type: 'syncDocument';
    }
  | {
      cookieJar: HttpKeyValueRow[];
      results: HttpResponseSnapshot[];
      selectedRequestId?: string;
      type: 'executionResults';
    }
  | {
      isRunning: boolean;
      targetId: string;
      type: 'executionState';
    };

/**
 * Message sent from the HTTP Workbench Webview to the Extension Host.
 */
export type HttpWebviewToExtensionMessage =
  | { type: 'clearCookieJar' }
  | { type: 'ready' }
  | { type: 'runAllRequests' }
  | { requestId: string; type: 'runRequest' }
  | { envName: string; type: 'selectEnvironment' }
  | { type: 'switchToText' }
  | { model: HttpDocumentModel; type: 'updateDocument' };
