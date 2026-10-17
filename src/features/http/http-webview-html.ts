const HTTP_WORKBENCH_STYLESHEET = `
  :root {
    --sdc-accent: var(--vscode-focusBorder, #007fd4);
    --sdc-border: var(--vscode-panel-border, #3c3c3c);
    --sdc-danger: var(--vscode-testing-iconFailed, #f14c4c);
    --sdc-header-bg: var(--vscode-editorGroupHeader-tabsBackground, #252526);
    --sdc-hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
    --sdc-input-bg: var(--vscode-input-background, #3c3c3c);
    --sdc-input-fg: var(--vscode-input-foreground, #cccccc);
    --sdc-muted: var(--vscode-descriptionForeground, #9d9d9d);
    --sdc-selected-bg: rgba(0, 127, 212, 0.16);
    --sdc-success: var(--vscode-testing-iconPassed, #73c991);
    --sdc-surface: var(--vscode-editor-background, #1e1e1e);
    --sdc-text: var(--vscode-editor-foreground, #d4d4d4);
    --sdc-warn: var(--vscode-editorWarning-foreground, #cca700);
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
    font-weight: 500;
    gap: 4px;
    padding: 4px 8px;
    white-space: nowrap;
  }
  .btn:hover { background-color: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .btn-primary {
    background-color: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }
  .btn-primary:hover { background-color: var(--vscode-button-hoverBackground, #1177bb); }
  .input-field, .select-field {
    background-color: var(--sdc-input-bg);
    border: 1px solid var(--sdc-border);
    border-radius: 3px;
    color: var(--sdc-input-fg);
    font-size: 12px;
    padding: 4px 7px;
  }
  .input-field:focus, .select-field:focus, .code-editor:focus {
    border-color: var(--sdc-accent);
    outline: none;
  }
  .mono { font-family: var(--vscode-editor-font-family, monospace); }
  .badge {
    background-color: rgba(128, 128, 128, 0.2);
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .badge-GET { background-color: rgba(56, 138, 255, 0.22); color: #58a6ff; }
  .badge-POST { background-color: rgba(63, 185, 80, 0.22); color: #56d364; }
  .badge-PUT, .badge-PATCH { background-color: rgba(210, 153, 34, 0.22); color: #e3b341; }
  .badge-DELETE, .badge-PURGE, .badge-BAN { background-color: rgba(248, 81, 73, 0.22); color: #ff7b72; }
  .badge-pass { background-color: rgba(63, 185, 80, 0.22); color: var(--sdc-success); }
  .badge-fail { background-color: rgba(248, 81, 73, 0.22); color: var(--sdc-danger); }
  .workbench-body {
    display: grid;
    flex: 1;
    grid-template-columns: 250px 1fr 1fr;
    overflow: hidden;
  }
  .sidebar-pane {
    background-color: var(--sdc-header-bg);
    border-right: 1px solid var(--sdc-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .pane-header {
    align-items: center;
    background-color: var(--sdc-header-bg);
    border-bottom: 1px solid var(--sdc-border);
    display: flex;
    font-size: 11px;
    font-weight: 600;
    justify-content: space-between;
    padding: 6px 10px;
    text-transform: uppercase;
  }
  .request-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
  }
  .request-item {
    align-items: center;
    border-bottom: 1px solid var(--sdc-border);
    cursor: pointer;
    display: flex;
    gap: 6px;
    justify-content: space-between;
    padding: 8px 10px;
  }
  .request-item:hover { background-color: var(--sdc-hover-bg); }
  .request-item.is-selected {
    background-color: var(--sdc-selected-bg);
    border-left: 3px solid var(--sdc-accent);
  }
  .request-item-title {
    flex: 1;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inspector-pane, .response-pane {
    border-right: 1px solid var(--sdc-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .url-bar {
    align-items: center;
    border-bottom: 1px solid var(--sdc-border);
    display: grid;
    gap: 6px;
    grid-template-columns: 110px 1fr auto;
    padding: 8px 10px;
  }
  .tab-bar {
    background-color: var(--sdc-header-bg);
    border-bottom: 1px solid var(--sdc-border);
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 0 8px;
  }
  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--sdc-muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 10px;
  }
  .tab-btn:hover { color: var(--sdc-text); }
  .tab-btn.is-active {
    border-bottom-color: var(--sdc-accent);
    color: var(--sdc-text);
  }
  .pane-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding: 10px;
  }
  .kv-table {
    border-collapse: collapse;
    width: 100%;
  }
  .kv-table th, .kv-table td {
    border-bottom: 1px solid var(--sdc-border);
    padding: 4px;
    text-align: left;
  }
  .kv-table th {
    color: var(--sdc-muted);
    font-size: 11px;
    font-weight: 600;
  }
  .kv-table .input-field, .kv-table .select-field { width: 100%; }
  .code-editor {
    background-color: var(--sdc-input-bg);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    color: var(--sdc-input-fg);
    flex: 1;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.45;
    min-height: 180px;
    padding: 8px;
    resize: vertical;
    white-space: pre;
    width: 100%;
  }
  .response-pre {
    background-color: var(--sdc-input-bg);
    border: 1px solid var(--sdc-border);
    border-radius: 4px;
    flex: 1;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.45;
    margin: 0;
    overflow: auto;
    padding: 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .assert-row { align-items: center; background-color: var(--sdc-header-bg); border: 1px solid var(--sdc-border); border-radius: 4px; display: flex; gap: 8px; justify-content: space-between; padding: 6px 10px; }
  .method-combobox { display: flex; position: relative; width: 100%; }
  .method-combobox .input-field { border-bottom-right-radius: 0; border-right: none; border-top-right-radius: 0; flex: 1; font-weight: 700; min-width: 0; text-transform: uppercase; }
  .method-dropdown-btn { align-items: center; background-color: var(--sdc-input-bg); border: 1px solid var(--sdc-border); border-bottom-right-radius: 3px; border-top-right-radius: 3px; color: var(--sdc-muted); cursor: pointer; display: inline-flex; font-size: 10px; justify-content: center; padding: 0 6px; }
  .method-dropdown-btn:hover { background-color: var(--sdc-hover-bg); color: var(--sdc-text); }
  .method-menu { background-color: var(--sdc-header-bg); border: 1px solid var(--sdc-accent); border-radius: 4px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45); display: none; flex-direction: column; left: 0; max-height: 240px; min-width: 130px; overflow-y: auto; position: absolute; top: calc(100% + 2px); z-index: 100; }
  .method-menu.is-open { display: flex; }
  .method-option { align-items: center; cursor: pointer; display: flex; font-size: 11px; font-weight: 600; justify-content: space-between; padding: 5px 10px; }
  .method-option:hover { background-color: var(--sdc-hover-bg); }
  .method-option.is-selected { background-color: var(--sdc-selected-bg); color: var(--sdc-accent); }
`;

/**
 * Generates the complete HTML document for the Tailor HTTP Client Workbench Webview.
 *
 * @param params - Webview script URI and Content Security Policy source token.
 * @returns Full HTML string to assign to `webviewPanel.webview.html`.
 *
 * @example
 * ```ts
 * const html = buildHttpWorkbenchHtml({
 *   cspSource: webview.cspSource,
 *   nonce: 'abc123',
 *   scriptUri: 'vscode-webview://.../http-webview.js',
 * });
 * ```
 */
export function buildHttpWorkbenchHtml(params: {
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
  <title>Tailor HTTP Workbench</title>
  <style>${HTTP_WORKBENCH_STYLESHEET}</style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${params.nonce}" src="${params.scriptUri}"></script>
</body>
</html>`;
}
