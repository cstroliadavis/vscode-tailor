import type { SyntaxFormat, SyntaxLanguageId, SyntaxSettings } from './syntax-types.ts';

const EXTENSION_TO_LANGUAGE_ID = new Map<string, SyntaxLanguageId>([
  ['.hcl', 'terraform'],
  ['.json', 'json'],
  ['.jsonc', 'jsonc'],
  ['.jsonl', 'jsonl'],
  ['.ndjson', 'jsonl'],
  ['.tf', 'terraform'],
  ['.tfvars', 'terraform'],
  ['.tml', 'toml'],
  ['.toml', 'toml'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
]);

const LANGUAGE_ID_ALIASES = new Map<string, SyntaxLanguageId>([
  ['hcl', 'terraform'],
  ['json', 'json'],
  ['jsonc', 'jsonc'],
  ['jsonl', 'jsonl'],
  ['ndjson', 'jsonl'],
  ['terraform', 'terraform'],
  ['tf', 'terraform'],
  ['tfvars', 'terraform'],
  ['tml', 'toml'],
  ['toml', 'toml'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
]);

const LANGUAGE_ID_TO_FORMAT = new Map<string, SyntaxFormat>([
  ['hcl', 'terraform'],
  ['json', 'json'],
  ['jsonc', 'json'],
  ['jsonl', 'json'],
  ['terraform', 'terraform'],
  ['toml', 'toml'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
]);

const UNSPECIFIED_LANGUAGE_IDS = new Set([
  '',
  'javascript',
  'language_unspecified',
  'plaintext',
  'text',
  'typescript',
  'unknown',
]);

/**
 * Normalizes user-configured `fileAssociations` into a validated lowercase lookup map.
 */
function buildAssociationLookup(
  associations: Readonly<Record<string, string>>,
): Map<string, SyntaxLanguageId> {
  const map = new Map<string, SyntaxLanguageId>();

  for (const [pattern, rawLang] of Object.entries(associations)) {
    const validLang = LANGUAGE_ID_ALIASES.get(normalizeLanguageId(rawLang));

    if (!validLang) continue;

    map.set(pattern.trim().toLowerCase(), validLang);
  }

  return map;
}

/**
 * Extracts the lowercase basename from a file path or URI string.
 */
function extractBaseName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/').toLowerCase();
  const slashIdx = normalized.lastIndexOf('/');

  return slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized;
}

/**
 * Extracts the trailing file extension (including leading dot) from a lowercase basename.
 */
function extractExtension(baseName: string): string {
  const dotIdx = baseName.lastIndexOf('.');

  return dotIdx >= 0 ? baseName.slice(dotIdx) : '';
}

/**
 * Resolves a `SyntaxFormat` from a file path or user-configured `fileAssociations`.
 */
function inferFormatFromFileName(
  fileName: string,
  associations?: Readonly<Record<string, string>>,
): SyntaxFormat | null {
  const inferredId = inferLanguageIdFromFileName(fileName, associations);

  if (!inferredId) return null;

  return LANGUAGE_ID_TO_FORMAT.get(inferredId) ?? null;
}

/**
 * Resolves a `SyntaxLanguageId` from a standard extension or user-configured `fileAssociations`.
 */
function inferLanguageIdFromFileName(
  fileName: string,
  associations?: Readonly<Record<string, string>>,
): SyntaxLanguageId | null {
  const baseName = extractBaseName(fileName);
  const extMatch = EXTENSION_TO_LANGUAGE_ID.get(extractExtension(baseName));

  if (extMatch) return extMatch;

  return matchConfiguredAssociation(baseName, associations);
}

/**
 * Matches a lowercase basename or its extension against user-configured `fileAssociations`.
 */
function matchConfiguredAssociation(
  baseName: string,
  associations?: Readonly<Record<string, string>>,
): SyntaxLanguageId | null {
  if (!associations) return null;

  const lookup = buildAssociationLookup(associations);
  const matched = [baseName, extractExtension(baseName)].map((k) => lookup.get(k)).find(Boolean);

  return matched ?? null;
}

/**
 * Normalizes an optional VS Code `languageId` string to lowercase.
 */
function normalizeLanguageId(languageId?: string): string {
  return (languageId ?? '').trim().toLowerCase();
}

/**
 * Detects the syntax format family (`'toml'`, `'json'`, `'yaml'`, or `'terraform'`) for a document.
 *
 * @param fileName - Document file path or basename.
 * @param languageId - Optional VS Code `document.languageId`.
 * @param associations - Optional user-configured filename/extension associations from settings.
 * @returns The detected `SyntaxFormat`, or `null` when the file is not TOML, JSON, YAML, or Terraform.
 *
 * @example
 * ```ts
 * detectSyntaxFormat('/repo/.mise.toml'); // => 'toml'
 * detectSyntaxFormat('/repo/infra/main.tf'); // => 'terraform'
 * detectSyntaxFormat('/repo/Cargo.lock', '', { 'Cargo.lock': 'toml' }); // => 'toml'
 * ```
 */
export function detectSyntaxFormat(
  fileName: string,
  languageId?: string,
  associations?: Readonly<Record<string, string>>,
): SyntaxFormat | null {
  const byLang = LANGUAGE_ID_TO_FORMAT.get(normalizeLanguageId(languageId));

  return byLang ?? inferFormatFromFileName(fileName, associations);
}

/**
 * Checks whether the given syntax format is enabled in `SyntaxSettings`.
 *
 * @param format - Target syntax format (`'toml'`, `'json'`, `'yaml'`, or `'terraform'`).
 * @param settings - Current per-language enablement flags.
 * @returns `true` when highlighting is enabled for `format`.
 *
 * @example
 * ```ts
 * const s = { jsonEnabled: true, terraformEnabled: true, tomlEnabled: true, yamlEnabled: false };
 * isSyntaxFormatEnabled('terraform', s); // => true
 * ```
 */
export function isSyntaxFormatEnabled(format: SyntaxFormat, settings: SyntaxSettings): boolean {
  const map: Record<SyntaxFormat, boolean> = {
    json: settings.jsonEnabled,
    terraform: settings.terraformEnabled,
    toml: settings.tomlEnabled,
    yaml: settings.yamlEnabled,
  };

  return map[format];
}

/**
 * Resolves the target VS Code language ID to assign when a document currently has an unspecified, plaintext, or misclassified language ID.
 *
 * @param fileName - Document file path or basename.
 * @param currentLanguageId - Current `document.languageId` reported by VS Code.
 * @param associations - Optional user-configured filename/extension associations from settings.
 * @returns The target `SyntaxLanguageId` if the document should be upgraded, or `null` otherwise.
 *
 * @example
 * ```ts
 * resolveTargetLanguageId('/workspace/.mise.toml', 'plaintext'); // => 'toml'
 * resolveTargetLanguageId('/workspace/infra/main.tf', 'typescript'); // => 'terraform'
 * resolveTargetLanguageId('/workspace/Cargo.lock', 'plaintext', { 'Cargo.lock': 'toml' }); // => 'toml'
 * ```
 */
export function resolveTargetLanguageId(
  fileName: string,
  currentLanguageId?: string,
  associations?: Readonly<Record<string, string>>,
): SyntaxLanguageId | null {
  if (!UNSPECIFIED_LANGUAGE_IDS.has(normalizeLanguageId(currentLanguageId))) return null;

  return inferLanguageIdFromFileName(fileName, associations);
}
