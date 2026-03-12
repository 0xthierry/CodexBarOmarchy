import type { TuiKeyInput, TuiLocalState, TuiTokenAccountEditorState } from "@/ui/tui/types.ts";

type ClaudeTokenAccountEditorKeyAction =
  | { type: "appendText"; value: string }
  | { type: "cancel" }
  | { type: "deleteText" }
  | { type: "ignore" }
  | { type: "submit" }
  | { type: "switchField" };

type ClaudeTokenAccountEditorSubmission =
  | { errorMessage: string; ok: false }
  | { label: string; ok: true; token: string };

const createClaudeTokenAccountEditorState = (): TuiTokenAccountEditorState => ({
  errorMessage: null,
  field: "label",
  label: "",
  providerId: "claude",
  token: "",
});

const openClaudeTokenAccountEditor = (localState: TuiLocalState): TuiLocalState => ({
  ...localState,
  footerMessage: null,
  modalFocus: "editor",
  tokenAccountEditor: createClaudeTokenAccountEditorState(),
});

const cancelClaudeTokenAccountEditor = (localState: TuiLocalState): TuiLocalState => ({
  ...localState,
  footerMessage: "Cancelled Claude token account entry.",
  modalFocus: "items",
  tokenAccountEditor: null,
});

const closeClaudeTokenAccountEditor = (localState: TuiLocalState): TuiLocalState => ({
  ...localState,
  modalFocus: "items",
  tokenAccountEditor: null,
});

const switchClaudeTokenAccountEditorField = (localState: TuiLocalState): TuiLocalState => {
  if (localState.tokenAccountEditor === null) {
    return localState;
  }

  const nextField = localState.tokenAccountEditor.field === "label" ? "token" : "label";

  return {
    ...localState,
    tokenAccountEditor: {
      ...localState.tokenAccountEditor,
      field: nextField,
    },
  };
};

const appendClaudeTokenAccountEditorText = (
  localState: TuiLocalState,
  value: string,
): TuiLocalState => {
  if (localState.tokenAccountEditor === null) {
    return localState;
  }

  if (localState.tokenAccountEditor.field === "label") {
    return {
      ...localState,
      tokenAccountEditor: {
        ...localState.tokenAccountEditor,
        errorMessage: null,
        label: `${localState.tokenAccountEditor.label}${value}`,
      },
    };
  }

  return {
    ...localState,
    tokenAccountEditor: {
      ...localState.tokenAccountEditor,
      errorMessage: null,
      token: `${localState.tokenAccountEditor.token}${value}`,
    },
  };
};

const deleteClaudeTokenAccountEditorText = (localState: TuiLocalState): TuiLocalState => {
  if (localState.tokenAccountEditor === null) {
    return localState;
  }

  if (localState.tokenAccountEditor.field === "label") {
    return {
      ...localState,
      tokenAccountEditor: {
        ...localState.tokenAccountEditor,
        label: localState.tokenAccountEditor.label.slice(0, -1),
      },
    };
  }

  return {
    ...localState,
    tokenAccountEditor: {
      ...localState.tokenAccountEditor,
      token: localState.tokenAccountEditor.token.slice(0, -1),
    },
  };
};

const setClaudeTokenAccountEditorError = (
  localState: TuiLocalState,
  errorMessage: string,
): TuiLocalState => {
  if (localState.tokenAccountEditor === null) {
    return localState;
  }

  return {
    ...localState,
    tokenAccountEditor: {
      ...localState.tokenAccountEditor,
      errorMessage,
    },
  };
};

const resolveClaudeTokenAccountEditorKeyAction = (
  localState: TuiLocalState,
  key: TuiKeyInput,
): ClaudeTokenAccountEditorKeyAction | null => {
  if (localState.tokenAccountEditor === null) {
    return null;
  }

  if (key.name === "escape") {
    return { type: "cancel" };
  }

  if (key.name === "tab") {
    return { type: "switchField" };
  }

  if (key.name === "backspace") {
    return { type: "deleteText" };
  }

  if (key.name === "enter" || key.name === "return") {
    if (localState.tokenAccountEditor.field === "label") {
      return { type: "switchField" };
    }

    return { type: "submit" };
  }

  if (!key.ctrl && !key.meta && key.sequence.length === 1 && key.name !== "escape") {
    return {
      type: "appendText",
      value: key.sequence,
    };
  }

  if (key.name === "down" || key.name === "left" || key.name === "right" || key.name === "up") {
    return { type: "ignore" };
  }

  return null;
};

const readClaudeTokenAccountEditorSubmission = (
  localState: TuiLocalState,
): ClaudeTokenAccountEditorSubmission | null => {
  if (localState.tokenAccountEditor === null) {
    return null;
  }

  const label = localState.tokenAccountEditor.label.trim();
  const token = localState.tokenAccountEditor.token.trim();

  if (label === "" || token === "") {
    return {
      errorMessage: "Both label and token are required.",
      ok: false,
    };
  }

  return {
    label,
    ok: true,
    token,
  };
};

export {
  appendClaudeTokenAccountEditorText,
  cancelClaudeTokenAccountEditor,
  closeClaudeTokenAccountEditor,
  createClaudeTokenAccountEditorState,
  deleteClaudeTokenAccountEditorText,
  openClaudeTokenAccountEditor,
  readClaudeTokenAccountEditorSubmission,
  resolveClaudeTokenAccountEditorKeyAction,
  setClaudeTokenAccountEditorError,
  switchClaudeTokenAccountEditorField,
  type ClaudeTokenAccountEditorKeyAction,
};
