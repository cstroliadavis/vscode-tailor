const GRID_STYLESHEET = `
  :root {
    --sdc-accent: var(--vscode-focusBorder, #007fd4);
    --sdc-border: var(--vscode-panel-border, #3c3c3c);
    --sdc-header-bg: var(--vscode-editorGroupHeader-tabsBackground, #252526);
    --sdc-hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.04));
    --sdc-input-bg: var(--vscode-input-background, #3c3c3c);
    --sdc-input-fg: var(--vscode-input-foreground, #cccccc);
    --sdc-row-alt: rgba(128, 128, 128, 0.04);
    --sdc-selected-bg: rgba(0, 127, 212, 0.14);
    --sdc-surface: var(--vscode-editor-background, #1e1e1e);
    --sdc-text: var(--vscode-editor-foreground, #d4d4d4);
  }
  * { box-sizing: border-box; }
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
  #app { display: flex; flex: 1; flex-direction: column; height: 100vh; overflow: hidden; }
  .toolbar {
    align-items: center;
    background-color: var(--sdc-header-bg);
    border-bottom: 1px solid var(--sdc-border);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
    padding: 6px 12px;
  }
  .toolbar-group { align-items: center; display: flex; gap: 6px; }
  .btn {
    align-items: center;
    background-color: var(--vscode-button-secondaryBackground, #3a3d41);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    color: var(--vscode-button-secondaryForeground, #ffffff);
    cursor: pointer;
    display: inline-flex;
    font-size: 11px;
    gap: 4px;
    padding: 4px 8px;
  }
  .btn:hover { background-color: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .btn-primary { background-color: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #ffffff); }
  .btn-primary:hover { background-color: var(--vscode-button-hoverBackground, #1177bb); }
  .input-field, .select-field { background-color: var(--sdc-input-bg); border: 1px solid var(--sdc-border); border-radius: 3px; color: var(--sdc-input-fg); font-size: 11px; padding: 3px 6px; }
  .badge { background-color: rgba(128, 128, 128, 0.18); border-radius: 3px; font-size: 10px; font-weight: 600; padding: 2px 5px; white-space: nowrap; }
  .ag-workspace { display: flex; flex: 1; overflow: hidden; position: relative; }
  .grid-wrapper { flex: 1; overflow: auto; position: relative; }
  table { border-collapse: separate; border-spacing: 0; table-layout: fixed; width: max-content; }
  th, td {
    border-bottom: 1px solid var(--sdc-border);
    border-right: 1px solid var(--sdc-border);
    height: 30px;
    overflow: hidden;
    padding: 0;
    position: relative;
    vertical-align: middle;
  }
  tbody tr:nth-child(even) td { background-color: var(--sdc-row-alt); }
  tbody tr:hover td { background-color: var(--sdc-hover-bg); }
  tbody tr.ag-row-selected td { background-color: var(--sdc-selected-bg); }
  td.ag-cell-selected { outline: 2px solid var(--sdc-accent); outline-offset: -2px; z-index: 1; }
  .gutter-cell {
    background-color: var(--sdc-header-bg);
    left: 0;
    min-width: 74px;
    position: sticky;
    width: 74px;
    z-index: 2;
  }
  .ag-pinned-cell {
    background-color: var(--sdc-surface);
    box-shadow: 2px 0 4px rgba(0, 0, 0, 0.2);
    position: sticky;
    z-index: 2;
  }
  thead { background-color: var(--sdc-header-bg); position: sticky; top: 0; z-index: 3; }
  thead .gutter-cell, thead .ag-pinned-cell { background-color: var(--sdc-header-bg); z-index: 4; }
  .row-gutter {
    align-items: center;
    background-color: var(--sdc-header-bg);
    display: flex;
    font-size: 11px;
    gap: 4px;
    justify-content: space-between;
    padding: 4px 6px;
    user-select: none;
  }
  .col-control-header {
    background-color: var(--sdc-header-bg);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 8px 5px 6px;
  }
  .col-title-row, .col-meta-row {
    align-items: center;
    display: flex;
    gap: 4px;
    justify-content: space-between;
  }
  .col-title {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
    white-space: nowrap;
  }
  .col-actions { align-items: center; display: flex; gap: 2px; }
  .icon-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--sdc-text);
    cursor: pointer;
    font-size: 10px;
    padding: 1px 4px;
  }
  .icon-btn:hover { background-color: var(--sdc-hover-bg); border-color: var(--sdc-border); }
  .icon-btn.is-active {
    background-color: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }
  .ag-resizer {
    bottom: 0;
    cursor: col-resize;
    position: absolute;
    right: 0;
    top: 0;
    width: 5px;
    z-index: 5;
  }
  .ag-resizer:hover { background-color: var(--sdc-accent); }
  .ag-floating-filter-cell { background-color: var(--sdc-header-bg); padding: 3px 5px; }
  .ag-floating-filter-cell .input-field { width: 100%; }
  .header-row-cell { background-color: var(--sdc-header-bg); font-weight: 600; }
  .ag-cell-display {
    align-items: center;
    cursor: default;
    display: flex;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    gap: 6px;
    height: 100%;
    overflow: hidden;
    padding: 0 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }
  .ag-cell-number {
    font-variant-numeric: tabular-nums;
    justify-content: flex-end;
    text-align: right;
  }
  .ag-cell-boolean { justify-content: center; }
  .cell-input {
    background-color: var(--sdc-input-bg);
    border: 1px solid var(--sdc-accent);
    color: var(--sdc-input-fg);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    height: 100%;
    outline: none;
    padding: 4px 7px;
    width: 100%;
  }
  .ag-inspector-drawer {
    background-color: var(--sdc-header-bg);
    border-left: 1px solid var(--sdc-border);
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 340px;
    overflow: hidden;
    width: 380px;
  }
  .ag-inspector-header, .ag-inspector-subbar {
    align-items: center;
    border-bottom: 1px solid var(--sdc-border);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: space-between;
    padding: 7px 10px;
  }
  .ag-inspector-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
    padding: 10px;
  }
  .ag-plain-textarea, .ag-code-textarea {
    background-color: var(--sdc-input-bg);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    color: var(--sdc-input-fg);
    flex: 1;
    font-size: 12px;
    min-height: 220px;
    padding: 8px;
    resize: vertical;
    width: 100%;
  }
  .ag-plain-textarea {
    font-family: var(--vscode-font-family, sans-serif);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .ag-code-textarea {
    font-family: var(--vscode-editor-font-family, monospace);
    line-height: 1.4;
    white-space: pre;
  }
  .ag-prop-card {
    background-color: var(--sdc-surface);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
  }
  .ag-prop-row {
    align-items: center;
    display: grid;
    gap: 6px;
    grid-template-columns: 110px 1fr auto;
  }
  .ag-prop-key {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ag-status-bar {
    align-items: center;
    background-color: var(--sdc-header-bg);
    border-top: 1px solid var(--sdc-border);
    display: flex;
    font-size: 11px;
    gap: 16px;
    justify-content: space-between;
    padding: 4px 12px;
    user-select: none;
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
