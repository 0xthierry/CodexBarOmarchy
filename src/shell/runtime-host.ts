import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, realpath, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type {
  RuntimeCommandLineSession,
  RuntimeCommandResult,
  RuntimeHost,
  RuntimeHttpRequestOptions,
} from "@/runtime/host.ts";

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
  new Promise<RuntimeCommandResult>((resolve) => {
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

const createCommandLineSession = async (
  command: string,
  args: string[],
): Promise<RuntimeCommandLineSession> => {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "pipe",
  });
  const lineQueue: string[] = [];
  const pendingReaders: ((line: string | null) => void)[] = [];
  let buffer = "";
  let closed = false;

  const flushLine = (line: string): void => {
    const pendingReader = pendingReaders.shift();

    if (pendingReader !== undefined) {
      pendingReader(line);

      return;
    }

    lineQueue.push(line);
  };

  const flushPendingReaders = (): void => {
    while (pendingReaders.length > 0) {
      const pendingReader = pendingReaders.shift();

      pendingReader?.(null);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");

    while (true) {
      const lineBreakIndex = buffer.indexOf("\n");

      if (lineBreakIndex === -1) {
        return;
      }

      const line = buffer.slice(0, lineBreakIndex).replace(/\r$/, "");

      buffer = buffer.slice(lineBreakIndex + 1);
      flushLine(line);
    }
  });

  const finalize = (): void => {
    if (closed) {
      return;
    }

    closed = true;

    if (buffer !== "") {
      flushLine(buffer.replace(/\r$/, ""));
      buffer = "";
    }

    flushPendingReaders();
  };

  child.on("close", finalize);
  child.on("error", finalize);

  return {
    close: async (): Promise<void> => {
      if (closed) {
        return;
      }

      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.once("close", () => {
          resolve();
        });
      });
    },
    readLine: async (options?: { timeoutMs?: number }): Promise<string | null> => {
      if (lineQueue.length > 0) {
        return lineQueue.shift() ?? null;
      }

      if (closed) {
        return null;
      }

      return new Promise<string | null>((resolve) => {
        const reader = (line: string | null): void => {
          if (timeoutHandle !== null) {
            globalThis.clearTimeout(timeoutHandle);
          }

          resolve(line);
        };
        const timeoutHandle =
          typeof options?.timeoutMs === "number"
            ? globalThis.setTimeout(() => {
                const readerIndex = pendingReaders.indexOf(reader);

                if (readerIndex !== -1) {
                  pendingReaders.splice(readerIndex, 1);
                }

                resolve(null);
              }, options.timeoutMs)
            : null;

        pendingReaders.push(reader);
      });
    },
    writeLine: async (line: string): Promise<void> => {
      if (closed) {
        throw new Error("Command session is closed.");
      }

      child.stdin.write(`${line}\n`);
      await Promise.resolve();
    },
  };
};

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
    createLineSession: createCommandLineSession,
    run: runCommand,
    which: async (command: string) => findExecutable(command),
  },
  env: process.env,
  fileSystem: {
    fileExists,
    readTextFile: async (filePath: string) => readFile(filePath, "utf8"),
    realPath: async (filePath: string) => realpath(filePath),
    writeTextFile: async (filePath: string, contents: string) => {
      await writeFile(filePath, contents, "utf8");
    },
  },
  homeDirectory: process.env["HOME"] ?? "",
  http: {
    request: async (url: string, options: RuntimeHttpRequestOptions = {}) => {
      const abortController = new AbortController();
      const { timeoutMs } = options;
      const timeoutHandle =
        typeof timeoutMs === "number"
          ? globalThis.setTimeout(() => {
              abortController.abort();
            }, timeoutMs)
          : null;

      try {
        const response = await fetch(url, {
          body: options.body ?? null,
          headers: options.headers ?? {},
          method: options.method ?? "GET",
          signal: abortController.signal,
        });

        return {
          bodyText: await response.text(),
          headers: Object.fromEntries(response.headers.entries()),
          statusCode: response.status,
        };
      } finally {
        if (timeoutHandle !== null) {
          globalThis.clearTimeout(timeoutHandle);
        }
      }
    },
  },
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
