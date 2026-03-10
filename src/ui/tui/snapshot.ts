import { findCurrentChoiceLabel } from "@/ui/tui/descriptors.ts";
import { humanizeValue } from "@/ui/tui/presenter.ts";
import type { TuiSettingsItemDescriptor, TuiViewModel } from "@/ui/tui/types.ts";

const formatModalItem = (
  item: TuiSettingsItemDescriptor,
  index: number,
  selectedItemIndex: number,
): string => {
  const marker = index === selectedItemIndex ? ">" : " ";
  const indent = "  ".repeat(item.indentLevel);

  return `${marker} ${indent}${item.label}: ${humanizeValue(findCurrentChoiceLabel(item))}`;
};

const renderTuiSnapshot = (viewModel: TuiViewModel): string => {
  const lines = [
    viewModel.title,
    viewModel.tabs.map((tab) => (tab.selected ? `[${tab.label}]` : tab.label)).join("  "),
    ...viewModel.headerLines,
    "",
    "usage",
    ...viewModel.usageLines,
    "",
    "details",
    ...viewModel.detailsLines,
    "",
    "config",
    ...viewModel.configLines,
    "",
    "menu",
    ...viewModel.menuLines,
    "",
    "footer",
    viewModel.footer,
  ];

  if (viewModel.modal !== null) {
    lines.push(
      "",
      "settings modal",
      viewModel.modal.title,
      ...viewModel.modal.subtitleLines,
      "",
      "items",
      ...viewModel.modal.settingsItems.map((item, index) =>
        formatModalItem(item, index, viewModel.modal?.selectedItemIndex ?? 0),
      ),
      "",
      "detail",
      ...(viewModel.modal.editorLines.length > 0
        ? viewModel.modal.editorLines
        : viewModel.modal.detailLines),
      ...(viewModel.modal.choices.length === 0
        ? []
        : [
            "",
            "choices",
            ...viewModel.modal.choices.map((choice, index) => {
              const marker = index === viewModel.modal?.selectedChoiceIndex ? ">" : " ";

              return `${marker} ${choice.label}`;
            }),
          ]),
      "",
      viewModel.modal.footer,
    );
  }

  return lines.join("\n");
};

export { renderTuiSnapshot };
