import type { LineScannerSpec, LineTokenRule } from './syntax-rules.ts';
import { SYNTAX_SCANNER_SPECS } from './syntax-rules.ts';
import type { SyntaxFormat, SyntaxToken, SyntaxTokenKind } from './syntax-types.ts';

const FALLBACK_TOKEN_REGEX = /^[^\s,:[\]{}]+|^./;
const SKIP_DELIMITERS_REGEX = /^(?:[\s,:[\]{}]+|-(?=\s|$))+/;

/**
 * Advances the cursor past an unrecognized token so line scanning always progresses.
 */
function advanceFallbackToken(lineText: string, offset: number): number {
  const match = FALLBACK_TOKEN_REGEX.exec(lineText.slice(offset));

  return offset + (match ? match[0].length : 1);
}

/**
 * Applies any matching start-of-line prefix rule (`comment`, `section`, or top-level `key`).
 */
function applyPrefixRules(ctx: LineScanContext, prefixRules: readonly LineTokenRule[]): void {
  const matched = findFirstRuleMatch(ctx.lineText, prefixRules);

  if (!matched) return;

  ctx.tokens.push(toSyntaxToken(matched, ctx.lineIndex, 0));
  ctx.offset = matched.advance;
}

/**
 * Returns the first matching `RawRuleMatch` from an ordered list of token rules.
 */
function findFirstRuleMatch(slice: string, rules: readonly LineTokenRule[]): RawRuleMatch | null {
  for (const rule of rules) {
    const matched = tryMatchRule(slice, rule);

    if (matched) return matched;
  }

  return null;
}

/**
 * Scans all tokens on a single line using the format's `LineScannerSpec`.
 */
function scanLineTokens(lineText: string, lineIndex: number, spec: LineScannerSpec): SyntaxToken[] {
  const ctx: LineScanContext = { lineIndex, lineText, offset: 0, tokens: [] };

  applyPrefixRules(ctx, spec.prefixRules);

  while (ctx.offset < ctx.lineText.length) {
    ctx.offset = skipDelimiters(ctx.lineText, ctx.offset);
    if (ctx.offset >= ctx.lineText.length) break;

    scanNextValueToken(ctx, spec.valueRules);
  }

  return ctx.tokens;
}

/**
 * Matches the next value token at `ctx.offset` or advances past an unhighlighted token.
 */
function scanNextValueToken(ctx: LineScanContext, valueRules: readonly LineTokenRule[]): void {
  const matched = findFirstRuleMatch(ctx.lineText.slice(ctx.offset), valueRules);

  if (!matched) {
    ctx.offset = advanceFallbackToken(ctx.lineText, ctx.offset);

    return;
  }

  ctx.tokens.push(toSyntaxToken(matched, ctx.lineIndex, ctx.offset));
  ctx.offset += matched.advance;
}

/**
 * Advances `offset` past whitespace, structural punctuation, or sequence dashes.
 */
function skipDelimiters(lineText: string, offset: number): number {
  const match = SKIP_DELIMITERS_REGEX.exec(lineText.slice(offset));

  return match ? offset + match[0].length : offset;
}

/**
 * Converts a relative `RawRuleMatch` into a line-positioned `SyntaxToken`.
 */
function toSyntaxToken(match: RawRuleMatch, line: number, offset: number): SyntaxToken {
  return {
    endChar: offset + match.relStart + match.length,
    kind: match.kind,
    line,
    startChar: offset + match.relStart,
  };
}

/**
 * Attempts to match a single `LineTokenRule` against the start of `slice`.
 */
function tryMatchRule(slice: string, rule: LineTokenRule): RawRuleMatch | null {
  const match = rule.pattern.exec(slice);

  if (!match) return null;

  const captured = match[1]!;
  const relStart = match[0].indexOf(captured);

  return {
    advance: match[0].length,
    kind: rule.kind,
    length: captured.length,
    relStart,
  };
}

/**
 * Groups a flat array of `SyntaxToken` items by their `SyntaxTokenKind` for batch editor decoration.
 *
 * @param tokens - Flat list of syntax tokens produced by `tokenizeSyntaxDocument`.
 * @returns A `Map` from `SyntaxTokenKind` to the tokens belonging to that category.
 *
 * @example
 * ```ts
 * const tokens = tokenizeSyntaxDocument('port = 8080', 'toml');
 * const grouped = groupSyntaxTokensByKind(tokens);
 * grouped.get('key')?.length; // => 1
 * grouped.get('number')?.length; // => 1
 * ```
 */
export function groupSyntaxTokensByKind(
  tokens: readonly SyntaxToken[],
): Map<SyntaxTokenKind, SyntaxToken[]> {
  const buckets = new Map<SyntaxTokenKind, SyntaxToken[]>();

  for (const token of tokens) {
    const list = buckets.get(token.kind) ?? [];

    list.push(token);
    buckets.set(token.kind, list);
  }

  return buckets;
}

/**
 * Tokenizes a TOML, JSON/JSONC/JSONL, or YAML document into semantic `SyntaxToken` spans.
 *
 * @param text - Full source text of the document.
 * @param format - Target configuration syntax format (`'toml'`, `'json'`, or `'yaml'`).
 * @returns Ordered list of highlighted `SyntaxToken` spans across all lines.
 *
 * @example
 * ```ts
 * const tokens = tokenizeSyntaxDocument('[tools]\nnode = "22"', 'toml');
 * tokens.map((t) => t.kind); // => ['section', 'key', 'string']
 * ```
 */
export function tokenizeSyntaxDocument(text: string, format: SyntaxFormat): SyntaxToken[] {
  const spec = SYNTAX_SCANNER_SPECS[format];
  const lines = text.split(/\r?\n/);
  const tokens: SyntaxToken[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    tokens.push(...scanLineTokens(lines[i]!, i, spec));
  }

  return tokens;
}

/**
 * Mutable per-line cursor state used while scanning tokens on a single line.
 */
interface LineScanContext {
  lineIndex: number;
  lineText: string;
  offset: number;
  tokens: SyntaxToken[];
}

/**
 * Relative match metadata returned by `tryMatchRule`.
 */
interface RawRuleMatch {
  advance: number;
  kind: SyntaxTokenKind;
  length: number;
  relStart: number;
}
