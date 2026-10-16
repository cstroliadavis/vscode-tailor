# Plan: VS Code Tailor & AG Grid-Style CSV Workbench (v0.2.0)

> Source PRD: [prd-vscode-tailor.md](./prd-vscode-tailor.md)

## Durable Architectural Decisions

Decisions that apply across all phases:

- **Routes / Commands / View Types**:
  - Custom Editor View Type: `vscodeTailor.csvGrid` (`priority: "default"` for `*.csv`)
  - Commands: `vscodeTailor.toggleFeatures`, `vscodeTailor.csv.switchToText`,
    `vscodeTailor.csv.switchToGrid`
- **Schema / Configuration Settings**:
  - `vscodeTailor.csv.enabled` (`boolean`, default `true`)
  - `vscodeTailor.csv.rainbowEnabled` (`boolean`, default `true`)
  - `vscodeTailor.csv.defaultHeaderRows` (`number`, default `1`)
  - `vscodeTailor.csv.schemas` (`object`, default `{}`): Map of workspace-relative CSV file paths
    to `CsvFileSchemaConfig` (`headerRowCount` and `columns` map of `CsvColumnSchema`)
- **Key Domain Models**:
  - `CsvColumnDataType`: `'text' | 'boolean' | 'number' | 'date' | 'json' | 'jsonl'`
  - `CsvColumnSchema`: `{ dataType, decimals?, dateFormat?, pinned?, width? }`
  - `CsvFileSchemaConfig`: `{ headerRowCount?: number; columns: Record<string, CsvColumnSchema> }`

---

## Phase 1: Typed Column Engine & Workspace Schema Store Tracer Bullet

**User Stories Covered**: Stories 4, 5, 6, 7

### What to Build

Implement the pure typed-column formatting/parsing engine (`src/features/csv/csv-column-types.ts`),
the `.vscode/settings.json` schema persistence adapter (`src/features/csv/csv-schema-store.ts`), and
extend the Webview-to-Extension message protocol (`src/features/csv/csv-messages.ts`) to sync and
persist per-file column schemas.

### Acceptance Criteria

- [x] `parseBooleanCell` renders checkboxes for `true`/`false`/`1`/`0`/`yes`/`no` and preserves raw
      text for other values
- [x] `formatNumberCell` and `formatDateCell` format numbers (with configurable decimals) and dates
      (`YYYY-MM-DD`, `MM/DD/YYYY`, `MMM D, YYYY`, `ISO`)
- [x] `parseJsonCell` and `parseJsonlCell` parse, validate, format, and update structured objects
- [x] `csv-schema-store.ts` reads and writes `vscodeTailor.csv.schemas` in `.vscode/settings.json`

---

## Phase 2: AG Grid-Style Table, Resizing, Pinning, Selection & Status Bar

**User Stories Covered**: Stories 3, 5, 6, 7

### What to Build

Upgrade the CSV Grid Webview (`csv-webview-html.ts`, `webview-header.ts`, `webview-dom.ts`,
`webview-toolbar.ts`) to an AG Grid Community-inspired layout featuring interactive column resize
handles, left-pinned columns, click-to-sort headers, a floating filter row, cell selection rings,
keyboard navigation, double-click inline editing, and a bottom status bar.

### Acceptance Criteria

- [x] Columns can be resized by dragging header borders, pinned to the left edge, and configured
      with a data type and format (`decimals` / `dateFormat`)
- [x] Cells render according to their column data type (checkboxes for booleans, right-aligned
      decimals for numbers, formatted dates, JSON/JSONL badges)
- [x] Single-click selects a cell and updates the bottom status bar; double-click or `Enter` edits
      inline; arrow keys move selection

---

## Phase 3: Right-Side Cell Inspector Drawer (JSON/JSONL Mini-Forms, Code & Plain Text)

**User Stories Covered**: Stories 8, 9, 10

### What to Build

Build `src/features/csv/webview-inspector.ts` providing the right-side Cell Inspector Drawer that
auto-opens when selecting a `json`, `jsonl`, or long-text cell (or via the toolbar toggle button),
supporting interactive **Property Mini-Forms** (and collapsible object cards for `jsonl`),
syntax-highlighted **Formatted Code** editing, and soft-wrapped **Plain Text** editing.

### Acceptance Criteria

- [x] Selecting a `json`, `jsonl`, or multi-line/long `text` cell auto-opens the right-side drawer
- [x] `json` and `jsonl` columns can toggle between Property Mini-Forms (editing individual keys/cards)
      and a Formatted Code view, persisting edits back to the CSV document
- [x] `text` columns render a soft-wrapped plain `<textarea>` without syntax highlighting
- [x] `bun test`, `bun lint`, `bun fmt --check`, `bun check`, and `bun run deploy` succeed (`v0.2.0`)
