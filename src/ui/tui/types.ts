import type { AppStoreState } from "@/core/store/state.ts";

type ProviderId = AppStoreState["selectedProviderId"];
type ProviderView = AppStoreState["providerViews"][number];

interface OmarchyTheme {
  accent: string;
  background: string;
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  color8: string;
  cursor: string;
  foreground: string;
}

interface ThemeCandidate {
  label: string;
  path: string;
}

interface TuiSettingsChoice {
  label: string;
  value: string;
}

interface TuiSettingsItemDescriptor {
  choices: TuiSettingsChoice[];
  currentValue: string;
  enabled: boolean;
  id: string;
  indentLevel: number;
  kind: "action" | "readonly" | "select" | "toggle";
  label: string;
  note: string;
}

interface TuiTokenAccountEditorState {
  errorMessage: string | null;
  field: "label" | "token";
  label: string;
  providerId: "claude";
  token: string;
}

type TuiModalFocus = "choices" | "editor" | "items";

interface TuiLocalState {
  footerMessage: string | null;
  isSettingsOpen: boolean;
  modalFocus: TuiModalFocus;
  quitRequested: boolean;
  selectedChoiceIndex: number;
  selectedSettingsIndex: number;
  tokenAccountEditor: TuiTokenAccountEditorState | null;
}

interface TuiKeyInput {
  ctrl: boolean;
  meta: boolean;
  name: string;
  sequence: string;
  shift: boolean;
}

interface TuiTabViewModel {
  enabled: boolean;
  id: ProviderId;
  label: string;
  selected: boolean;
}

interface TuiModalViewModel {
  choices: TuiSettingsChoice[];
  detailLines: string[];
  editorLines: string[];
  focus: TuiModalFocus;
  footer: string;
  selectedChoiceIndex: number;
  selectedItemIndex: number;
  settingsItems: TuiSettingsItemDescriptor[];
  subtitleLines: string[];
  title: string;
}

interface TuiViewModel {
  configLines: string[];
  detailsLines: string[];
  footer: string;
  headerLines: string[];
  menuLines: string[];
  modal: TuiModalViewModel | null;
  tabs: TuiTabViewModel[];
  title: string;
  usageLines: string[];
}

export {
  type OmarchyTheme,
  type ProviderId,
  type ProviderView,
  type ThemeCandidate,
  type TuiKeyInput,
  type TuiLocalState,
  type TuiModalFocus,
  type TuiModalViewModel,
  type TuiSettingsChoice,
  type TuiSettingsItemDescriptor,
  type TuiTabViewModel,
  type TuiTokenAccountEditorState,
  type TuiViewModel,
};
