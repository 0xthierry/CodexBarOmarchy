interface BrowserCookieRecord {
  browserId: LinuxBrowserId;
  host: string;
  name: string;
  path: string;
  profileName: string;
  sourcePath: string;
  value: string;
}

interface BrowserCookieQuery {
  browsers?: LinuxBrowserId[];
  domains: string[];
  names?: string[];
}

interface BrowserCookieStoreLocation {
  browserId: LinuxBrowserId;
  cookieDbPath: string;
  profileName: string;
}

type LinuxBrowserId = "brave" | "chrome" | "chromium" | "firefox";

export {
  type BrowserCookieQuery,
  type BrowserCookieRecord,
  type BrowserCookieStoreLocation,
  type LinuxBrowserId,
};
