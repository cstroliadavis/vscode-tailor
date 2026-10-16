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

### 2. CSV Workbench (`csv`)

Provides both an **Interactive CSV Grid Custom Editor** and **Rainbow CSV Text Highlighting**, with
one-click switching between views:

- **Interactive Grid View (`vscodeTailor.csvGrid`)**:
  - Opens `.csv` files by default in a theme-aware spreadsheet grid backed directly by
    `vscode.TextDocument`.
  - **Multi-Row Sticky Headers (`0..N`)**: Use the toolbar stepper (`−` / `+`) or click the `📌`
    button on any row gutter to pin the top `0..N` contiguous rows as sticky headers.
  - **Real Data Sorting**: Click `▲` (Ascending) or `▼` (Descending) on any column header to sort
    data rows below the pinned header block (numeric-aware, empty cells last) and persist the sorted
    order directly to the `.csv` document (full `Cmd+Z` Undo/Redo support).
  - **Non-Destructive View Filtering**: Filter visible data rows using the global search bar or
    per-column filter inputs without modifying the underlying `.csv` file.
  - **Inline Editing & Structural Actions**: Edit any cell inline, or add/remove rows and columns.
- **Rainbow CSV Text View**:
  - Colors each CSV column in the standard VS Code Text Editor using a high-contrast 10-color
    palette.
  - Displays a hover tooltip on any cell showing its 1-based column number, composite header title,
    row number, and unescaped value.
- **One-Click View Toggle**:
  - Click the `$(code)` (**Switch to Text View**) or `$(table)` (**Switch to Grid View**) icon in
    the VS Code Editor Title bar (or the Grid View toolbar button) to flip between views at any
    time.

## Configuration Settings

| Setting                              | Type      | Default | Description                                                                   |
| :----------------------------------- | :-------- | :------ | :---------------------------------------------------------------------------- |
| `vscodeTailor.csv.enabled`           | `boolean` | `true`  | Enable the CSV Workbench module (Grid View + Rainbow CSV Text Decorator).     |
| `vscodeTailor.csv.rainbowEnabled`    | `boolean` | `true`  | Enable Rainbow CSV column highlighting and hover tooltips in the Text Editor. |
| `vscodeTailor.csv.defaultHeaderRows` | `number`  | `1`     | Default number of top contiguous rows pinned as sticky headers in Grid View.  |

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

