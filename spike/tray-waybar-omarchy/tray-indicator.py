#!/usr/bin/env /usr/bin/python3

import signal
import subprocess
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("AyatanaAppIndicator3", "0.1")

from gi.repository import AyatanaAppIndicator3, Gtk  # noqa: E402


SPIKE_DIR = Path(__file__).resolve().parent
LAUNCHER_PATH = SPIKE_DIR / "launch-or-focus-agent-stats.sh"
ICON_PATH = SPIKE_DIR / "agent-stats-tray.svg"
INDICATOR_ID = "agent-stats-spike"


def run_launcher(_: Gtk.MenuItem) -> None:
    subprocess.Popen([str(LAUNCHER_PATH)])


def quit_indicator(_: Gtk.MenuItem) -> None:
    Gtk.main_quit()


def create_menu() -> Gtk.Menu:
    menu = Gtk.Menu()

    open_item = Gtk.MenuItem(label="Open agent-stats")
    open_item.connect("activate", run_launcher)
    menu.append(open_item)

    separator = Gtk.SeparatorMenuItem()
    menu.append(separator)

    quit_item = Gtk.MenuItem(label="Quit tray spike")
    quit_item.connect("activate", quit_indicator)
    menu.append(quit_item)

    menu.show_all()
    return menu


def create_indicator() -> AyatanaAppIndicator3.Indicator:
    indicator = AyatanaAppIndicator3.Indicator.new(
        INDICATOR_ID,
        str(ICON_PATH),
        AyatanaAppIndicator3.IndicatorCategory.APPLICATION_STATUS,
    )
    indicator.set_title("agent-stats")
    indicator.set_status(AyatanaAppIndicator3.IndicatorStatus.ACTIVE)
    indicator.set_icon_full(str(ICON_PATH), "agent-stats tray spike")
    indicator.set_menu(create_menu())
    return indicator


def main() -> None:
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    indicator = create_indicator()
    Gtk.main()
    _ = indicator


if __name__ == "__main__":
    main()
