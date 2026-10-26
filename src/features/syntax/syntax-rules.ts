import type { SyntaxFormat, SyntaxTokenKind } from './syntax-types.ts';

/**
 * Ordered prefix and value token rules defining a line-level syntax scanner for a configuration format.
 */
export interface LineScannerSpec {
  /**
   * Rules tested once at the start of a line (such as comments, table headers, or top-level keys).
   */
  prefixRules: readonly LineTokenRule[];

  /**
   * Rules tested left-to-right across the remainder of a line.
   */
  valueRules: readonly LineTokenRule[];
}

/**
 * Single anchored regular expression rule mapping capture group `1` to a `SyntaxTokenKind`.
 */
export interface LineTokenRule {
  /**
   * Semantic token category emitted when `pattern` matches at the current cursor.
   */
  kind: SyntaxTokenKind;

  /**
   * Anchored (`^...`) regular expression containing at least one capture group for the token span.
   */
  pattern: RegExp;
}

const JSON_SCANNER_SPEC: LineScannerSpec = {
  prefixRules: [],
  valueRules: [
    { kind: 'comment', pattern: /^(\/\/.*)$/ },
    { kind: 'comment', pattern: /^(\/\*.*?\*\/)/ },
    { kind: 'key', pattern: /^("(?:\\.|[^"\\])*")\s*:/ },
    { kind: 'string', pattern: /^("(?:\\.|[^"\\])*")/ },
    { kind: 'boolean', pattern: /^(true|false)(?=\s|[,\]}/]|$)/ },
    { kind: 'null', pattern: /^(null)(?=\s|[,\]}/]|$)/ },
    {
      kind: 'number',
      pattern: /^(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|[,\]}/]|$)/,
    },
  ],
};

const TOML_SCANNER_SPEC: LineScannerSpec = {
  prefixRules: [
    { kind: 'comment', pattern: /^\s*(#.*)$/ },
    { kind: 'section', pattern: /^\s*(\[\[[^\]\r\n]+\]\]|\[[^[\]\r\n]+\])/ },
    {
      kind: 'key',
      pattern:
        /^\s*((?:[A-Za-z0-9_-]+|"(?:\\.|[^"\\])*"|'[^']*')(?:\s*\.\s*(?:[A-Za-z0-9_-]+|"(?:\\.|[^"\\])*"|'[^']*'))*)\s*=/,
    },
  ],
  valueRules: [
    {
      kind: 'key',
      pattern:
        /^((?:[A-Za-z0-9_-]+|"(?:\\.|[^"\\])*"|'[^']*')(?:\s*\.\s*(?:[A-Za-z0-9_-]+|"(?:\\.|[^"\\])*"|'[^']*'))*)\s*=/,
    },
    { kind: 'comment', pattern: /^(#.*)$/ },
    {
      kind: 'string',
      pattern: /^("""(?:\\.|[^\\])*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'[^']*')/,
    },
    {
      kind: 'datetime',
      pattern:
        /^(\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?=\s|[,\]}#]|$)/,
    },
    { kind: 'boolean', pattern: /^(true|false)(?=\s|[,\]}#]|$)/ },
    {
      kind: 'number',
      pattern:
        /^(0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|[+-]?(?:inf|nan)|[+-]?\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?)(?=\s|[,\]}#]|$)/,
    },
  ],
};

const YAML_SCANNER_SPEC: LineScannerSpec = {
  prefixRules: [
    { kind: 'comment', pattern: /^\s*(#.*)$/ },
    {
      kind: 'section',
      pattern: /^\s*((?:---|\.\.\.)(?=\s|$)|%(?:YAML|TAG)\b.*)$/,
    },
    {
      kind: 'key',
      pattern:
        /^\s*(?:-\s+)?((?:"(?:\\.|[^"\\])*"|'[^']*'|<<|[A-Za-z0-9_./@-][A-Za-z0-9_./ @-]*?))\s*:(?=\s|$)/,
    },
  ],
  valueRules: [
    { kind: 'comment', pattern: /^(#.*)$/ },
    {
      kind: 'key',
      pattern: /^((?:"(?:\\.|[^"\\])*"|'[^']*'|[A-Za-z0-9_./@-]+))\s*:(?=\s|$)/,
    },
    {
      kind: 'anchor',
      pattern: /^([&*][A-Za-z0-9_.-]+|!(?:![A-Za-z0-9_-]+|<[^>]+>|[A-Za-z0-9_/-]+))/,
    },
    {
      kind: 'string',
      pattern: /^("(?:\\.|[^"\\])*"|'(?:''|[^'])*')/,
    },
    {
      kind: 'datetime',
      pattern:
        /^(\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?)(?=\s|[,\]}#]|$)/,
    },
    {
      kind: 'boolean',
      pattern:
        /^(true|false|True|False|TRUE|FALSE|yes|no|Yes|No|YES|NO|on|off|On|Off|ON|OFF)(?=\s|[,\]}#]|$)/,
    },
    { kind: 'null', pattern: /^(null|Null|NULL|~)(?=\s|[,\]}#]|$)/ },
    {
      kind: 'number',
      pattern:
        /^(0x[0-9A-Fa-f]+|0o[0-7]+|[+-]?(?:\.inf|\.Inf|\.INF|\.nan|\.NaN|\.NAN)|[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s|[,\]}#]|$)/,
    },
    {
      kind: 'string',
      pattern: /^(?![|>][+-]?\d*(?:\s|$|#))([^\s,#[\]{}][^,#[\]{}]*?)(?=\s+#|\s*[,\]}]|\s*$)/,
    },
  ],
};

/**
 * Lookup table mapping each `SyntaxFormat` to its `LineScannerSpec`.
 */
export const SYNTAX_SCANNER_SPECS: Readonly<Record<SyntaxFormat, LineScannerSpec>> = {
  json: JSON_SCANNER_SPEC,
  toml: TOML_SCANNER_SPEC,
  yaml: YAML_SCANNER_SPEC,
};
