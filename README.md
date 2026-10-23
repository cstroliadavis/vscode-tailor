# VS Code Tailor (`vscode-tailor`)

A personal, modular VS Code workbench extension built with TypeScript and Bun.

## Why This Exists

If you stumbled across this repository, you should probably know up front that the repo itself
isn't really as important as what I'm doing with it, and I'm not really expecting anyone else to
use it as is.

VS Code Tailor is basically just a personal project intended for me. When I find existing VS Code
plugins with functionality that I like, I generally have AI vibe code that functionality as a
feature into this plugin instead. That way, I can focus on the parts of the target plugin I'm
actually interested in without keeping all the bloat that I don't care about. And if there are
special features I'd like to include as part of that add-in, I just build them right in.

This keeps things clean and under my control. It reduces bloat and cuts down on the friction that
can happen when multiple plugins try to do similar things.

Over time, I expect I'll start adding a lot more features, along with dedicated Agents and Agent
Skills that understand how to do this well. Eventually, I may also keep other branches or tagged
versions of this with specific tools for specific types of projects that I can easily share with a
team, or drop into a containerized VS Code instance so the environment is already tailored to the
work at hand.

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

### 3. HTTP Client Workbench (`http` — `.http` / `.rest` GUI Custom Editor + Runner)

Provides a hybrid **Postman/Insomnia-style GUI Custom Editor** and **JetBrains-compatible `.http` /
`.rest` Text Editor & Runner**, with bidirectional synchronization and multi-source secret
resolution:

- **Default GUI Workbench (`vscodeTailor.httpWorkbench`) & Seamless Text Toggle**:
  - Opening any `*.http` or `*.rest` file opens the three-pane GUI Workbench by default (Request
    Collection Sidebar, Center Request Inspector, and Right Response & Test Results Viewer), with a
    one-click `Switch to Text` / `Switch to GUI Workbench` toggle.
  - **Unfiltered Editable Method Combo-Box**: Click the `▾` dropdown or focus the method input to
    pick from the full unfiltered list of standard (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`,
    `OPTIONS`, `TRACE`, `CONNECT`) and extended CDN/WebDAV verbs (`PURGE`, `BAN`, `PROPFIND`,
    `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `LINK`, `UNLINK`), or type any custom
    HTTP method directly.
  - **Editable Header Name & Value Combo-Boxes**: Suggests common HTTP request headers (`Accept`,
    `Authorization`, `Cache-Control`, `Content-Type`, etc.) and context-aware header values while
    allowing arbitrary header names, values, and `{{variable}}` placeholders.
  - **Request Inspector Sub-Tabs (`Variables | Params | Headers | Cookies | Auth | Body | Tests`)**:
    - **`Variables`**: Editable key/value table for in-file `@variable = value` declarations.
    - **`Params`**: Decomposes URL query parameters (`?a=1&b={{var}}`) into an editable key/value
      table without URL-encoding `{{...}}` template placeholders.
    - **`Headers` & `Cookies`**: Editable key/value tables with automatic `Cookie:` header
      decomposition and session `Set-Cookie` capture (`CookieJar`).
    - **`Auth`**: Supports `none`, `bearer`, `basic`, and `apiKey` (in `header` or `query`),
      bidirectionally synchronized with request headers and query parameters.
    - **`Body`**: Raw payload editor with one-click `Format JSON` and `< ./path/to/payload.json`
      external file reference support.
    - **`Tests`**: Visual `# @assert <target> <op> <expected>` declarative assertion builder plus a
      JetBrains-compatible `> {% ... %}` response handler script editor (`client.test`,
      `client.assert`, `client.global.set/get`, `response`).
- **Multi-Source Variable & Secret Resolution**:
  - Resolves variables across `client.global`, in-file `@variables`, `.env` / `.env.local`, and
    JetBrains `http-client.env.json` / `http-client.private.env.json` (including `$shared` defaults).
  - Supports macOS Keychain (`{{$keychain service account}}`), VS Code `SecretStorage`
    (`{{$secret key}}`), and dynamic built-ins (`{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`,
    `{{$randomInt [min] [max]}}`, `{{$processEnv VAR}}`).

### 4. Text & HTTP Utilities (`utils` — Editor `Utils` Context Menu)

Provides an editor right-click **`Utils`** context submenu (plus keybindable `Tailor Utils` commands)
that operates on the active selection or falls back to the current line/word:

- **Sorting (`vscodeTailor.utils.sort.enabled`)**:
  - **Smart Sort (`vscodeTailor.utils.sortSmart`)**: Sorts inline or multiline array literals
    (`[...]`), object literals by key (`{...}`), parameter lists (`(...)`), comma-separated lists,
    or rows while ignoring commas inside nested calls or string literals.
  - **Sort Rows Ascending / Descending & Sort Imports**: Convenience entries delegating to VS Code's
    native line and import sorters.
- **Encoding (`vscodeTailor.utils.encode.enabled`)**:
  - Auto-detects whether the selection is already encoded (decodes if so, encodes otherwise):
    - **Base64 Encode / Decode** (`vscodeTailor.utils.base64Toggle`)
    - **URL Encode / Decode** (`vscodeTailor.utils.urlToggle`)
    - **HTML Encode / Decode** (`vscodeTailor.utils.htmlToggle`)
- **HTTP Snippet Conversion (`vscodeTailor.utils.http.enabled`)**:
  - Auto-detects whether the selected snippet is `cURL`, `fetch()`, or `.http` and converts to the
    target via **Convert to cURL**, **Convert to fetch()**, or **Convert to .http Request**.
- **Case Conversion (`vscodeTailor.utils.case.enabled`)**:
  - Includes `snake_case`, `UPPER_SNAKE_CASE`, `kebab-case`, `UPPER-KEBAB-CASE`, `PascalCase`,
    `camelCase`, `Title Case`, `UPPER CASE`, and `lower case`.

## Configuration Settings

| Setting                                | Type      | Default | Description                                                                            |
| :------------------------------------- | :-------- | :------ | :------------------------------------------------------------------------------------- |
| `vscodeTailor.csv.enabled`             | `boolean` | `true`  | Enable the CSV Workbench module (Grid View + Rainbow CSV Text Decorator).              |
| `vscodeTailor.csv.rainbowEnabled`      | `boolean` | `true`  | Enable Rainbow CSV column highlighting and hover tooltips in the Text Editor.          |
| `vscodeTailor.csv.defaultHeaderRows`   | `number`  | `1`     | Default number of top contiguous rows pinned as sticky headers in Grid View.           |
| `vscodeTailor.csv.schemas`             | `object`  | `{}`    | Per-file CSV column schemas (`dataType`, `decimals`, `dateFormat`, `pinned`, `width`). |
| `vscodeTailor.http.enabled`            | `boolean` | `true`  | Enable the HTTP Client Workbench module (`.http`/`.rest` GUI, CodeLens, and secrets).  |
| `vscodeTailor.http.defaultEnvironment` | `string`  | `"dev"` | Default environment name selected from `http-client.env.json` when opening `.http`.    |
| `vscodeTailor.utils.enabled`           | `boolean` | `true`  | Enable the Text & HTTP Utilities module and editor right-click `Utils` context menu.   |
| `vscodeTailor.utils.sort.enabled`      | `boolean` | `true`  | Show sorting commands in the `Utils` context menu.                                     |
| `vscodeTailor.utils.encode.enabled`    | `boolean` | `true`  | Show Base64, URL, and HTML encode/decode toggle commands in the `Utils` context menu.  |
| `vscodeTailor.utils.http.enabled`      | `boolean` | `true`  | Show HTTP conversion commands (`cURL` / `fetch()` / `.http`) in the `Utils` menu.      |
| `vscodeTailor.utils.case.enabled`      | `boolean` | `true`  | Show case conversion commands in the `Utils` context menu.                             |

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
