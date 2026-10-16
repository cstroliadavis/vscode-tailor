# PRD: VS Code Tailor & AG Grid-Style CSV Workbench (v0.2.0)

## Problem Statement

Third-party VS Code extensions (such as Rainbow CSV or spreadsheet editors) often bundle bloat,
telemetry, or unverified third-party code while missing specific workflow ergonomics. Furthermore,
real-world CSV files frequently contain typed columns—booleans, formatted numbers, dates, embedded
JSON objects, or JSONL (newline-delimited JSON) arrays—that are painful to inspect and edit in flat
text cells. The user needs a self-owned, modular VS Code extension (`vscode-tailor`) with an AG Grid
Community-style local data grid, per-file column type schemas persisted in `.vscode/settings.json`,
and a right-side Cell Inspector Drawer capable of rendering JSON/JSONL as structured property
mini-forms or formatted code.

## Proposed Solution

Enhance **`vscode-tailor`** (`v0.2.0`) with an AG Grid Community-inspired CSV Workbench and
workspace-persisted column schemas:

1. **AG Grid Community-Style Local Grid UX**:
   - **Interactive Column Headers**: Click column title to sort (`asc` / `desc`), drag column right
     borders to resize column widths, pin/freeze columns to the left edge, and configure column data
     types and formats directly from the header.
   - **Floating Filter Row**: Dedicated filter input row pinned beneath the column headers.
   - **Selection & Keyboard Navigation**: Single-click selects a cell (with focus ring and active
     row highlight) and syncs the right-side Inspector Drawer; arrow keys navigate across cells;
     double-click or `Enter` edits inline.
   - **Bottom Status Bar**: Displays total data rows, filtered data rows, selected cell coordinates,
     and active column schema info.
2. **Typed Column Schemas in `.vscode/settings.json` (`vscodeTailor.csv.schemas`)**:
   - Persists per-file settings (keyed by workspace-relative file path) including `headerRowCount`
     and per-column `CsvColumnSchema` (`dataType`, `decimals`, `dateFormat`, `pinned`, `width`).
   - **Supported Column Types**:
     - `text`: Plain text cell; soft-wrapped plain `<textarea>` in the right-side drawer.
     - `boolean`: Renders an interactive checkbox for boolean values (`true`/`false`, `yes`/`no`,
       `1`/`0`) and displays raw text for any other cell content.
     - `number`: Right-aligned tabular numbers formatted to configurable decimal places (`auto`,
       `0..6`).
     - `date`: Formatted using `Temporal` / `Intl` into `YYYY-MM-DD`, `MM/DD/YYYY`, `MMM D, YYYY`,
       or `ISO`.
     - `json`: Compact `{ JSON }` badge and preview in the grid; opens the right-side Inspector
       Drawer with toggleable **Property Mini-Form** (key-value property editor) and **Formatted
       JSON Code** views.
     - `jsonl`: Compact `[N items]` badge and preview in the grid; opens the right-side Inspector
       Drawer with collapsible **Mini-Form Object Cards** (edit properties per object, add/remove
       objects) and **Formatted JSONL Code** views.

## User Stories

1. As a developer, I want a single personal VS Code extension (`vscode-tailor`) with a modular
   feature registry, so that I can consolidate all my custom editor improvements in one trusted
   repository.
2. As a developer, I want to enable or disable any feature module via VS Code Settings or a
   `Tailor: Toggle Features` QuickPick command, so that I can turn specific behaviors on or off
   immediately.
3. As a user opening a `.csv` file, I want an AG Grid-style data grid with resizable columns,
   left-column pinning, cell selection rings, keyboard navigation, a floating filter row, and a
   bottom status bar.
4. As a user, I want to assign a data type (`text`, `boolean`, `number`, `date`, `json`, `jsonl`)
   and display format to any column and have `.vscode/settings.json` remember my configuration for
   that CSV file.
5. As a user with a `boolean` column, I want cells containing `true`/`false` (or `yes`/`no`,
   `1`/`0`) to render as interactive checkboxes while non-boolean cells display their raw text.
6. As a user with a `number` column, I want numbers right-aligned and formatted to my chosen decimal
   places while preserving their underlying numeric value when edited.
7. As a user with a `date` column, I want dates displayed in my chosen date format (`YYYY-MM-DD`,
   `MM/DD/YYYY`, `MMM D, YYYY`, or `ISO`).
8. As a user clicking a `json`, `jsonl`, or long-text cell, I want a right-side Cell Inspector
   Drawer to open automatically (or via a manual toggle button) with an editor tailored to that
   column's data type.
9. As a user inspecting a `json` or `jsonl` cell in the right-side drawer, I want to switch between
   an IDE-style **Property Mini-Form** (editing fields via form inputs or object cards) and a
   **Formatted Code Editor** with syntax highlighting, writing changes back to the CSV cell.
10. As a user inspecting a `text` cell in the right-side drawer, I want a clean, soft-wrapped
    plain-text `<textarea>` without syntax highlighting.

## Implementation Decisions

- **Closure-Based Architecture**: All modules use closure-based factory functions (`const _ = {}`
  for private state; no `class`, `this`, `new`, or `bind`).
- **Pure Typed-Column Engine (`csv-column-types.ts`)**: All boolean detection, number formatting,
  `Temporal` date formatting, JSON/JSONL parsing, mini-form mutation, and auto-drawer heuristics
  reside in a pure TypeScript module tested directly via `bun test`.
- **Workspace Settings Persistence (`csv-schema-store.ts`)**: Reads and writes
  `vscodeTailor.csv.schemas` in `.vscode/settings.json` (`ConfigurationTarget.Workspace` with
  fallback to `Global`).

## Testing Decisions

- **Typed Column Engine Boundary Tests**: Verify boolean parsing/toggling (and fallback on non-bool
  strings), number decimal formatting, date formatting across all 4 formats, JSON and JSONL parsing
  and mini-form property mutations, and auto-open drawer heuristics.
- **CSV Engine & Registry Boundary Tests**: Maintain 100% pass rate on RFC 4180 parsing, multi-row
  header sorting, view filtering, and feature registry toggling.

## Out of Scope

- External third-party grid libraries (no bundling of `ag-grid-community` npm bloat; 100% custom,
  lightweight local implementation).
- Excel binary formats (`.xlsx`).
