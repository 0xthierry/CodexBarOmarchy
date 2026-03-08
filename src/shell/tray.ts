interface PopupController {
  toggle: () => boolean;
}

interface TrayLike {
  on: (eventName: "click", listener: () => void) => void;
  setToolTip: (text: string) => void;
}

const connectTrayToPopup = (
  tray: TrayLike,
  popupController: PopupController,
  toolTip = "Omarchy Agent Bar",
): void => {
  tray.setToolTip(toolTip);
  tray.on("click", () => {
    popupController.toggle();
  });
};

export { connectTrayToPopup, type TrayLike };
