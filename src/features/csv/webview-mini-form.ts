import { parseJsonCell, parseJsonlCell, serializeJsonlItems } from './csv-column-types.ts';
import { createUiButton } from './webview-toolbar.ts';

/**
 * Coerces a raw string input from a mini-form field into a boolean, number, or string value.
 */
function coerceFormFieldValue(rawInput: string, originalValue: unknown): unknown {
  if (typeof originalValue === 'number') {
    const parsed = Number(rawInput);

    return Number.isNaN(parsed) ? rawInput : parsed;
  }

  return rawInput;
}

/**
 * Creates a single key-value row inside a JSON property mini-form card.
 */
function createPropertyFieldRow(params: {
  key: string;
  onDelete: () => void;
  onUpdate: (nextVal: unknown) => void;
  value: unknown;
}): HTMLDivElement {
  const row = document.createElement('div');
  const keySpan = document.createElement('span');

  row.className = 'ag-prop-row';
  Object.assign(keySpan, { className: 'ag-prop-key', textContent: params.key, title: params.key });
  row.append(
    keySpan,
    createPropertyValueInput(params.value, params.onUpdate),
    createUiButton({
      className: 'icon-btn',
      label: '×',
      onClick: params.onDelete,
      title: `Remove property "${params.key}"`,
    }),
  );

  return row;
}

/**
 * Creates a type-aware `<input>` element for a JSON property value.
 */
function createPropertyValueInput(
  value: unknown,
  onUpdate: (nextVal: unknown) => void,
): HTMLInputElement {
  const input = document.createElement('input');

  if (typeof value === 'boolean') {
    Object.assign(input, { checked: value, type: 'checkbox' });
    input.addEventListener('change', () => onUpdate(input.checked));

    return input;
  }

  Object.assign(input, {
    className: 'input-field',
    type: typeof value === 'number' ? 'number' : 'text',
    value: formatPropertyInputValue(value),
  });
  input.addEventListener('change', () => onUpdate(coerceFormFieldValue(input.value, value)));

  return input;
}

/**
 * Creates an IDE-style property sheet card for editing a `Record<string, unknown>`.
 */
function createRecordPropertyCard(
  record: Record<string, unknown>,
  cardTitle: string,
  onRecordChange: (next: Record<string, unknown>) => void,
): HTMLDivElement {
  const card = document.createElement('div');
  const header = document.createElement('strong');

  card.className = 'ag-prop-card';
  header.textContent = cardTitle;
  card.appendChild(header);

  for (const [key, value] of Object.entries(record)) {
    card.appendChild(
      createPropertyFieldRow({
        key,
        onDelete: () => {
          const copy = { ...record };

          delete copy[key];
          onRecordChange(copy);
        },
        onUpdate: (nextVal) => onRecordChange({ ...record, [key]: nextVal }),
        value,
      }),
    );
  }

  card.appendChild(
    createUiButton({
      className: 'btn',
      label: '+ Add Property',
      onClick: () => onRecordChange({ ...record, [`field_${Object.keys(record).length + 1}`]: '' }),
      title: 'Add a new property to this JSON object',
    }),
  );

  return card;
}

/**
 * Formats an unknown property value into a string for display in a text/number input.
 */
function formatPropertyInputValue(value: unknown): string {
  const safeVal = value ?? '';

  if (typeof safeVal === 'object') return JSON.stringify(safeVal);

  return String(safeVal as number | string);
}

/**
 * Creates the Mini-Form stack of collapsible cards for a `jsonl` cell, or `null` if invalid JSONL.
 *
 * @param rawCellValue - Raw CSV cell value containing newline-delimited JSON objects.
 * @param onCommit - Callback invoked with serialized JSONL when any property changes.
 * @returns Configured `HTMLDivElement` or `null` when raw JSONL has a syntax error.
 *
 * @example
 * ```ts
 * const el = createJsonlMiniFormElement('{"id":1}', onCommit);
 * ```
 */
export function createJsonlMiniFormElement(
  rawCellValue: string,
  onCommit: (nextVal: string) => void,
): HTMLDivElement | null {
  const parsed = parseJsonlCell(rawCellValue);

  if (parsed.error) return null;

  const container = document.createElement('div');
  const items = parsed.items.map((item) => ({ ...item }));

  container.className = 'ag-inspector-body';
  items.forEach((item, index) => {
    const card = createRecordPropertyCard(item, `Object #${index + 1}`, (nextRecord) => {
      onCommit(serializeJsonlItems(items.with(index, nextRecord)));
    });

    card.appendChild(
      createUiButton({
        className: 'btn',
        label: `Delete Object #${index + 1}`,
        onClick: () => onCommit(serializeJsonlItems(items.toSpliced(index, 1))),
        title: 'Remove this JSON object from the JSONL cell',
      }),
    );
    container.appendChild(card);
  });

  container.appendChild(
    createUiButton({
      className: 'btn btn-primary',
      label: '+ Add JSONL Object',
      onClick: () => onCommit(serializeJsonlItems([...items, { key: 'value' }])),
      title: 'Append a new JSON object to this JSONL cell',
    }),
  );

  return container;
}

/**
 * Creates the Mini-Form view for a single `json` cell, or `null` if invalid or non-object JSON.
 *
 * @param rawCellValue - Raw CSV cell value containing a JSON object.
 * @param onCommit - Callback invoked with serialized JSON when any property changes.
 * @returns Configured `HTMLDivElement` or `null` when raw JSON is invalid or not a plain object.
 *
 * @example
 * ```ts
 * const el = createJsonMiniFormElement('{"role":"admin"}', onCommit);
 * ```
 */
export function createJsonMiniFormElement(
  rawCellValue: string,
  onCommit: (nextVal: string) => void,
): HTMLDivElement | null {
  const parsed = parseJsonCell(rawCellValue);

  if (parsed.error || !parsed.isRecord) return null;

  const container = document.createElement('div');
  const record = { ...(parsed.data as Record<string, unknown>) };

  container.className = 'ag-inspector-body';
  container.appendChild(
    createRecordPropertyCard(record, 'JSON Object Properties', (nextRecord) => {
      onCommit(JSON.stringify(nextRecord));
    }),
  );

  return container;
}
