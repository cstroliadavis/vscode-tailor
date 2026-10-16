# PRD: VS Code Tailor & CSV Workbench Module

## Problem Statement

Third-party VS Code extensions (such as Rainbow CSV or spreadsheet editors) often bundle bloat,
telemetry, or unverified third-party code while missing specific workflow ergonomics. Installing
dozens of single-purpose extensions across multiple machines also creates maintenance overhead and
trust risks. The user needs a single, self-owned, modular VS Code extension (`vscode-tailor`)
paired with an autonomous Agent Skill (`vscode-tailor-architect`) so that new editor capabilities
can be requested conversationally, built under strict clean-code standards, toggled via native
settings, and deployed locally or synced via GitHub.

## Proposed Solution

Build **`vscode-tailor`**, a standalone, zero-dependency, modular TypeScript + Bun VS Code
extension housed in `ag-projects/vscode-tailor`, alongside a dedicated **`vscode-tailor`** Agent
Skill in `~/.gemini/config/skills/vscode-tailor`.

1. **Modular Feature Registry**: Every feature inside `vscode-tailor` implements a uniform
   `TailorFeatureModule` contract (`id`, `name`, `description`, `settingKey`, `activate`,
   `deactivate`) managed by a central closure-based feature registry. Features can be toggled at
   runtime via VS Code Settings (`vscodeTailor.<module>.enabled`) or the interactive
   `Tailor: Toggle Features` QuickPick command without restarting the editor.
2. **CSV Workbench Module (`csv`)**:
   - **Interactive Grid View (`CustomTextEditorProvider`)**: Opens `.csv` files by default in a
     rich, theme-aware spreadsheet grid backed directly by `vscode.TextDocument`. Supports setting
     `0..N` sticky header rows, real multi-type column sorting (persisting sorted data rows back to
     the file while keeping headers pinned), non-destructive per-column and global view filtering,
     inline cell editing, and row/column insertion and deletion.
   - **Rainbow CSV Text Decorator**: Automatically applies distinct, accessible rainbow colors to
     CSV columns when viewing a `.csv` file in the standard VS Code Text Editor, plus a hover
     tooltip showing the column's header name and 1-based column index.
   - **One-Click View Switching**: Editor Title bar action buttons (`Switch to Text View` /
     `Switch to Grid View`) toggle the active `.csv` file between the Interactive Grid View and
     the Rainbow Text View in a single click.
3. **Agent Skill (`vscode-tailor`)**: Codifies the architecture, module contract, build/VSIX
   packaging workflow, and automatic local installation into VS Code so future requests to improve
   VS Code automatically extend, test, version-bump, package, and install `vscode-tailor`.

## User Stories

1. As a developer, I want a single personal VS Code extension (`vscode-tailor`) with a modular
   feature registry, so that I can consolidate all my custom editor improvements in one trusted
   repository.
2. As a developer, I want to enable or disable any feature module via VS Code Settings or a
   `Tailor: Toggle Features` QuickPick command, so that I can turn specific behaviors on or off
   immediately without reloading the window.
3. As a user opening a `.csv` file, I want it to open by default in an interactive Grid View, so
   that I can inspect and edit tabular data comfortably.
4. As a user viewing a `.csv` file, I want a one-click button in the Editor Title bar to switch
   between the Grid View and the standard Text Editor (and back), so that I can seamlessly move
   between structured grid editing and raw text editing.
5. As a user viewing a `.csv` file in the Text Editor, I want each column highlighted in a distinct
   rainbow color with a hover tooltip showing its header name and column index, so that I get
   Rainbow CSV readability without installing a third-party extension.
6. As a user in the CSV Grid View, I want to configure the top `0..N` contiguous rows as sticky
   headers (via a toolbar stepper or row action), so that single-row or multi-row headers stay
   pinned at the top during scrolling, sorting, and filtering.
7. As a user in the CSV Grid View, I want clicking a column's sort control to perform a real sort
   (ascending/descending, numeric-aware) on the underlying data rows below the header block and
   update the `.csv` document, so that sorting permanently orders my data and supports native
   Undo/Redo (`Cmd+Z`).
8. As a user in the CSV Grid View, I want per-column and global filter inputs that filter visible
   data rows in the UI without altering the underlying `.csv` file, so that I can slice and inspect
   subsets of data safely.
9. As a user in the CSV Grid View, I want to double-click or type in cells to edit values and add
   or delete rows/columns, so that I can maintain CSV datasets directly inside the grid.
10. As a developer working with Antigravity, I want a dedicated `vscode-tailor` Agent Skill, so
    that whenever I ask for a new VS Code enhancement, the agent automatically creates or updates a
    feature module, runs tests and linters, packages the `.vsix`, and installs the updated
    extension into my local VS Code environment.

## Implementation Decisions

- **Closure-Based Architecture**: All modules use closure-based factory functions (`const _ = {}`
  for private state; no `class`, `this`, `new`, or `bind` except where required by platform Custom
  Web Components).
- **Standalone RFC 4180 CSV Engine**: Internal pure-TypeScript CSV parser and serializer supporting
  quoted fields, escaped double quotes (`""`), embedded newlines, custom delimiters, column count
  normalization, and preservation of document line endings (`\n` vs `\r\n`).
- **Custom Text Editor Synchronization**: The Grid View uses `vscode.CustomTextEditorProvider`
  backed by `vscode.TextDocument`. Edits and sorts apply `vscode.WorkspaceEdit` operations so native
  dirty state, `Cmd+S`, and `Cmd+Z` / `Cmd+Shift+Z` work seamlessly across both Grid and Text views.
- **Zero-Dependency VSIX Packaging**: Includes a Bun build + VSIX packaging and local installation
  pipeline (`bun run deploy`) that bundles the extension host (`dist/extension.js`) and webview
  client (`dist/csv-webview.js`), packages a valid `.vsix` archive, and installs it via the VS Code
  CLI (`code --install-extension`).

## Testing Decisions

- **CSV Parser & Serializer Boundary Tests**: Verify RFC 4180 parsing, quoted commas/newlines,
  escaped quotes, line-ending preservation, and round-trip serialization.
- **CSV Grid Operations Boundary Tests**: Verify multi-row header slicing (`0..N` headers), real
  data-row sorting (numeric, string, empty cells, ascending/descending) preserving header rows,
  non-destructive view filtering, and cell/row/column mutations.
- **Rainbow Tokenization Boundary Tests**: Verify per-line and multi-line token range extraction
  for Rainbow CSV text decoration and hover column resolution.
- **Feature Registry & Lifecycle Boundary Tests**: Verify dynamic activation, deactivation, and
  configuration toggle reactions across modules using isolated local `setup()` test helpers.

## Out of Scope

- Cloud synchronization backends (GitHub repository sync handles portability across machines).
- Excel binary formats (`.xlsx`, `.xls`) or Parquet files in v0.1.0.
- Formula evaluation engine (e.g. `=SUM(A1:A10)`) inside CSV cells.

