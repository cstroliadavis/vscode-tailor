/**
 * Supported configuration document families for syntax highlighting.
 */
export type SyntaxFormat = 'json' | 'toml' | 'yaml';

/**
 * Specific VS Code language identifiers managed by the syntax highlighting feature.
 */
export type SyntaxLanguageId = 'json' | 'jsonc' | 'jsonl' | 'toml' | 'yaml';

/**
 * Semantic token categories used to style TOML, JSON, and YAML documents.
 */
export type SyntaxTokenKind =
  'anchor' | 'boolean' | 'comment' | 'datetime' | 'key' | 'null' | 'number' | 'section' | 'string';

/**
 * Per-language enablement flags and custom filename associations read from `vscodeTailor.syntax` settings.
 */
export interface SyntaxSettings {
  /**
   * Optional user-configured map from filename or extension to `SyntaxLanguageId` for files without standard extensions.
   */
  fileAssociations?: Readonly<Record<string, SyntaxLanguageId>>;

  /**
   * Whether JSON, JSONC, and JSONL syntax highlighting is enabled.
   */
  jsonEnabled: boolean;

  /**
   * Whether TOML syntax highlighting is enabled.
   */
  tomlEnabled: boolean;

  /**
   * Whether YAML syntax highlighting is enabled.
   */
  yamlEnabled: boolean;
}

/**
 * Positional token metadata for a single highlighted syntax span on a document line.
 */
export interface SyntaxToken {
  /**
   * Zero-based exclusive ending character offset on `line`.
   */
  endChar: number;

  /**
   * Semantic token category determining the decoration color.
   */
  kind: SyntaxTokenKind;

  /**
   * Zero-based line number in the document.
   */
  line: number;

  /**
   * Zero-based inclusive starting character offset on `line`.
   */
  startChar: number;
}
