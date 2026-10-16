# VS Code Tailor (`vscode-tailor`)

A personal, modular VS Code workbench extension built with TypeScript and Bun. Instead of
installing dozens of untrusted third-party extensions with unnecessary bloat, `vscode-tailor`
consolidates custom workbench enhancements into a single self-owned repository managed by a
central feature registry and paired with an autonomous Agent Skill.

## Features

### 1. Modular Feature Registry (`Tailor: Toggle Feature Modules`)

Every enhancement inside `vscode-tailor` is encapsulated as a `TailorFeatureModule` that can be
toggled on or off dynamically without restarting VS Code:

- **Command Palette**: Run `Tailor: Toggle Feature Modules` (`vscodeTailor.toggleFeatures`) to check
  or uncheck active modules interactively.
- **Native VS Code Settings**: Toggle `vscodeTailor.<module>.enabled` under
  `Settings -> Extensions -> VS Code Tailor`.

### 2. CSV Workbench (`csv` — AG Grid Community Style + Typed Column Schemas)

Provides both an **AG Grid Community-style CSV Grid Custom Editor** and **Rainbow CSV Text
Highlighting**, with one-click switching between views and per-file schema persistence in
`.vscode/settings.json`:

- **AG Grid-Style Local Grid View (`vscodeTailor.csvGrid`)**:
  - **Resizable & Left-Pinned Columns**: Drag the right edge of any column header to resize its
    width (`90px..800px`), or click `📌` in the column header to freeze/pin columns to the left edge
    during horizontal scrolling.
  - **Click-Header-to-Sort & Floating Filter Row**: Click any column header title (or `▲` / `▼`) to
    perform real numeric-aware sorting of data rows below the sticky header block (`Cmd+Z`
    Undo/Redo supported). Use the floating filter row directly beneath column headers or the global
    quick-filter bar for non-destructive view filtering.
  - **Cell Selection, Keyboard Navigation & Status Bar**: Single-click any cell to focus it (with an
    AG Grid focus border and active row highlight), navigate with `ArrowUp`/`Down`/`Left`/`Right`,
    press `Enter` or double-click to edit inline, and inspect row/column counts and active cell
    metadata in the bottom status bar.
  - **Multi-Row Sticky Headers (`0..N`)**: Use the toolbar stepper (`−` / `+`) or click `📌` on any
    row gutter to pin the top `0..N` contiguous rows as sticky headers.
- **Typed Column Schemas persisted in `.vscode/settings.json` (`vscodeTailor.csv.schemas`)**:
  - Designate any column's data type from its header dropdown (`TEXT`, `BOOLEAN`, `NUMBER`, `DATE`,
    `JSON`, `JSONL`); settings are automatically remembered per CSV file in `.vscode/settings.json`:
    - **`BOOLEAN`**: Renders an interactive checkbox directly in the grid cell whenever the value is
      boolean-like (`true`/`false`, `1`/`0`, `yes`/`no`), and falls back to displaying raw text for
      any other cell content.
    - **`NUMBER`**: Right-aligns numeric cells using `tabular-nums` and formats values to your
      chosen decimal precision (`Auto`, `0`, `1`, `2`, `3`, or `4` decimal places).
    - **`DATE`**: Formats date strings in the grid according to your chosen column preset
      (`YYYY-MM-DD`, `MM/DD/YYYY`, `MMM D, YYYY`, or `ISO`).
    - **`JSON` & `JSONL`**: Renders a compact `{JSON}` / `JSONL` badge + single-line preview in the
      grid cell and opens the **Right-Side Cell Inspector Drawer** when selected.
- **Right-Side Cell Inspector Drawer**:
  - Automatically opens when selecting a `JSON`, `JSONL`, or multi-line/long `TEXT` cell (or toggle
    manually via the `Inspector Drawer` toolbar button).
  - **`JSON` Columns**: Switch between an IDE-style **Mini-Form** property sheet (edit individual
    keys with type-aware text, number, and checkbox inputs, or add/delete keys) and a **Formatted
    Code** editor with validation.
  - **`JSONL` Columns**: Switch between a stack of **Object `#1..#N` Mini-Form Cards** (edit fields,
    add new JSONL objects, or remove objects) and a **Formatted Code** editor.
  - **`TEXT` Columns**: Provides a clean, soft-wrapped plain-text `<textarea>` without syntax
    highlighting for comfortable multi-line prose editing.
- **Rainbow CSV Text View & One-Click View Toggle**:
  - Colors each CSV column in the standard VS Code Text Editor using a 10-color palette with hover
    tooltips, and provides a one-click `$(code)` / `$(table)` toggle in the Editor Title bar.

## Configuration Settings

| Setting                              | Type      | Default | Description                                                                            |
| :----------------------------------- | :-------- | :------ | :------------------------------------------------------------------------------------- |
| `vscodeTailor.csv.enabled`           | `boolean` | `true`  | Enable the CSV Workbench module (Grid View + Rainbow CSV Text Decorator).              |
| `vscodeTailor.csv.rainbowEnabled`    | `boolean` | `true`  | Enable Rainbow CSV column highlighting and hover tooltips in the Text Editor.          |
| `vscodeTailor.csv.defaultHeaderRows` | `number`  | `1`     | Default number of top contiguous rows pinned as sticky headers in Grid View.           |
| `vscodeTailor.csv.schemas`           | `object`  | `{}`    | Per-file CSV column schemas (`dataType`, `decimals`, `dateFormat`, `pinned`, `width`). |

## Development & Local Installation

```bash
# Install dependencies
bun install

# Run unit tests, linter, formatter check, and typecheck
bun test
bun run lint
bun run format:check
bun run typecheck

# Bundle, package .vsix, and install into local VS Code
bun run deploy
```

## License

MIT
