# Plan: VS Code Tailor & CSV Workbench Module

> Source PRD: [prd-vscode-tailor.md](./prd-vscode-tailor.md)

## Durable Architectural Decisions

Decisions that apply across all phases:

- **Routes / Commands / View Types**:
  - Custom Editor View Type: `vscodeTailor.csvGrid` (`priority: "default"` for `*.csv`)
  - Commands:
    - `vscodeTailor.toggleFeatures`: Interactive QuickPick to enable/disable Tailor feature modules
    - `vscodeTailor.csv.switchToText`: Reopens the active `.csv` file in the default VS Code Text
      Editor (`vscode.openWith` -> `'default'`)
    - `vscodeTailor.csv.switchToGrid`: Reopens the active `.csv` file in the Tailor CSV Grid Editor
      (`vscode.openWith` -> `'vscodeTailor.csvGrid'`)
- **Schema / Configuration Settings**:
  - `vscodeTailor.csv.enabled` (`boolean`, default `true`): Master toggle for the CSV Workbench
    module
  - `vscodeTailor.csv.rainbowEnabled` (`boolean`, default `true`): Toggle Rainbow CSV column
    highlighting and hover tooltips in the Text Editor
  - `vscodeTailor.csv.defaultHeaderRows` (`number`, default `1`): Default number of top contiguous
    rows treated as sticky headers in the Grid View
- **Key Domain Models**:
  - `TailorFeatureModule`: Standard plugin interface (`id`, `name`, `description`, `settingKey`,
    `activate`, `deactivate`)
  - `CsvDocumentModel`: Parsed 2D matrix of cells, line ending sequence (`\n` | `\r\n`), trailing
    newline flag, and header row count (`headerRowCount`)
  - `WebviewMessage` / `ExtensionMessage`: Typed message protocol synchronizing `TextDocument` state,
    cell edits, real column sorts, and header count updates between the Extension Host and Webview
- **Code Quality & Packaging Boundaries**:
  - 100% closure-based factory architecture (`const _ = {}`, no ES `class`, `new`, `this`, `bind`)
  - Native Bun tooling (`bun fmt`, `bun lint`, `bun check`, `bun test`) enforced via `bunfig.toml`
  - Standalone VSIX builder and local installer (`bun run deploy`) targeting `~/.vscode/extensions`

---

## Phase 1: Project Scaffolding, Tooling & Feature Registry Tracer Bullet

**User Stories Covered**: Stories 1, 2

### What to Build

Initialize `vscode-tailor` with Bun native tooling (`bunfig.toml`, custom AST lint rules,
TypeScript config), implement the closure-based `createFeatureRegistry` engine, wire up the
`vscodeTailor.toggleFeatures` QuickPick command, and verify activation/deactivation lifecycle via
unit tests.

### Acceptance Criteria

- [x] `bun fmt --check`, `bun lint`, `bun check`, and `bun test` pass with zero errors
- [x] `createFeatureRegistry` activates enabled modules, disposes disabled modules reactively on
      configuration change, and supports toggling via `vscodeTailor.toggleFeatures`

---

## Phase 2: Standalone CSV Engine & Rainbow Text View Tracer Bullet

**User Stories Covered**: Stories 4, 5

### What to Build

Build the standalone RFC 4180 CSV parser, serializer, and column token scanner (`csv-engine.ts`),
then wire the Rainbow CSV text decorator and column hover provider (`rainbow-decorator.ts`) so any
`.csv` opened in the standard VS Code Text Editor receives per-column rainbow highlighting, header
tooltips, and an Editor Title bar button to switch to the Grid View.

### Acceptance Criteria

- [x] RFC 4180 CSV parser/serializer handles quoted fields, escaped quotes, embedded newlines, and
      preserves `\n` / `\r\n` line endings
- [x] Token scanner maps every cell in a CSV document to exact line/character ranges and column
      indices
- [x] Rainbow decorator highlights columns in the Text Editor and displays column name + index on
      hover

---

## Phase 3: Interactive CSV Grid Custom Editor (Headers, Real Sort, View Filter & Editing)

**User Stories Covered**: Stories 3, 4, 6, 7, 8, 9

### What to Build

Build the `vscode.CustomTextEditorProvider` (`csv-grid-provider.ts`) and its interactive Webview UI
(`csv-webview.ts`) supporting `0..N` sticky header rows, real multi-type column sorting (persisting
sorted data rows to the underlying `TextDocument` via `WorkspaceEdit` while keeping header rows
pinned at the top), non-destructive per-column and global view filtering, inline cell editing,
row/column add/delete, and one-click switching back to the Rainbow Text View.

### Acceptance Criteria

- [x] Opening a `.csv` file opens the Interactive Grid View by default and syncs bi-directionally
      with `vscode.TextDocument`
- [x] Adjusting `Header Rows` (`0..N`) pins the top `N` rows as headers and updates column labels
- [x] Sorting a column sorts only the data rows below the `N` header rows (numeric-aware, stable)
      and writes the change to the `TextDocument` (supporting `Cmd+Z` undo)
- [x] Filtering narrows visible data rows in the grid view without mutating the underlying file
- [x] Editing cells and adding/deleting rows or columns updates the underlying `.csv` document

---

## Phase 4: VSIX Packaging, Local Deployment & `vscode-tailor` Agent Skill

**User Stories Covered**: Story 10

### What to Build

Create the automated VSIX packaging and local VS Code installation script (`scripts/deploy-vsix.ts`),
verify installation into the local VS Code instance, and create the `vscode-tailor` Agent Skill in
`~/.gemini/config/skills/vscode-tailor/SKILL.md` (logged in `~/agent-skill-updates.md`) so future
requests to improve VS Code automatically iterate on and deploy `vscode-tailor`.

### Acceptance Criteria

- [ ] `bun run deploy` builds, packages `vscode-tailor-0.1.0.vsix`, and installs it into VS Code
- [ ] `~/.gemini/config/skills/vscode-tailor/SKILL.md` documents the module architecture, coding
      standards, and automated upgrade/deploy workflow
