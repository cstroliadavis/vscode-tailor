import type { HttpKeyValueRow } from './http-types.ts';

/**
 * Attaches a dynamic value `<datalist>` to `valTd` and updates it when `keyInput` changes.
 */
function attachDynamicValueDatalist(
  ctx: RowRenderContext,
  keyInput: HTMLInputElement,
  valTd: HTMLTableCellElement,
): string | undefined {
  const { config, index, row } = ctx;

  if (!config.getValueSuggestions) return undefined;

  const listId = `${config.idPrefix}-val-${index}`;
  const valList = createDatalistElement(listId, config.getValueSuggestions(row.key));

  valTd.appendChild(valList);
  keyInput.addEventListener('input', () => {
    populateDatalist(valList, config.getValueSuggestions!(keyInput.value));
  });

  return listId;
}

/**
 * Creates the enabled checkbox cell `<td>` for a key/value table row.
 */
function createCheckboxCell(ctx: RowRenderContext): HTMLTableCellElement {
  const td = document.createElement('td');
  const checkbox = document.createElement('input');

  checkbox.type = 'checkbox';
  checkbox.checked = ctx.row.enabled;
  checkbox.addEventListener('change', () => {
    updateRowAt(ctx, { ...ctx.row, enabled: checkbox.checked });
  });
  td.appendChild(checkbox);

  return td;
}

/**
 * Creates the delete button cell `<td>` for a key/value table row.
 */
function createDeleteCell(ctx: RowRenderContext): HTMLTableCellElement {
  const td = document.createElement('td');
  const btn = createButton('✕', 'btn', () => {
    ctx.config.onChange(ctx.config.rows.filter((_, idx) => idx !== ctx.index));
  });

  td.appendChild(btn);

  return td;
}

/**
 * Creates the Key and Value `<input>` cells for a key/value table row.
 */
function createKeyAndValueCells(
  ctx: RowRenderContext,
): [HTMLTableCellElement, HTMLTableCellElement] {
  const keyTd = document.createElement('td');
  const valTd = document.createElement('td');
  const keyInput = createComboBoxInput(
    ctx.row.key,
    ctx.config.keyPlaceholder,
    ctx.config.keyDatalistId,
  );
  const valDatalistId = attachDynamicValueDatalist(ctx, keyInput, valTd);
  const valInput = createComboBoxInput(ctx.row.value, ctx.config.valuePlaceholder, valDatalistId);

  keyInput.addEventListener('change', () => updateRowAt(ctx, { ...ctx.row, key: keyInput.value }));
  valInput.addEventListener('change', () =>
    updateRowAt(ctx, { ...ctx.row, value: valInput.value }),
  );
  keyTd.appendChild(keyInput);
  valTd.appendChild(valInput);

  return [keyTd, valTd];
}

/**
 * Builds the `<table>` element for `renderKeyValueTable`.
 */
function createKeyValueTableElement(config: KeyValueTableConfig): HTMLTableElement {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  table.className = 'kv-table';
  thead.innerHTML =
    '<tr><th style="width:28px"></th><th>Key</th><th>Value</th><th style="width:36px"></th></tr>';
  config.rows.forEach((row, index) => {
    tbody.appendChild(renderKeyValueRowElement({ config, index, row }));
  });
  table.append(thead, tbody);

  return table;
}

/**
 * Populates `<option>` elements inside a `<datalist>` from a list of string suggestions.
 */
function populateDatalist(datalist: HTMLDataListElement, options: readonly string[]): void {
  datalist.replaceChildren(
    ...options.map((opt) => {
      const el = document.createElement('option');

      el.value = opt;

      return el;
    }),
  );
}

/**
 * Renders a single `<tr>` inside an editable key/value table with optional combo-box datalists.
 */
function renderKeyValueRowElement(ctx: RowRenderContext): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const [keyTd, valTd] = createKeyAndValueCells(ctx);

  tr.append(createCheckboxCell(ctx), keyTd, valTd, createDeleteCell(ctx));

  return tr;
}

/**
 * Replaces the row at `ctx.index` with `nextRow` and triggers `ctx.config.onChange`.
 */
function updateRowAt(ctx: RowRenderContext, nextRow: HttpKeyValueRow): void {
  const next = [...ctx.config.rows];

  next[ctx.index] = nextRow;
  ctx.config.onChange(next);
}

/**
 * Creates a styled `<button>` element with a click listener.
 *
 * @param label - Button text label.
 * @param className - CSS class names to apply.
 * @param onClick - Click event callback.
 * @returns Configured `HTMLButtonElement`.
 *
 * @example
 * ```ts
 * const btn = createButton('Run', 'btn btn-primary', () => {});
 * ```
 */
export function createButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');

  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  return btn;
}

/**
 * Creates an `<input type="text">` element optionally linked to a `<datalist>` combo-box.
 *
 * @param value - Initial text value.
 * @param placeholder - Input placeholder text.
 * @param datalistId - Optional `<datalist>` ID for combo-box dropdown suggestions.
 * @returns Configured `HTMLInputElement`.
 *
 * @example
 * ```ts
 * const input = createComboBoxInput('GET', 'Method', 'http-methods');
 * ```
 */
export function createComboBoxInput(
  value: string,
  placeholder: string,
  datalistId?: string,
): HTMLInputElement {
  const input = document.createElement('input');

  input.type = 'text';
  input.className = 'input-field mono';
  input.value = value;
  input.placeholder = placeholder;

  if (datalistId) {
    input.setAttribute('list', datalistId);
  }

  return input;
}

/**
 * Creates a `<datalist>` element populated with preset string values for combo-box inputs.
 *
 * @param id - Unique DOM id for the `<datalist>`.
 * @param suggestions - Array of preset suggestion strings.
 * @returns Configured `HTMLDataListElement`.
 *
 * @example
 * ```ts
 * const list = createDatalistElement('http-methods', ['GET', 'POST', 'PURGE']);
 * ```
 */
export function createDatalistElement(
  id: string,
  suggestions: readonly string[],
): HTMLDataListElement {
  const datalist = document.createElement('datalist');

  datalist.id = id;
  populateDatalist(datalist, suggestions);

  return datalist;
}

/**
 * Renders an editable Key/Value table (`Params`, `Headers`, `Cookies`, or `@Variables`) with an `+ Add Row` button.
 *
 * @param config - Table configuration, rows, combo-box suggestion callbacks, and change handler.
 * @returns Container `HTMLElement` holding the table and `+ Add` button.
 *
 * @example
 * ```ts
 * const el = renderKeyValueTable({ idPrefix: 'hdr', keyPlaceholder: 'Header', valuePlaceholder: 'Value', rows: [], onChange: () => {} });
 * ```
 */
export function renderKeyValueTable(config: KeyValueTableConfig): HTMLElement {
  const wrapper = document.createElement('div');

  Object.assign(wrapper.style, { display: 'flex', flexDirection: 'column', gap: '8px' });

  if (config.keySuggestions && config.keyDatalistId) {
    wrapper.appendChild(createDatalistElement(config.keyDatalistId, config.keySuggestions));
  }

  const addBtn = createButton(`+ Add ${config.keyPlaceholder}`, 'btn', () => {
    config.onChange([...config.rows, { enabled: true, key: '', value: '' }]);
  });

  addBtn.style.alignSelf = 'flex-start';
  wrapper.append(createKeyValueTableElement(config), addBtn);

  return wrapper;
}

/**
 * Configuration passed to `renderKeyValueTable`.
 */
export interface KeyValueTableConfig {
  /**
   * Optional callback returning value suggestions for a given row key (used for Header values).
   */
  getValueSuggestions?: (key: string) => readonly string[];

  /**
   * Unique prefix for generated `<datalist>` IDs.
   */
  idPrefix: string;

  /**
   * Optional `<datalist>` ID for the Key column combo-box.
   */
  keyDatalistId?: string;

  /**
   * Placeholder label for the Key column.
   */
  keyPlaceholder: string;

  /**
   * Optional preset suggestions for the Key column combo-box.
   */
  keySuggestions?: readonly string[];

  /**
   * Callback invoked whenever rows are added, edited, toggled, or deleted.
   */
  onChange: (nextRows: HttpKeyValueRow[]) => void;

  /**
   * Current key/value rows to display.
   */
  rows: HttpKeyValueRow[];

  /**
   * Placeholder label for the Value column.
   */
  valuePlaceholder: string;
}

/**
 * Internal context for rendering a single key/value table row.
 */
interface RowRenderContext {
  config: KeyValueTableConfig;
  index: number;
  row: HttpKeyValueRow;
}
