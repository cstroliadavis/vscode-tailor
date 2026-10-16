import type { CsvColumnSchema } from '../../types.ts';
import {
  formatDateCell,
  parseBooleanCell,
  parseJsonCell,
  parseJsonlCell,
  resolveColumnSchema,
  serializeJsonlItems,
} from './csv-column-types.ts';
import { buildColumnHeaderLabel } from './csv-operations.ts';
import { createJsonlMiniFormElement, createJsonMiniFormElement } from './webview-mini-form.ts';
import type { GridViewActions, GridViewState } from './webview-toolbar.ts';
import { createUiButton } from './webview-toolbar.ts';

/**
 * Builds the JSON or JSONL Mini-Form element, returning `null` if parsing fails.
 */
function buildMiniFormElement(
  rawCellValue: string,
  isJsonl: boolean,
  onCommit: (nextVal: string) => void,
): HTMLDivElement | null {
  return isJsonl
    ? createJsonlMiniFormElement(rawCellValue, onCommit)
    : createJsonMiniFormElement(rawCellValue, onCommit);
}

/**
 * Validates and commits the contents of the code textarea back to the CSV cell.
 */
function commitCodeTextarea(
  text: string,
  isJsonl: boolean,
  onCommit: (nextVal: string) => void,
): void {
  const nextVal = isJsonl ? serializeValidatedJsonl(text) : serializeValidatedJson(text);

  onCommit(nextVal);
}

/**
 * Creates a specialized helper control for `boolean` or `date` cells at the top of the drawer.
 */
function createAuxiliaryTypeControl(
  rawCellValue: string,
  schema: CsvColumnSchema,
  onCommit: (nextVal: string) => void,
): HTMLElement | null {
  if (schema.dataType === 'boolean') return createBooleanToggleControl(rawCellValue, onCommit);

  if (schema.dataType === 'date') return createDatePickerInput(rawCellValue, onCommit);

  return null;
}

/**
 * Creates the quick boolean toggle button inside the Inspector Drawer.
 */
function createBooleanToggleControl(
  rawCellValue: string,
  onCommit: (nextVal: string) => void,
): HTMLButtonElement {
  const parsed = parseBooleanCell(rawCellValue);
  const nextVal = parsed.isBoolean ? parsed.nextValue : 'true';
  const currentLabel = rawCellValue.length > 0 ? rawCellValue : 'empty';

  return createUiButton({
    className: 'btn btn-primary',
    label: `Toggle Boolean (${currentLabel} → ${nextVal})`,
    onClick: () => onCommit(nextVal),
    title: 'Toggle boolean cell value',
  });
}

/**
 * Creates the formatted code editor view for `json` or `jsonl` columns in `'code'` mode.
 */
function createCodeInspectorBody(
  rawCellValue: string,
  isJsonl: boolean,
  onCommit: (nextVal: string) => void,
): HTMLDivElement {
  const container = document.createElement('div');
  const statusBadge = document.createElement('div');
  const textarea = document.createElement('textarea');
  const info = isJsonl ? getJsonlCodeEditorInfo(rawCellValue) : getJsonCodeEditorInfo(rawCellValue);

  container.className = 'ag-inspector-body';
  Object.assign(statusBadge, { className: 'badge', textContent: info.statusText });
  Object.assign(textarea, {
    className: 'ag-code-textarea',
    spellcheck: false,
    value: info.initialText,
  });
  container.append(
    statusBadge,
    textarea,
    createUiButton({
      className: 'btn btn-primary',
      label: 'Apply Code to Cell',
      onClick: () => commitCodeTextarea(textarea.value, isJsonl, onCommit),
      title: 'Validate and save structured data to the CSV cell',
    }),
  );

  return container;
}

/**
 * Creates a native `<input type="date">` control synced with the cell's ISO date.
 */
function createDatePickerInput(
  rawCellValue: string,
  onCommit: (nextVal: string) => void,
): HTMLInputElement {
  const input = document.createElement('input');
  const dateInfo = formatDateCell(rawCellValue, 'YYYY-MM-DD');

  Object.assign(input, {
    className: 'input-field',
    type: 'date',
    value: dateInfo.isValidDate ? dateInfo.isoDate : '',
  });
  input.addEventListener('change', () => {
    if (input.value) {
      onCommit(input.value);
    }
  });

  return input;
}

/**
 * Creates the top header bar of the right-side Cell Inspector Drawer.
 */
function createInspectorHeader(
  state: GridViewState,
  actions: GridViewActions,
  sel: { colIndex: number; rowIndex: number },
): HTMLDivElement {
  const header = document.createElement('div');
  const title = document.createElement('strong');
  const colLabel = buildColumnHeaderLabel(
    state.model.rows,
    state.model.headerRowCount,
    sel.colIndex,
  );

  header.className = 'ag-inspector-header';
  title.textContent = `Row ${sel.rowIndex + 1} · ${colLabel}`;
  header.append(
    title,
    createUiButton({
      className: 'icon-btn',
      label: '×',
      onClick: () => actions.onToggleInspector(),
      title: 'Close Inspector Drawer',
    }),
  );

  return header;
}

/**
 * Creates the sub-toolbar inside the Inspector Drawer showing column type and Form/Code mode switch.
 */
function createInspectorSubbar(
  state: GridViewState,
  actions: GridViewActions,
  schema: CsvColumnSchema,
): HTMLDivElement {
  const subbar = document.createElement('div');
  const badge = document.createElement('span');

  subbar.className = 'ag-inspector-subbar';
  Object.assign(badge, {
    className: 'badge',
    textContent: `Type: ${schema.dataType.toUpperCase()}`,
  });
  subbar.appendChild(badge);

  if (['json', 'jsonl'].includes(schema.dataType)) {
    subbar.appendChild(createModeSwitchButtons(state.inspectorMode, actions));
  }

  return subbar;
}

/**
 * Creates the `Mini-Form` and `Code` mode toggle buttons for structured JSON/JSONL columns.
 */
function createModeSwitchButtons(
  activeMode: 'code' | 'form',
  actions: GridViewActions,
): HTMLDivElement {
  const group = document.createElement('div');

  group.className = 'toolbar-group';
  group.append(
    createUiButton({
      className: activeMode === 'form' ? 'btn btn-primary' : 'btn',
      label: 'Mini-Form',
      onClick: () => actions.onSetInspectorMode('form'),
      title: 'Edit JSON fields using a structured property sheet',
    }),
    createUiButton({
      className: activeMode === 'code' ? 'btn btn-primary' : 'btn',
      label: 'Formatted Code',
      onClick: () => actions.onSetInspectorMode('code'),
      title: 'Edit formatted JSON/JSONL source text',
    }),
  );

  return group;
}

/**
 * Creates the soft-wrapped plain-text editor body for `text`, `boolean`, `number`, or `date` cells.
 */
function createPlainTextInspectorBody(
  rawCellValue: string,
  schema: CsvColumnSchema,
  onCommit: (nextVal: string) => void,
): HTMLDivElement {
  const container = document.createElement('div');
  const textarea = document.createElement('textarea');
  const auxControl = createAuxiliaryTypeControl(rawCellValue, schema, onCommit);

  container.className = 'ag-inspector-body';

  if (auxControl) {
    container.appendChild(auxControl);
  }

  Object.assign(textarea, {
    className: 'ag-plain-textarea',
    placeholder: 'Enter cell text (soft-wrapped, plain text)...',
    value: rawCellValue,
  });
  textarea.addEventListener('change', () => onCommit(textarea.value));
  container.appendChild(textarea);

  return container;
}

/**
 * Computes initial code text and validation badge status for a `json` cell.
 */
function getJsonCodeEditorInfo(rawCellValue: string): { initialText: string; statusText: string } {
  const parsed = parseJsonCell(rawCellValue);

  return {
    initialText: parsed.formatted,
    statusText: parsed.error ? `⚠ ${parsed.error}` : '✓ Valid structured syntax',
  };
}

/**
 * Computes initial code text and validation badge status for a `jsonl` cell.
 */
function getJsonlCodeEditorInfo(rawCellValue: string): { initialText: string; statusText: string } {
  const parsed = parseJsonlCell(rawCellValue);

  return {
    initialText: rawCellValue,
    statusText: parsed.error ? `⚠ ${parsed.error}` : '✓ Valid structured syntax',
  };
}

/**
 * Reads a raw cell value from the CSV row matrix, returning `''` when out of bounds.
 */
function getRawCellText(rows: string[][], rowIndex: number, colIndex: number): string {
  return rows[rowIndex]?.[colIndex] ?? '';
}

/**
 * Selects and builds the appropriate inspector body element based on `schema.dataType` and mode.
 */
function resolveInspectorBody(params: {
  mode: 'code' | 'form';
  onCommit: (nextVal: string) => void;
  rawCellValue: string;
  schema: CsvColumnSchema;
}): HTMLDivElement {
  if (params.schema.dataType === 'json') {
    return resolveStructuredBody(params.rawCellValue, false, {
      mode: params.mode,
      onCommit: params.onCommit,
    });
  }

  if (params.schema.dataType === 'jsonl') {
    return resolveStructuredBody(params.rawCellValue, true, {
      mode: params.mode,
      onCommit: params.onCommit,
    });
  }

  return createPlainTextInspectorBody(params.rawCellValue, params.schema, params.onCommit);
}

/**
 * Resolves either the Mini-Form or Formatted Code body for `json` and `jsonl` columns.
 */
function resolveStructuredBody(
  rawCellValue: string,
  isJsonl: boolean,
  spec: { mode: 'code' | 'form'; onCommit: (nextVal: string) => void },
): HTMLDivElement {
  const formEl =
    spec.mode === 'form' ? buildMiniFormElement(rawCellValue, isJsonl, spec.onCommit) : null;

  return formEl ?? createCodeInspectorBody(rawCellValue, isJsonl, spec.onCommit);
}

/**
 * Validates and serializes a JSON code string, falling back to raw text if invalid.
 */
function serializeValidatedJson(text: string): string {
  const parsed = parseJsonCell(text);

  return parsed.error ? text : JSON.stringify(parsed.data);
}

/**
 * Validates and serializes a JSONL code string, falling back to raw text if invalid.
 */
function serializeValidatedJsonl(text: string): string {
  const parsed = parseJsonlCell(text);

  return parsed.error ? text : serializeJsonlItems(parsed.items);
}

/**
 * Builds the right-side Cell Inspector Drawer DOM element when open and a cell is selected.
 *
 * @param state - Current CSV Grid view state.
 * @param actions - User interaction callbacks.
 * @returns Configured `HTMLDivElement` drawer, or `null` if closed or no cell is selected.
 *
 * @example
 * ```ts
 * const drawer = createCellInspectorDrawer(state, actions);
 * ```
 */
export function createCellInspectorDrawer(
  state: GridViewState,
  actions: GridViewActions,
): HTMLDivElement | null {
  const sel = state.selectedCell;

  if (!state.inspectorOpen || !sel) return null;

  const drawer = document.createElement('div');
  const schema = resolveColumnSchema(state.fileSchema, state.model.rows, sel.colIndex);
  const rawCellValue = getRawCellText(state.model.rows, sel.rowIndex, sel.colIndex);

  const onCommit = (nextVal: string): void => {
    actions.onEditCell(sel.rowIndex, sel.colIndex, nextVal);
  };

  drawer.className = 'ag-inspector-drawer';
  drawer.append(
    createInspectorHeader(state, actions, sel),
    createInspectorSubbar(state, actions, schema),
    resolveInspectorBody({ mode: state.inspectorMode, onCommit, rawCellValue, schema }),
  );

  return drawer;
}
