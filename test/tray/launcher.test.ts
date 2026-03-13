import { expect, test } from "bun:test";
import type { RuntimeCommandResult } from "../../src/runtime/host.ts";
import {
  activateTrayTui,
  createOmarchyTerminalLaunchCommand,
  parseHyprlandClientsJson,
  planTrayActivation,
} from "../../src/tray/launcher.ts";
import type { TrayLauncherHost } from "../../src/tray/launcher.ts";

interface CommandRecord {
  args: string[];
  command: string;
}

const fakeBinaryPath = (binaryName: string): string => `test-bin/${binaryName}`;
const repoRoot = "test-fixtures/repo-root";
const repoLocalLaunchTarget = {
  args: ["run", "--cwd", repoRoot, "app", "tui"],
  command: "bun",
};

const createCommandResult = (input: Partial<RuntimeCommandResult> = {}): RuntimeCommandResult => ({
  exitCode: input.exitCode ?? 0,
  stderr: input.stderr ?? "",
  stdout: input.stdout ?? "",
});

const createLauncherHostFixture = (
  commandResults: Record<string, RuntimeCommandResult>,
  whichResults: Record<string, string | null> = {
    bun: fakeBinaryPath("bun"),
    hyprctl: fakeBinaryPath("hyprctl"),
    "uwsm-app": fakeBinaryPath("uwsm-app"),
    "xdg-terminal-exec": fakeBinaryPath("xdg-terminal-exec"),
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

test("planTrayActivation prefers class and initialClass matches over title matches", () => {
  expect(
    planTrayActivation([
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
  ).toEqual({
    address: "0x2",
    kind: "focus",
  });
});

test("parseHyprlandClientsJson rejects malformed JSON", () => {
  expect(() => parseHyprlandClientsJson("{")).toThrow(
    "Failed to parse `hyprctl clients -j` output as JSON.",
  );
});

test("parseHyprlandClientsJson rejects non-array JSON payloads", () => {
  expect(() => parseHyprlandClientsJson(JSON.stringify({ clients: [] }))).toThrow(
    "Expected `hyprctl clients -j` to return a JSON array.",
  );
});

test("parseHyprlandClientsJson normalizes missing or non-string client fields to null", () => {
  expect(
    parseHyprlandClientsJson(
      JSON.stringify([
        {
          address: "0xabc",
          class: 42,
          initialClass: "org.omarchy.agent-stats",
        },
      ]),
    ),
  ).toEqual([
    {
      address: "0xabc",
      className: null,
      initialClassName: "org.omarchy.agent-stats",
      title: null,
    },
  ]);
});

test("createOmarchyTerminalLaunchCommand wraps the repo-local tui target with Omarchy's launcher path", () => {
  expect(createOmarchyTerminalLaunchCommand(repoLocalLaunchTarget)).toEqual({
    args: [
      "--",
      "xdg-terminal-exec",
      "--app-id=org.omarchy.agent-stats",
      "-e",
      "bun",
      "run",
      "--cwd",
      repoRoot,
      "app",
      "tui",
    ],
    command: "uwsm-app",
  });
});

test("planTrayActivation returns a focus action when a matching client exists", () => {
  expect(
    planTrayActivation([
      {
        address: "0xabc",
        className: "org.omarchy.agent-stats",
        initialClassName: null,
        title: "agent-stats",
      },
    ]),
  ).toEqual({
    address: "0xabc",
    kind: "focus",
  });
});

test("planTrayActivation returns a launch action with the configured app id when no client matches", () => {
  expect(
    planTrayActivation(
      [
        {
          address: "0xdef",
          className: "kitty",
          initialClassName: null,
          title: "shell",
        },
      ],
      {
        appId: "org.omarchy.agent-stats.dev",
        launchTarget: repoLocalLaunchTarget,
      },
    ),
  ).toEqual({
    kind: "launch",
    launchCommand: {
      args: [
        "--",
        "xdg-terminal-exec",
        "--app-id=org.omarchy.agent-stats.dev",
        "-e",
        "bun",
        "run",
        "--cwd",
        repoRoot,
        "app",
        "tui",
      ],
      command: "uwsm-app",
    },
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
    launchTarget: repoLocalLaunchTarget,
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
        repoRoot,
        "app",
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
      bun: fakeBinaryPath("bun"),
      hyprctl: null,
      "uwsm-app": fakeBinaryPath("uwsm-app"),
      "xdg-terminal-exec": fakeBinaryPath("xdg-terminal-exec"),
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
    whichCommand: async (): Promise<string | null> => fakeBinaryPath("fake"),
  };

  try {
    await activateTrayTui(host, {
      launchTarget: repoLocalLaunchTarget,
    });
    throw new Error("Expected activateTrayTui to reject when the detached launch fails.");
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    expect(error.message).toBe("spawn uwsm-app EACCES");
  }
});
