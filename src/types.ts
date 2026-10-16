/**
 * Line ending sequence detected in a CSV document.
 */
export type CsvLineEnding = '\n' | '\r\n';

/**
 * Sort direction for ordering CSV data rows.
 */
export type CsvSortDirection = 'asc' | 'desc';

/**
 * Specification for updating a single cell value in a CSV matrix.
 */
export interface CsvCellEditSpec {
  /**
   * Zero-based column index of the target cell.
   */
  colIndex: number;

  /**
   * Zero-based row index of the target cell.
   */
  rowIndex: number;

  /**
   * New string value to assign to the target cell.
   */
  value: string;
}

/**
 * Positional token metadata for a single CSV cell within a raw text document.
 */
export interface CsvCellToken {
  /**
   * Zero-based column index within the row.
   */
  colIndex: number;

  /**
   * Zero-based character offset where the token ends on `endLine`.
   */
  endChar: number;

  /**
   * Zero-based line number where the token ends.
   */
  endLine: number;

  /**
   * Unparsed raw slice of text (including any surrounding quotes or delimiter).
   */
  rawText: string;

  /**
   * Zero-based row index within the CSV dataset.
   */
  rowIndex: number;

  /**
   * Zero-based character offset where the token begins on `startLine`.
   */
  startChar: number;

  /**
   * Zero-based line number where the token begins.
   */
  startLine: number;

  /**
   * Unescaped logical string value of the cell.
   */
  value: string;
}

/**
 * Parsed representation of a CSV document preserving structural formatting metadata.
 */
export interface CsvDocumentModel {
  /**
   * Number of top contiguous rows designated as sticky headers.
   */
  headerRowCount: number;

  /**
   * Line ending sequence used by the source document.
   */
  lineEnding: CsvLineEnding;

  /**
   * Two-dimensional matrix of logical cell values (`[rowIndex][colIndex]`).
   */
  rows: string[][];

  /**
   * Whether the source document ended with a trailing newline sequence.
   */
  trailingNewline: boolean;
}

/**
 * Specification for non-destructively filtering visible CSV data rows in the grid view.
 */
export interface CsvFilterSpec {
  /**
   * Map of zero-based column index to case-insensitive substring filter query.
   */
  columnFilters: Record<number, string>;

  /**
   * Global case-insensitive substring query matched against any cell in a data row.
   */
  globalQuery: string;

  /**
   * Number of top contiguous rows treated as headers and excluded from filtering.
   */
  headerRowCount: number;
}

/**
 * Specification for sorting CSV data rows below the pinned header block.
 */
export interface CsvSortSpec {
  /**
   * Zero-based column index to sort by.
   */
  colIndex: number;

  /**
   * Ascending or descending sort order.
   */
  direction: CsvSortDirection;

  /**
   * Number of top contiguous header rows to keep pinned at the top of the dataset.
   */
  headerRowCount: number;
}

/**
 * Minimal disposable resource contract compatible with `vscode.Disposable`.
 */
export interface DisposableLike {
  /**
   * Releases underlying resources and event subscriptions.
   */
  dispose(): void;
}

/**
 * Abstraction over VS Code configuration reading and updating for feature modules.
 */
export interface FeatureConfigAdapter {
  /**
   * Checks whether a given configuration setting key is currently enabled.
   */
  isEnabled(settingKey: string): boolean;

  /**
   * Updates the boolean enabled state of a given configuration setting key.
   */
  setEnabled(settingKey: string, enabled: boolean): Promise<void>;
}

/**
 * Public controller interface for registering, toggling, and synchronizing feature modules.
 */
export interface FeatureRegistry {
  /**
   * Evaluates configuration for all registered modules and activates enabled ones.
   */
  activateAll(): void;

  /**
   * Deactivates all currently running feature modules and disposes their resources.
   */
  deactivateAll(): void;

  /**
   * Returns metadata and active status for all registered feature modules.
   */
  getFeatures(): FeatureStatusItem[];

  /**
   * Checks whether the feature module with the specified identifier is currently active.
   */
  isFeatureActive(id: string): boolean;

  /**
   * Registers a feature module with the registry.
   */
  register(feature: TailorFeatureModule): void;

  /**
   * Re-evaluates configuration settings and activates or deactivates modules accordingly.
   */
  syncWithConfig(): void;

  /**
   * Flips the enabled configuration state of a feature module and synchronizes its lifecycle.
   */
  toggleFeature(id: string): Promise<boolean>;
}

/**
 * Snapshot of a registered feature module and its current runtime activation state.
 */
export interface FeatureStatusItem {
  /**
   * Unique identifier of the feature module.
   */
  id: string;

  /**
   * Human-readable display name of the feature module.
   */
  name: string;

  /**
   * Current runtime activation status.
   */
  active: boolean;

  /**
   * Concise explanation of what the feature module provides.
   */
  description: string;

  /**
   * Configuration key controlling whether the module is enabled.
   */
  settingKey: string;
}

/**
 * Contract implemented by every modular feature inside `vscode-tailor`.
 */
export interface TailorFeatureModule {
  /**
   * Unique module identifier (e.g. `'csv'`).
   */
  id: string;

  /**
   * Human-readable module name shown in the toggle QuickPick.
   */
  name: string;

  /**
   * Concise summary of the module's capabilities.
   */
  description: string;

  /**
   * Full VS Code configuration key that enables or disables this module.
   */
  settingKey: string;

  /**
   * Activates the feature module and returns any disposables to clean up on deactivation.
   */
  activate(): DisposableLike[];

  /**
   * Optional custom cleanup hook invoked when the module is deactivated.
   */
  deactivate?(): void;
}

