import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createInitialLocalState } from "@/ui/tui/controller.ts";
import { resolveTuiControllerKeyAction } from "@/ui/tui/key-routing.ts";
import type { TuiKeyInput, TuiLocalState } from "@/ui/tui/types.ts";

const createKey = (name: string, sequence = name): TuiKeyInput => ({
  ctrl: false,
  meta: false,
  name,
  sequence,
  shift: false,
});

const createLocalState = (overrides: Partial<TuiLocalState> = {}): TuiLocalState => ({
  ...createInitialLocalState(),
  ...overrides,
});

const {providerViews} = createAppStoreState(createDefaultConfig());

test("maps ctrl-c to requestQuit", () => {
  const action = resolveTuiControllerKeyAction({
    key: {
      ...createKey("c", "\u0003"),
      ctrl: true,
    },
    localState: createLocalState(),
    providerViews,
  });

  expect(action).toEqual({ type: "requestQuit" });
});

test("suppresses provider navigation shortcuts while settings are open", () => {
  const action = resolveTuiControllerKeyAction({
    key: createKey("2"),
    localState: createLocalState({
      isSettingsOpen: true,
    }),
    providerViews,
  });

  expect(action).toEqual({ type: "suppressNavigation" });
});

test("toggles modal focus with tab inside settings", () => {
  const itemFocusAction = resolveTuiControllerKeyAction({
    key: createKey("tab", "\t"),
    localState: createLocalState({
      isSettingsOpen: true,
    }),
    providerViews,
  });
  const choiceFocusAction = resolveTuiControllerKeyAction({
    key: createKey("tab", "\t"),
    localState: createLocalState({
      isSettingsOpen: true,
      modalFocus: "choices",
    }),
    providerViews,
  });

  expect(itemFocusAction).toEqual({ type: "focusModalChoices" });
  expect(choiceFocusAction).toEqual({ type: "focusModalItems" });
});

test("enters settings item activation from items and choice application from choices", () => {
  const itemAction = resolveTuiControllerKeyAction({
    key: createKey("enter", "\r"),
    localState: createLocalState({
      isSettingsOpen: true,
      modalFocus: "items",
    }),
    providerViews,
  });
  const choiceAction = resolveTuiControllerKeyAction({
    key: createKey("enter", "\r"),
    localState: createLocalState({
      isSettingsOpen: true,
      modalFocus: "choices",
    }),
    providerViews,
  });

  expect(itemAction).toEqual({ type: "activateSelectedSettingsItem" });
  expect(choiceAction).toEqual({ type: "applySelectedChoice" });
});

test("maps digit shortcuts to provider selection when settings are closed", () => {
  const action = resolveTuiControllerKeyAction({
    key: createKey("2"),
    localState: createLocalState(),
    providerViews,
  });

  expect(action).toEqual({
    providerId: "claude",
    type: "selectProvider",
  });
});
