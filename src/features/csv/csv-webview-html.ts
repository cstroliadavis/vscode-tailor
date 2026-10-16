const GRID_STYLESHEET = `
  :root {
    --sdc-border: var(--vscode-panel-border, #3c3c3c);
    --sdc-header-bg: var(--vscode-editorGroupHeader-tabsBackground, #252526);
    --sdc-hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
    --sdc-input-bg: var(--vscode-input-background, #3c3c3c);
    --sdc-input-fg: var(--vscode-input-foreground, #cccccc);
    --sdc-surface: var(--vscode-editor-background, #1e1e1e);
    --sdc-text: var(--vscode-editor-foreground, #d4d4d4);
  }
  * {
    box-sizing: border-box;
  }
  body {
    background-color: var(--sdc-surface);
    color: var(--sdc-text);
    display: flex;
    flex-direction: column;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    height: 100vh;
    margin: 0;
    overflow: hidden;
    padding: 0;
  }
  .toolbar {
    align-items: center;
    background-color: var(--sdc-header-bg);
    border-bottom: 1px solid var(--sdc-border);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
    padding: 8px 12px;
  }
  .toolbar-group {
    align-items: center;
    display: flex;
    gap: 8px;
  }
  .btn {
    align-items: center;
    background-color: var(--vscode-button-secondaryBackground, #3a3d41);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    color: var(--vscode-button-secondaryForeground, #ffffff);
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    gap: 4px;
    padding: 4px 8px;
  }
  .btn:hover {
    background-color: var(--vscode-button-secondaryHoverBackground, #45494e);
  }
  .btn-primary {
    background-color: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }
  .btn-primary:hover {
    background-color: var(--vscode-button-hoverBackground, #1177bb);
  }
  .input-field {
    background-color: var(--sdc-input-bg);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    color: var(--sdc-input-fg);
    font-size: 12px;
    padding: 4px 8px;
  }
  .badge {
    font-size: 11px;
    opacity: 0.8;
  }
  .grid-wrapper {
    flex: 1;
    overflow: auto;
    position: relative;
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    min-width: 100%;
    width: max-content;
  }
  th, td {
    border-bottom: 1px solid var(--sdc-border);
    border-right: 1px solid var(--sdc-border);
    min-width: 140px;
    padding: 0;
    vertical-align: top;
  }
  .row-gutter {
    align-items: center;
    background-color: var(--sdc-header-bg);
    display: flex;
    font-size: 11px;
    gap: 4px;
    justify-content: space-between;
    min-width: 72px;
    padding: 4px 6px;
    user-select: none;
  }
  .gutter-cell {
    background-color: var(--sdc-header-bg);
    left: 0;
    min-width: 72px;
    position: sticky;
    width: 72px;
    z-index: 2;
  }
  thead {
    background-color: var(--sdc-header-bg);
    position: sticky;
    top: 0;
    z-index: 3;
  }
  thead .gutter-cell {
    z-index: 4;
  }
  .col-control-header {
    background-color: var(--sdc-header-bg);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
  }
  .col-title-row {
    align-items: center;
    display: flex;
    gap: 4px;
    justify-content: space-between;
  }
  .col-title {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col-actions {
    display: flex;
    gap: 2px;
  }
  .icon-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--sdc-text);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
  }
  .icon-btn:hover {
    background-color: var(--sdc-hover-bg);
    border-color: var(--sdc-border);
  }
  .icon-btn.is-active {
    background-color: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }
  .header-row-cell {
    background-color: var(--sdc-header-bg);
    font-weight: 600;
  }
  .cell-input {
    background: transparent;
    border: 1px solid transparent;
    color: inherit;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    font-weight: inherit;
    padding: 6px 8px;
    width: 100%;
  }
  .cell-input:focus {
    background-color: var(--sdc-input-bg);
    border-color: var(--vscode-focusBorder, #007fd4);
    outline: none;
  }
  tbody tr:hover td {
    background-color: var(--sdc-hover-bg);
  }
`;

/**
 * Generates the complete HTML document for the CSV Grid Custom Editor Webview.
 *
 * @param params - Webview script URI and Content Security Policy source token.
 * @returns Full HTML string to assign to `webviewPanel.webview.html`.
 *
 * @example
 * ```ts
 * const html = buildCsvGridHtml({
 *   cspSource: webview.cspSource,
 *   nonce: 'abc123',
 *   scriptUri: 'vscode-webview://.../csv-webview.js',
 * });
 * ```
 */
export function buildCsvGridHtml(params: {
  cspSource: string;
  nonce: string;
  scriptUri: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${params.cspSource} 'unsafe-inline'; script-src 'nonce-${params.nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tailor CSV Grid</title>
  <style>${GRID_STYLESHEET}</style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${params.nonce}" src="${params.scriptUri}"></script>
</body>
</html>`;
}

