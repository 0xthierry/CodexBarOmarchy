import {
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  TextRenderable,
} from "@opentui/core";
import { createTuiViewModel } from "@/ui/tui/presenter.ts";
import type { OmarchyTheme } from "@/ui/tui/types.ts";
import type { TuiController } from "@/ui/tui/controller.ts";
import type { CliRenderer } from "@opentui/core";

interface MountedTuiApp {
  destroy: () => void;
}

interface MountOpenTuiAppOptions {
  controller: TuiController;
  renderer: CliRenderer;
  theme: OmarchyTheme;
}

const liveClockRefreshIntervalMs = 1000;

const mountOpenTuiApp = (options: MountOpenTuiAppOptions): MountedTuiApp => {
  const shell = new BoxRenderable(options.renderer, {
    backgroundColor: options.theme.background,
    flexDirection: "column",
    height: "100%",
    width: "100%",
  });
  const headerBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color5,
    flexDirection: "column",
    height: 6,
    title: "agent-stats",
    width: "100%",
  });
  const tabs = new TabSelectRenderable(options.renderer, {
    focusedBackgroundColor: options.theme.background,
    focusedTextColor: options.theme.foreground,
    selectedBackgroundColor: options.theme.color2,
    selectedTextColor: options.theme.background,
    showDescription: false,
    showUnderline: true,
    textColor: options.theme.foreground,
    width: "100%",
    wrapSelection: true,
  });
  const headerText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    height: 3,
    width: "100%",
    wrapMode: "word",
  });
  const body = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    flexGrow: 1,
    width: "100%",
  });
  const leftColumn = new BoxRenderable(options.renderer, {
    flexDirection: "column",
    width: "54%",
  });
  const rightColumn = new BoxRenderable(options.renderer, {
    flexDirection: "column",
    width: "46%",
  });
  const usageBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color4,
    flexGrow: 1,
    title: "usage",
    width: "100%",
  });
  const usageContent = new BoxRenderable(options.renderer, {
    flexDirection: "column",
    height: "100%",
    width: "100%",
  });
  const usageScroll = new ScrollBoxRenderable(options.renderer, {
    backgroundColor: options.theme.background,
    flexGrow: 1,
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const usageText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    width: "100%",
    wrapMode: "word",
  });
  const usageStatusBox = new BoxRenderable(options.renderer, {
    height: 1,
    paddingX: 1,
    visible: false,
    width: "100%",
  });
  const usageStatusText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.color3,
    height: 1,
    width: "100%",
    wrapMode: "word",
  });
  const detailsBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.accent,
    height: 9,
    title: "details",
    width: "100%",
  });
  const detailsScroll = new ScrollBoxRenderable(options.renderer, {
    backgroundColor: options.theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const detailsText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    width: "100%",
    wrapMode: "word",
  });
  const configBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color2,
    flexGrow: 1,
    title: "config",
    width: "100%",
  });
  const configScroll = new ScrollBoxRenderable(options.renderer, {
    backgroundColor: options.theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const configText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    width: "100%",
    wrapMode: "word",
  });
  const menuBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color1,
    height: 6,
    title: "menu",
    width: "100%",
  });
  const menuScroll = new ScrollBoxRenderable(options.renderer, {
    backgroundColor: options.theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const menuText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    width: "100%",
    wrapMode: "word",
  });
  const footerText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.color8,
    height: 1,
    width: "100%",
    wrapMode: "none",
  });
  const modalOverlay = new BoxRenderable(options.renderer, {
    alignItems: "center",
    backgroundColor: options.theme.background,
    height: "100%",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: 0,
    visible: false,
    width: "100%",
    zIndex: 40,
  });
  const modalBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color2,
    flexDirection: "column",
    height: "72%",
    title: "settings",
    width: "72%",
  });
  const modalHeaderText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    height: 3,
    width: "100%",
    wrapMode: "word",
  });
  const modalBody = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    flexGrow: 1,
    width: "100%",
  });
  const modalItemsBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color2,
    title: "items",
    width: "44%",
  });
  const modalItems = new SelectRenderable(options.renderer, {
    descriptionColor: options.theme.color8,
    focusedBackgroundColor: options.theme.background,
    focusedTextColor: options.theme.foreground,
    height: "100%",
    itemSpacing: 1,
    selectedBackgroundColor: options.theme.color2,
    selectedDescriptionColor: options.theme.background,
    selectedTextColor: options.theme.background,
    showDescription: true,
    showScrollIndicator: true,
    textColor: options.theme.foreground,
    width: "100%",
    wrapSelection: true,
  });
  const modalDetailColumn = new BoxRenderable(options.renderer, {
    flexDirection: "column",
    flexGrow: 1,
    width: "56%",
  });
  const modalDetailBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color4,
    flexGrow: 1,
    title: "detail",
    width: "100%",
  });
  const modalDetailScroll = new ScrollBoxRenderable(options.renderer, {
    backgroundColor: options.theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const modalDetailText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.foreground,
    width: "100%",
    wrapMode: "word",
  });
  const modalChoicesBox = new BoxRenderable(options.renderer, {
    border: true,
    borderColor: options.theme.color3,
    height: 11,
    title: "choices",
    visible: false,
    width: "100%",
  });
  const modalChoices = new SelectRenderable(options.renderer, {
    descriptionColor: options.theme.color8,
    focusedBackgroundColor: options.theme.background,
    focusedTextColor: options.theme.foreground,
    height: "100%",
    itemSpacing: 1,
    selectedBackgroundColor: options.theme.color3,
    selectedDescriptionColor: options.theme.background,
    selectedTextColor: options.theme.background,
    showDescription: true,
    showScrollIndicator: true,
    textColor: options.theme.foreground,
    width: "100%",
    wrapSelection: true,
  });
  const modalFooterText = new TextRenderable(options.renderer, {
    content: "",
    fg: options.theme.color8,
    height: 1,
    width: "100%",
    wrapMode: "word",
  });

  options.renderer.root.add(shell);
  headerBox.add(headerText);
  headerBox.add(tabs);
  usageScroll.add(usageText);
  usageStatusBox.add(usageStatusText);
  usageContent.add(usageScroll);
  usageContent.add(usageStatusBox);
  usageBox.add(usageContent);
  detailsScroll.add(detailsText);
  detailsBox.add(detailsScroll);
  configScroll.add(configText);
  configBox.add(configScroll);
  menuScroll.add(menuText);
  menuBox.add(menuScroll);
  modalItemsBox.add(modalItems);
  modalDetailScroll.add(modalDetailText);
  modalDetailBox.add(modalDetailScroll);
  modalChoicesBox.add(modalChoices);
  modalDetailColumn.add(modalDetailBox);
  modalDetailColumn.add(modalChoicesBox);
  modalBody.add(modalItemsBox);
  modalBody.add(modalDetailColumn);
  modalBox.add(modalHeaderText);
  modalBox.add(modalBody);
  modalBox.add(modalFooterText);
  modalOverlay.add(modalBox);
  leftColumn.add(usageBox);
  rightColumn.add(detailsBox);
  rightColumn.add(configBox);
  body.add(leftColumn);
  body.add(rightColumn);
  shell.add(headerBox);
  shell.add(body);
  shell.add(menuBox);
  shell.add(footerText);
  shell.add(modalOverlay);

  const render = (): void => {
    const snapshot = options.controller.getSnapshot();
    const viewModel = createTuiViewModel(snapshot.state, snapshot.localState);

    headerText.content = viewModel.headerLines.join("\n");
    tabs.setOptions(
      viewModel.tabs.map((tab) => ({
        description: tab.enabled ? "enabled" : "disabled",
        name: tab.label,
        value: tab.id,
      })),
    );

    const selectedTabIndex = viewModel.tabs.findIndex((tab) => tab.selected);

    if (selectedTabIndex !== -1 && tabs.getSelectedIndex() !== selectedTabIndex) {
      tabs.setSelectedIndex(selectedTabIndex);
    }

    usageText.content = viewModel.usageLines.join("\n");
    usageStatusBox.visible = viewModel.usageStatusLine !== null;
    usageStatusText.content = viewModel.usageStatusLine ?? "";
    detailsText.content = viewModel.detailsLines.join("\n");
    configText.content = viewModel.configLines.join("\n");
    menuText.content = viewModel.menuLines.join("\n");
    footerText.content = viewModel.footer;

    if (viewModel.modal === null) {
      modalOverlay.visible = false;
      modalChoicesBox.visible = false;
      options.renderer.requestRender();
      return;
    }

    modalOverlay.visible = true;
    modalBox.title = viewModel.modal.title;
    modalHeaderText.content = viewModel.modal.subtitleLines.join("\n");
    modalItems.options = viewModel.modal.settingsItems.map((item) => ({
      description: item.note,
      name: `${"  ".repeat(item.indentLevel)}${item.label}`,
      value: item.id,
    }));

    if (modalItems.getSelectedIndex() !== viewModel.modal.selectedItemIndex) {
      modalItems.setSelectedIndex(viewModel.modal.selectedItemIndex);
    }

    modalDetailText.content =
      viewModel.modal.editorLines.length > 0
        ? viewModel.modal.editorLines.join("\n")
        : viewModel.modal.detailLines.join("\n");
    modalChoices.options = viewModel.modal.choices.map((choice) => ({
      description: choice.value,
      name: choice.label,
      value: choice.value,
    }));

    if (modalChoices.getSelectedIndex() !== viewModel.modal.selectedChoiceIndex) {
      modalChoices.setSelectedIndex(viewModel.modal.selectedChoiceIndex);
    }

    modalChoicesBox.visible = viewModel.modal.choices.length > 0;
    modalFooterText.content = viewModel.modal.footer;

    if (viewModel.modal.focus === "choices" && viewModel.modal.choices.length > 0) {
      modalChoices.focus();
    } else if (viewModel.modal.focus === "items") {
      modalItems.focus();
    }

    options.renderer.requestRender();
  };

  const unsubscribe = options.controller.subscribe(() => {
    render();
  });
  const clockInterval = setInterval(() => {
    render();
  }, liveClockRefreshIntervalMs);

  options.renderer.keyInput.on("keypress", (key) => {
    const wasHandled = options.controller.handleKeyPress({
      ctrl: key.ctrl,
      meta: key.meta,
      name: key.name,
      sequence: key.sequence,
      shift: key.shift,
    });

    if (wasHandled) {
      key.preventDefault();
      render();
    }
  });

  tabs.on(
    TabSelectRenderableEvents.SELECTION_CHANGED,
    (_index: number, option?: { value?: unknown }) => {
      if (option?.value === "claude" || option?.value === "codex" || option?.value === "gemini") {
        void options.controller.selectProvider(option.value);
      }
    },
  );

  modalItems.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    options.controller.setSelectedSettingsIndex(index);
  });

  modalItems.on(SelectRenderableEvents.ITEM_SELECTED, () => {
    void options.controller.activateSelectedSettingsItem();
  });

  modalChoices.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    options.controller.setSelectedChoiceIndex(index);
  });

  modalChoices.on(SelectRenderableEvents.ITEM_SELECTED, () => {
    void options.controller.applySelectedChoice();
  });

  render();
  tabs.focus();

  return {
    destroy: (): void => {
      clearInterval(clockInterval);
      unsubscribe();
      shell.destroyRecursively();
    },
  };
};

export { mountOpenTuiApp, type MountedTuiApp };
