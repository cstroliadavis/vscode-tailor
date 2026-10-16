import * as vscode from 'vscode';
import type { CsvColumnSchema, CsvFileSchemaConfig } from '../../types.ts';

/**
 * Reads the saved `Record<string, CsvFileSchemaConfig | undefined>` map from settings.
 */
function readSavedSchemasMap(): Record<string, CsvFileSchemaConfig | undefined> {
  const config = vscode.workspace.getConfiguration('vscodeTailor.csv');

  return { ...config.get<Record<string, CsvFileSchemaConfig | undefined>>('schemas', {}) };
}

/**
 * Resolves the appropriate VS Code configuration target (Workspace when available, else Global).
 */
function resolveConfigTarget(): vscode.ConfigurationTarget {
  const folders = vscode.workspace.workspaceFolders;

  if (folders && folders.length > 0) return vscode.ConfigurationTarget.Workspace;

  return vscode.ConfigurationTarget.Global;
}

/**
 * Resolves a stable workspace-relative key for a CSV document URI.
 *
 * @param uri - Document URI to resolve.
 * @returns Workspace-relative path string (e.g. `'S20/bin/data/tasks.csv'`).
 *
 * @example
 * ```ts
 * const key = getDocumentSchemaKey(document.uri);
 * ```
 */
export function getDocumentSchemaKey(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, true);
}

/**
 * Reads the saved `CsvFileSchemaConfig` for a document URI from `vscodeTailor.csv.schemas`.
 *
 * @param uri - Target CSV document URI.
 * @param defaultHeaderRows - Fallback header row count when no saved schema exists.
 * @returns Saved or default `CsvFileSchemaConfig` for the document.
 *
 * @example
 * ```ts
 * const schema = readFileSchemaConfig(document.uri, 1);
 * ```
 */
export function readFileSchemaConfig(
  uri: vscode.Uri,
  defaultHeaderRows: number,
): CsvFileSchemaConfig {
  const allSchemas = readSavedSchemasMap();
  const saved = allSchemas[getDocumentSchemaKey(uri)];

  if (!saved) return { columns: {}, headerRowCount: defaultHeaderRows };

  return {
    columns: { ...saved.columns },
    headerRowCount: saved.headerRowCount ?? defaultHeaderRows,
  };
}

/**
 * Persists an updated column schema entry for a CSV document into `.vscode/settings.json`.
 *
 * @param uri - Target CSV document URI.
 * @param columnKey - Column header label or index key.
 * @param schema - Updated `CsvColumnSchema` for that column.
 *
 * @example
 * ```ts
 * await saveColumnSchemaConfig(document.uri, 'payload', { dataType: 'json' });
 * ```
 */
export async function saveColumnSchemaConfig(
  uri: vscode.Uri,
  columnKey: string,
  schema: CsvColumnSchema,
): Promise<CsvFileSchemaConfig> {
  const config = vscode.workspace.getConfiguration('vscodeTailor.csv');
  const allSchemas = readSavedSchemasMap();
  const fileKey = getDocumentSchemaKey(uri);
  const current = allSchemas[fileKey] ?? { columns: {} };
  const nextFileSchema: CsvFileSchemaConfig = {
    ...current,
    columns: {
      ...current.columns,
      [columnKey]: schema,
    },
  };

  allSchemas[fileKey] = nextFileSchema;
  await config.update('schemas', allSchemas, resolveConfigTarget());

  return nextFileSchema;
}

/**
 * Persists an updated `headerRowCount` for a CSV document into `.vscode/settings.json`.
 *
 * @param uri - Target CSV document URI.
 * @param headerRowCount - Number of top contiguous rows treated as sticky headers.
 *
 * @example
 * ```ts
 * await saveHeaderRowCountConfig(document.uri, 2);
 * ```
 */
export async function saveHeaderRowCountConfig(
  uri: vscode.Uri,
  headerRowCount: number,
): Promise<CsvFileSchemaConfig> {
  const config = vscode.workspace.getConfiguration('vscodeTailor.csv');
  const allSchemas = readSavedSchemasMap();
  const fileKey = getDocumentSchemaKey(uri);
  const current = allSchemas[fileKey] ?? { columns: {} };
  const nextFileSchema: CsvFileSchemaConfig = {
    ...current,
    columns: { ...current.columns },
    headerRowCount,
  };

  allSchemas[fileKey] = nextFileSchema;
  await config.update('schemas', allSchemas, resolveConfigTarget());

  return nextFileSchema;
}

