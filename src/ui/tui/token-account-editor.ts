import type { TuiLocalState, TuiTokenAccountEditorState } from "@/ui/tui/types.ts";

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

export {
  appendClaudeTokenAccountEditorText,
  cancelClaudeTokenAccountEditor,
  closeClaudeTokenAccountEditor,
  createClaudeTokenAccountEditorState,
  deleteClaudeTokenAccountEditorText,
  openClaudeTokenAccountEditor,
  setClaudeTokenAccountEditorError,
  switchClaudeTokenAccountEditorField,
};
