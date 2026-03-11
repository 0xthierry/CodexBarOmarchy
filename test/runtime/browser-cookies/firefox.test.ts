import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listFirefoxCookieStores,
  parseFirefoxProfilesIni,
} from "../../../src/runtime/browser-cookies/discovery.ts";

test("parses Firefox profiles.ini and keeps profile paths in declaration order", () => {
  const contents = `
[Profile0]
Name=default-release
Path=aaaa.default-release

[Profile1]
Name=work
Path=bbbb.work
`;

  expect(parseFirefoxProfilesIni(contents)).toEqual(["aaaa.default-release", "bbbb.work"]);
});

test("discovers Firefox cookie stores from profiles.ini-backed directories", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-firefox-home-"));
  const firefoxRoot = join(homeDirectory, ".config", "mozilla", "firefox");
  const firstProfilePath = join(firefoxRoot, "aaaa.default-release");
  const secondProfilePath = join(firefoxRoot, "bbbb.work");

  try {
    await mkdir(firstProfilePath, { recursive: true });
    await mkdir(secondProfilePath, { recursive: true });
    await writeFile(
      join(firefoxRoot, "profiles.ini"),
      `
[Profile0]
Name=default-release
Path=aaaa.default-release

[Profile1]
Name=work
Path=bbbb.work
`,
      "utf8",
    );
    await writeFile(join(firstProfilePath, "cookies.sqlite"), "", "utf8");
    await writeFile(join(secondProfilePath, "cookies.sqlite"), "", "utf8");

    const locations = await listFirefoxCookieStores(homeDirectory);

    expect(locations).toEqual([
      {
        browserId: "firefox",
        cookieDbPath: join(firstProfilePath, "cookies.sqlite"),
        profileName: "aaaa.default-release",
      },
      {
        browserId: "firefox",
        cookieDbPath: join(secondProfilePath, "cookies.sqlite"),
        profileName: "bbbb.work",
      },
    ]);
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});
