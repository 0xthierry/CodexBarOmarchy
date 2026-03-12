import { expect, test } from "bun:test";
import type { RuntimeCommandResult } from "../../src/runtime/host.ts";
import { activateTrayTui, createOmarchyTerminalLaunchCommand, findMatchingHyprlandClientAddress, parseHyprlandClientsJson } from '../../src/tray/launcher.ts';
import type { TrayLauncherHost } from '../../src/tray/launcher.ts';

interface CommandRecord {
  args: string[];
  command: string;
}

const createCommandResult = (input: Partial<RuntimeCommandResult> = {}): RuntimeCommandResult => ({
  exitCode: input.exitCode ?? 0,
  stderr: input.stderr ?? "",
  stdout: input.stdout ?? "",
});

const createLauncherHostFixture = (
  commandResults: Record<string, RuntimeCommandResult>,
  whichResults: Record<string, string | null> = {
    bun: "/usr/bin/bun",
    hyprctl: "/usr/bin/hyprctl",
    "uwsm-app": "/usr/bin/uwsm-app",
    "xdg-terminal-exec": "/usr/bin/xdg-terminal-exec",
  },
): {
  host: TrayLauncherHost;
  runRecords: CommandRecord[];
  spawnRecords: CommandRecord[];
} => {
  const runRecords: CommandRecord[] = [];
  const spawnRecords: CommandRecord[] = [];

  return {
    host: {
      runCommand: async (command: string, args: string[]): Promise<RuntimeCommandResult> => {
        const key = `${command} ${args.join(" ")}`.trim();
        runRecords.push({ args, command });
        return (
          commandResults[key] ??
          createCommandResult({
            exitCode: 1,
            stderr: `No fake command result registered for ${key}.`,
          })
        );
      },
      spawnDetached: async (command: string, args: string[]): Promise<void> => {
        spawnRecords.push({ args, command });
      },
      whichCommand: async (command: string): Promise<string | null> =>
        whichResults[command] ?? null,
    },
    runRecords,
    spawnRecords,
  };
};

test("findMatchingHyprlandClientAddress prefers class and initialClass over title", () => {
  expect(
    findMatchingHyprlandClientAddress([
      {
        address: "0x1",
        className: null,
        initialClassName: null,
        title: "org.omarchy.agent-stats",
      },
      {
        address: "0x2",
        className: "org.omarchy.agent-stats",
        initialClassName: null,
        title: "something else",
      },
    ]),
  ).toBe("0x2");
});

test("parseHyprlandClientsJson rejects malformed JSON", () => {
  expect(() => parseHyprlandClientsJson("{")).toThrow(
    "Failed to parse `hyprctl clients -j` output as JSON.",
  );
});

test("createOmarchyTerminalLaunchCommand wraps the repo-local tui target with Omarchy's launcher path", () => {
  expect(
    createOmarchyTerminalLaunchCommand({
      args: ["run", "--cwd", "/repo", "tui"],
      command: "bun",
    }),
  ).toEqual({
    args: [
      "--",
      "xdg-terminal-exec",
      "--app-id=org.omarchy.agent-stats",
      "-e",
      "bun",
      "run",
      "--cwd",
      "/repo",
      "tui",
    ],
    command: "uwsm-app",
  });
});

test("activateTrayTui focuses an existing matching client", async () => {
  const { host, runRecords, spawnRecords } = createLauncherHostFixture({
    "hyprctl clients -j": createCommandResult({
      stdout: JSON.stringify([
        {
          address: "0xabc",
          class: "org.omarchy.agent-stats",
          title: "agent-stats",
        },
      ]),
    }),
    "hyprctl dispatch focuswindow address:0xabc": createCommandResult(),
  });

  await activateTrayTui(host);

  expect(runRecords).toEqual([
    {
      args: ["clients", "-j"],
      command: "hyprctl",
    },
    {
      args: ["dispatch", "focuswindow", "address:0xabc"],
      command: "hyprctl",
    },
  ]);
  expect(spawnRecords).toEqual([]);
});

test("activateTrayTui launches the TUI when no matching client exists", async () => {
  const { host, runRecords, spawnRecords } = createLauncherHostFixture({
    "hyprctl clients -j": createCommandResult({
      stdout: JSON.stringify([
        {
          address: "0xdef",
          class: "kitty",
          title: "shell",
        },
      ]),
    }),
  });

  await activateTrayTui(host, {
    launchTarget: {
      args: ["run", "--cwd", "/repo", "tui"],
      command: "bun",
    },
  });

  expect(runRecords).toEqual([
    {
      args: ["clients", "-j"],
      command: "hyprctl",
    },
  ]);
  expect(spawnRecords).toEqual([
    {
      args: [
        "--",
        "xdg-terminal-exec",
        "--app-id=org.omarchy.agent-stats",
        "-e",
        "bun",
        "run",
        "--cwd",
        "/repo",
        "tui",
      ],
      command: "uwsm-app",
    },
  ]);
});

test("activateTrayTui fails clearly when hyprctl is unavailable", async () => {
  const { host } = createLauncherHostFixture(
    {},
    {
      bun: "/usr/bin/bun",
      hyprctl: null,
      "uwsm-app": "/usr/bin/uwsm-app",
      "xdg-terminal-exec": "/usr/bin/xdg-terminal-exec",
    },
  );

  try {
    await activateTrayTui(host);
    throw new Error("Expected activateTrayTui to reject when hyprctl is unavailable.");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    expect(error.message).toBe("Required command 'hyprctl' is not available on PATH.");
  }
});

test("activateTrayTui surfaces detached launch failures", async () => {
  const { runRecords } = createLauncherHostFixture({
    "hyprctl clients -j": createCommandResult({
      stdout: "[]",
    }),
  });
  const launchError = new Error("spawn uwsm-app EACCES");

  const host: TrayLauncherHost = {
    runCommand: async (command: string, args: string[]): Promise<RuntimeCommandResult> => {
      const key = `${command} ${args.join(" ")}`.trim();
      runRecords.push({ args, command });
      return key === "hyprctl clients -j"
        ? createCommandResult({
            stdout: "[]",
          })
        : createCommandResult({
            exitCode: 1,
            stderr: `Unexpected command ${key}`,
          });
    },
    spawnDetached: async (): Promise<void> => {
      throw launchError;
    },
    whichCommand: async (): Promise<string | null> => "/usr/bin/fake",
  };

  try {
    await activateTrayTui(host, {
      launchTarget: {
        args: ["run", "--cwd", "/repo", "tui"],
        command: "bun",
      },
    });
    throw new Error("Expected activateTrayTui to reject when the detached launch fails.");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    expect(error.message).toBe("spawn uwsm-app EACCES");
  }
});
