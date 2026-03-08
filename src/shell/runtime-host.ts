/* eslint-disable import/no-nodejs-modules, max-lines, max-lines-per-function */

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { RuntimeCommandResult, RuntimeHost } from "@/runtime/host.ts";

const failedExitCode = 1;
const terminatedExitCode = 128;
const supportedTerminalCommands = [
  "x-terminal-emulator",
  "kitty",
  "alacritty",
  "gnome-terminal",
  "konsole",
  "wezterm",
  "footclient",
  "foot",
  "xterm",
] as const;

const getPathSegments = (): string[] => {
  const configuredPath = process.env["PATH"];

  if (typeof configuredPath !== "string" || configuredPath === "") {
    return [];
  }

  return configuredPath.split(delimiter).filter((segment) => segment !== "");
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);

    return true;
  } catch {
    return false;
  }
};

const canExecute = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.X_OK);

    return true;
  } catch {
    return false;
  }
};

const findExecutable = async (command: string): Promise<string | null> => {
  if (command.includes("/")) {
    return (await canExecute(command)) ? command : null;
  }

  for (const directoryPath of getPathSegments()) {
    const executablePath = join(directoryPath, command);

    if (await canExecute(executablePath)) {
      return executablePath;
    }
  }

  return null;
};

const quoteShellArgument = (value: string): string => `'${value.replaceAll("'", "'\"'\"'")}'`;

const formatCommandForShell = (command: string, args: string[]): string =>
  [command, ...args].map((segment) => quoteShellArgument(segment)).join(" ");

const runCommand = async (
  command: string,
  args: string[],
  options?: {
    input?: string;
    timeoutMs?: number;
  },
): Promise<RuntimeCommandResult> =>
  await new Promise<RuntimeCommandResult>((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "pipe",
    });
    const stderrChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];
    let finished = false;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    const finalize = (result: RuntimeCommandResult): void => {
      if (finished) {
        return;
      }

      finished = true;

      if (timeoutHandle !== null) {
        globalThis.clearTimeout(timeoutHandle);
      }

      resolve(result);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finalize({
        exitCode: failedExitCode,
        stderr: error.message,
        stdout: "",
      });
    });
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      finalize({
        exitCode: exitCode ?? (signal === null ? failedExitCode : terminatedExitCode),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      });
    });

    if (typeof options?.input === "string") {
      child.stdin.write(options.input);
    }

    child.stdin.end();

    if (typeof options?.timeoutMs === "number") {
      timeoutHandle = globalThis.setTimeout(() => {
        child.kill("SIGTERM");
        finalize({
          exitCode: terminatedExitCode,
          stderr: `Command timed out after ${options.timeoutMs}ms.`,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        });
      }, options.timeoutMs);
    }
  });

const createTerminalLaunchCommand = async (
  command: string,
  args: string[],
): Promise<{
  args: string[];
  command: string;
} | null> => {
  const preferredTerminal = process.env["TERMINAL"];
  const candidateCommands =
    typeof preferredTerminal === "string" && preferredTerminal !== ""
      ? [preferredTerminal, ...supportedTerminalCommands]
      : [...supportedTerminalCommands];
  const shellCommand = formatCommandForShell(command, args);

  for (const candidateCommand of candidateCommands) {
    const resolvedCommand = await findExecutable(candidateCommand);

    if (resolvedCommand === null) {
      continue;
    }

    if (candidateCommand === "gnome-terminal") {
      return {
        args: ["--", "sh", "-lc", shellCommand],
        command: resolvedCommand,
      };
    }

    if (candidateCommand === "footclient" || candidateCommand === "foot") {
      return {
        args: ["sh", "-lc", shellCommand],
        command: resolvedCommand,
      };
    }

    return {
      args: ["-e", "sh", "-lc", shellCommand],
      command: resolvedCommand,
    };
  }

  return null;
};

const spawnDetached = (command: string, args: string[]): void => {
  const child = spawn(command, args, {
    detached: true,
    env: process.env,
    stdio: "ignore",
  });

  child.unref();
};

const createRuntimeHost = (): RuntimeHost => ({
  commands: {
    run: runCommand,
    which: async (command: string) => await findExecutable(command),
  },
  env: process.env,
  fileSystem: {
    fileExists,
    readTextFile: async (filePath: string) => await readFile(filePath, "utf8"),
  },
  homeDirectory: process.env["HOME"] ?? "",
  now: () => new Date(),
  openPath: async (filePath: string) => {
    spawnDetached("xdg-open", [filePath]);
  },
  spawnTerminal: async (command: string, args: string[]) => {
    const terminalCommand = await createTerminalLaunchCommand(command, args);

    if (terminalCommand === null) {
      throw new Error("No supported terminal emulator is available on PATH.");
    }

    spawnDetached(terminalCommand.command, terminalCommand.args);
  },
});

export { createRuntimeHost };
