/**
 * File or line-range item accepted by the `antigravity.addContext` command.
 */
export interface AntigravityFileContextPayload {
  /**
   * Optional 1-based inclusive line range within the file.
   */
  range?: {
    /**
     * One-based inclusive ending line number.
     */
    endLineNumber: number;

    /**
     * One-based inclusive starting line number.
     */
    startLineNumber: number;
  };

  /**
   * Context payload discriminator expected by `antigravity.addContext`.
   */
  type: 'file';

  /**
   * Stringified file or directory URI (`file:///...`).
   */
  uri: string;
}

/**
 * Problem location payload accepted by `antigravity.explainAndFixProblem`.
 */
export interface AntigravityProblemRangePayload {
  /**
   * Stringified document URI containing the diagnostic.
   */
  absoluteUri: string;

  /**
   * Zero-based ending line number of the diagnostic.
   */
  endLine: number;

  /**
   * Zero-based starting line number of the diagnostic.
   */
  startLine: number;
}

/**
 * Pure snapshot of a single editor diagnostic used to select a problem at the cursor.
 */
export interface DiagnosticSnapshot {
  /**
   * Zero-based ending line number.
   */
  endLineZeroBased: number;

  /**
   * Diagnostic error or warning message text.
   */
  message: string;

  /**
   * Zero-based starting line number.
   */
  startLineZeroBased: number;
}

/**
 * Pure snapshot of an editor selection used to build an `AntigravityFileContextPayload`.
 */
export interface EditorSelectionSnapshot {
  /**
   * Zero-based ending line number of the selection.
   */
  endLineZeroBased: number;

  /**
   * Whether the selection is collapsed (cursor only, no highlighted characters).
   */
  isEmpty: boolean;

  /**
   * Zero-based starting line number of the selection.
   */
  startLineZeroBased: number;

  /**
   * Stringified document URI (`file:///...`).
   */
  uri: string;
}
