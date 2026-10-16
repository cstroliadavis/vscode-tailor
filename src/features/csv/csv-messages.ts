import type {
  CsvColumnSchema,
  CsvDocumentModel,
  CsvFileSchemaConfig,
  CsvSortDirection,
} from '../../types.ts';
import {
  editCsvCell,
  insertCsvColumn,
  insertCsvRow,
  removeCsvColumn,
  removeCsvRow,
  setCsvHeaderRowCount,
  sortCsvDataRows,
} from './csv-operations.ts';

/**
 * Applies a column insertion or removal mutation message to a `CsvDocumentModel`.
 */
function applyColumnMutation(
  model: CsvDocumentModel,
  message: Extract<CsvMutationMessage, { type: 'insertColumn' | 'removeColumn' }>,
): CsvDocumentModel {
  if (message.type === 'insertColumn') {
    return insertCsvColumn(model, message.atColIndex, message.headerLabel);
  }

  return removeCsvColumn(model, message.colIndex);
}

/**
 * Applies a header count or sort mutation message to a `CsvDocumentModel`.
 */
function applyHeaderOrSortMutation(
  model: CsvDocumentModel,
  message: Exclude<CsvMutationMessage, { type: 'editCell' }>,
): CsvDocumentModel {
  if (message.type === 'sortColumn') {
    return sortCsvDataRows(model, {
      colIndex: message.colIndex,
      direction: message.direction,
      headerRowCount: message.headerRowCount,
    });
  }

  if (message.type === 'setHeaderRowCount') {
    return setCsvHeaderRowCount(model, message.headerRowCount);
  }

  return applyStructuralMutation(model, message);
}

/**
 * Applies a row or column structural mutation message to a `CsvDocumentModel`.
 */
function applyStructuralMutation(
  model: CsvDocumentModel,
  message: Extract<
    CsvMutationMessage,
    { type: 'insertColumn' | 'insertRow' | 'removeColumn' | 'removeRow' }
  >,
): CsvDocumentModel {
  if (message.type === 'insertRow') return insertCsvRow(model, message.atRowIndex);

  if (message.type === 'removeRow') return removeCsvRow(model, message.rowIndex);

  return applyColumnMutation(model, message);
}

/**
 * Applies a webview mutation message to a `CsvDocumentModel` and returns the next model state.
 *
 * @param model - Current CSV document model.
 * @param message - Incoming mutation message from the CSV Grid Webview.
 * @returns Updated `CsvDocumentModel` reflecting the requested change.
 *
 * @example
 * ```ts
 * const next = applyWebviewMutation(model, {
 *   type: 'sortColumn',
 *   colIndex: 0,
 *   direction: 'asc',
 *   headerRowCount: 1,
 * });
 * ```
 */
export function applyWebviewMutation(
  model: CsvDocumentModel,
  message: CsvMutationMessage,
): CsvDocumentModel {
  if (message.type === 'editCell') {
    return editCsvCell(model, {
      colIndex: message.colIndex,
      rowIndex: message.rowIndex,
      value: message.value,
    });
  }

  return applyHeaderOrSortMutation(model, message);
}

/**
 * Message sent from the Extension Host to the CSV Grid Webview.
 */
export interface CsvExtensionToWebviewMessage {
  /**
   * Discriminator indicating a full model state synchronization payload.
   */
  type: 'syncDocument';

  /**
   * File basename displayed in the grid header bar.
   */
  fileName: string;

  /**
   * Per-file column schema configuration loaded from `.vscode/settings.json`.
   */
  fileSchema: CsvFileSchemaConfig;

  /**
   * Structured CSV document model to render in the grid.
   */
  model: CsvDocumentModel;
}

/**
 * Union of webview messages that mutate or reconfigure the CSV document model.
 */
export type CsvMutationMessage =
  | {
      colIndex: number;
      rowIndex: number;
      type: 'editCell';
      value: string;
    }
  | {
      atColIndex: number;
      headerLabel?: string;
      type: 'insertColumn';
    }
  | {
      atRowIndex: number;
      type: 'insertRow';
    }
  | {
      colIndex: number;
      type: 'removeColumn';
    }
  | {
      rowIndex: number;
      type: 'removeRow';
    }
  | {
      headerRowCount: number;
      type: 'setHeaderRowCount';
    }
  | {
      colIndex: number;
      direction: CsvSortDirection;
      headerRowCount: number;
      type: 'sortColumn';
    };

/**
 * Union of all messages sent from the CSV Grid Webview to the Extension Host.
 */
export type CsvWebviewToExtensionMessage =
  | CsvMutationMessage
  | {
      columnKey: string;
      schema: CsvColumnSchema;
      type: 'updateColumnSchema';
    }
  | {
      type: 'ready';
    }
  | {
      type: 'switchToText';
    };
