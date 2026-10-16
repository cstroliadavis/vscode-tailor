import type { CsvCellToken } from '../../types.ts';
import { buildColumnHeaderLabel } from './csv-operations.ts';
import { findTokenAtPosition, parseCsvDocument, scanCsvCellTokens } from './csv-parser.ts';

/**
 * High-contrast 10-color palette used for Rainbow CSV column highlighting and column badges.
 */
export const RAINBOW_COLORS = [
  '#61afef',
  '#98c379',
  '#e5c07b',
  '#c678dd',
  '#56b6c2',
  '#e06c75',
  '#d19a66',
  '#7ec699',
  '#f07178',
  '#82aaff',
] as const;

/**
 * Appends a single CSV cell token into its corresponding modulo color bucket.
 */
function appendTokenToBucket(
  buckets: Map<number, CsvCellToken[]>,
  token: CsvCellToken,
  bucketCount: number,
): void {
  const bucketIndex = token.colIndex % bucketCount;
  const list = buckets.get(bucketIndex) ?? [];

  list.push(token);
  buckets.set(bucketIndex, list);
}

/**
 * Builds markdown hover content describing the CSV column and cell at `(line, character)`.
 *
 * @param text - Full raw CSV document text.
 * @param pos - Zero-based line, character offset, and configured header row count.
 * @returns Markdown tooltip string, or `null` if no CSV token is under the cursor.
 *
 * @example
 * ```ts
 * const md = buildHoverMarkdown('name,role\nAlice,Admin', {
 *   line: 1,
 *   character: 7,
 *   headerRowCount: 1,
 * });
 * // '**Column 2: role** (Row 2)\n\nValue: `Admin`'
 * ```
 */
export function buildHoverMarkdown(
  text: string,
  pos: { character: number; headerRowCount: number; line: number },
): string | null {
  const tokens = scanCsvCellTokens(text);
  const token = findTokenAtPosition(tokens, pos.line, pos.character);

  if (!token) return null;

  const model = parseCsvDocument(text, pos.headerRowCount);
  const label = buildColumnHeaderLabel(model.rows, model.headerRowCount, token.colIndex);
  const displayValue = token.value.length > 0 ? token.value : '(empty)';

  return `**Column ${token.colIndex + 1}: ${label}** (Row ${token.rowIndex + 1})\n\nValue: \`${displayValue}\``;
}

/**
 * Groups scanned CSV cell tokens into color buckets modulo `bucketCount`.
 *
 * @param tokens - Scanned CSV cell tokens.
 * @param bucketCount - Number of distinct color buckets in the palette.
 * @returns Map from bucket index (`0..bucketCount - 1`) to matching `CsvCellToken` items.
 *
 * @example
 * ```ts
 * const buckets = groupTokensByColumnBucket(scanCsvCellTokens('a,b\n1,2'), 10);
 * // buckets.get(0)?.length === 2
 * ```
 */
export function groupTokensByColumnBucket(
  tokens: CsvCellToken[],
  bucketCount: number,
): Map<number, CsvCellToken[]> {
  const buckets = new Map<number, CsvCellToken[]>();

  if (bucketCount <= 0) return buckets;

  for (const token of tokens) {
    appendTokenToBucket(buckets, token, bucketCount);
  }

  return buckets;
}
