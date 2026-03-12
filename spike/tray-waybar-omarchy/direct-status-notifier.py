#!/usr/bin/env /usr/bin/python3

import signal
import subprocess
from pathlib import Path

import dbus
import dbus.exceptions
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib


SPIKE_DIR = Path(__file__).resolve().parent
LAUNCHER_PATH = SPIKE_DIR / "launch-or-focus-agent-stats.sh"
ICON_PATH = SPIKE_DIR / "agent-stats-tray.svg"
BUS_NAME = "org.omarchy.AgentStatsTraySpike"
OBJECT_PATH = "/StatusNotifierItem"
ITEM_INTERFACE = "org.kde.StatusNotifierItem"
PROPERTIES_INTERFACE = "org.freedesktop.DBus.Properties"
WATCHER_BUS_NAME = "org.kde.StatusNotifierWatcher"
WATCHER_OBJECT_PATH = "/StatusNotifierWatcher"
WATCHER_INTERFACE = "org.kde.StatusNotifierWatcher"


def run_launcher() -> None:
    subprocess.Popen([str(LAUNCHER_PATH)])


class AgentStatsStatusNotifierItem(dbus.service.Object):
    def __init__(self, bus: dbus.SessionBus) -> None:
        self.bus_name = dbus.service.BusName(BUS_NAME, bus=bus)
        super().__init__(self.bus_name, OBJECT_PATH)
        self.properties = {
            "AttentionAccessibleDesc": "",
            "AttentionIconName": "",
            "Category": "ApplicationStatus",
            "IconAccessibleDesc": "agent-stats tray spike",
            "IconName": str(ICON_PATH),
            "IconThemePath": "",
            "Id": "agent-stats-spike-direct",
            "Menu": dbus.ObjectPath("/NO_DBUSMENU"),
            "Status": "Active",
            "Title": "agent-stats",
            "WindowId": dbus.UInt32(0),
        }

    @dbus.service.method(ITEM_INTERFACE, in_signature="ii", out_signature="")
    def Activate(self, x: int, y: int) -> None:
        _ = (x, y)
        run_launcher()

    @dbus.service.method(ITEM_INTERFACE, in_signature="ii", out_signature="")
    def ContextMenu(self, x: int, y: int) -> None:
        _ = (x, y)

    @dbus.service.method(ITEM_INTERFACE, in_signature="ii", out_signature="")
    def SecondaryActivate(self, x: int, y: int) -> None:
        _ = (x, y)
        run_launcher()

    @dbus.service.method(ITEM_INTERFACE, in_signature="is", out_signature="")
    def Scroll(self, delta: int, orientation: str) -> None:
        _ = (delta, orientation)

    @dbus.service.method(PROPERTIES_INTERFACE, in_signature="ss", out_signature="v")
    def Get(self, interface_name: str, property_name: str):
        if interface_name != ITEM_INTERFACE:
            raise dbus.exceptions.DBusException(
                "org.freedesktop.DBus.Error.InvalidArgs",
                f"Unknown interface {interface_name}.",
            )

        if property_name not in self.properties:
            raise dbus.exceptions.DBusException(
                "org.freedesktop.DBus.Error.InvalidArgs",
                f"Unknown property {property_name}.",
            )

        return self.properties[property_name]

    @dbus.service.method(PROPERTIES_INTERFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface_name: str):
        if interface_name != ITEM_INTERFACE:
            return {}

        return self.properties

    @dbus.service.method(PROPERTIES_INTERFACE, in_signature="ssv", out_signature="")
    def Set(self, interface_name: str, property_name: str, value) -> None:
        _ = (interface_name, property_name, value)
        raise dbus.exceptions.DBusException(
            "org.freedesktop.DBus.Error.PropertyReadOnly",
            "Status notifier item properties are read-only.",
        )


def register_status_notifier_item(bus: dbus.SessionBus) -> None:
    watcher = bus.get_object(WATCHER_BUS_NAME, WATCHER_OBJECT_PATH)
    watcher_interface = dbus.Interface(watcher, WATCHER_INTERFACE)
    watcher_interface.RegisterStatusNotifierItem(OBJECT_PATH)


def main() -> None:
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    item = AgentStatsStatusNotifierItem(bus)
    register_status_notifier_item(bus)
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    loop = GLib.MainLoop()
    _ = item
    loop.run()


if __name__ == "__main__":
    main()
