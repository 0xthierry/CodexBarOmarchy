import { expect, test } from "bun:test";
import { explicitNull } from "../../src/core/providers/shared.ts";
import type {
  RuntimeHost,
  RuntimeHttpRequestOptions,
  RuntimeHttpResponse,
} from "../../src/runtime/host.ts";
import {
  fetchProviderServiceStatus,
  loadProviderServiceStatus,
  loadWorkspaceStatusBundle,
  tryFetchProviderServiceStatus,
  tryFetchWorkspaceStatusBundle,
} from "../../src/runtime/providers/service-status.ts";

interface HttpRequestRecord {
  options: RuntimeHttpRequestOptions | undefined;
  url: string;
}

const createJsonResponse = (body: unknown, statusCode = 200): RuntimeHttpResponse => ({
  bodyText: JSON.stringify(body),
  headers: {
    "content-type": "application/json",
  },
  statusCode,
});

const createHostFixture = (
  responses: Record<string, RuntimeHttpResponse[]>,
): {
  host: RuntimeHost;
  httpRequests: HttpRequestRecord[];
} => {
  const httpRequests: HttpRequestRecord[] = [];

  const host: RuntimeHost = {
    commands: {
      createLineSession: async (): Promise<never> => {
        throw new Error("Not implemented in service status tests.");
      },
      run: async (): Promise<never> => {
        throw new Error("Not implemented in service status tests.");
      },
      which: async (): Promise<string | null> => explicitNull,
    },
    env: {},
    fileSystem: {
      fileExists: async (): Promise<boolean> => false,
      readTextFile: async (): Promise<never> => {
        throw new Error("Not implemented in service status tests.");
      },
      realPath: async (): Promise<never> => {
        throw new Error("Not implemented in service status tests.");
      },
      writeTextFile: async (): Promise<void> => {
        throw new Error("Not implemented in service status tests.");
      },
    },
    homeDirectory: "/tmp/service-status-test",
    http: {
      request: async (
        url: string,
        options: RuntimeHttpRequestOptions = {},
      ): Promise<RuntimeHttpResponse> => {
        const method = options.method ?? "GET";
        const responseQueue = responses[`${method} ${url}`];

        httpRequests.push({ options, url });

        if (responseQueue === undefined || responseQueue.length === 0) {
          throw new Error(`No fake HTTP response registered for ${method} ${url}.`);
        }

        const response = responseQueue.shift();

        if (response === undefined) {
          throw new Error(`No fake HTTP response registered for ${method} ${url}.`);
        }

        return response;
      },
    },
    now: (): Date => new Date("2026-03-12T12:00:00.000Z"),
    openPath: async (): Promise<void> => {
      throw new Error("Not implemented in service status tests.");
    },
    spawnTerminal: async (): Promise<void> => {
      throw new Error("Not implemented in service status tests.");
    },
  };

  return { host, httpRequests };
};

test("fetchProviderServiceStatus parses Statuspage snapshots", async () => {
  const { host, httpRequests } = createHostFixture({
    "GET https://status.example.com/api/v2/status.json": [
      createJsonResponse({
        page: {
          updated_at: "2026-03-11T09:15:00Z",
        },
        status: {
          description: "Partial outage",
          indicator: "major",
        },
      }),
    ],
  });

  const serviceStatus = await fetchProviderServiceStatus(host, {
    baseUrl: "https://status.example.com/",
    kind: "statuspage",
  });

  expect(serviceStatus).toEqual({
    description: "Partial outage",
    indicator: "major",
    updatedAt: "2026-03-11T09:15:00.000Z",
  });
  expect(httpRequests).toEqual([
    {
      options: {
        method: "GET",
        timeoutMs: 10_000,
      },
      url: "https://status.example.com/api/v2/status.json",
    },
  ]);
});

test("tryFetchWorkspaceStatusBundle filters incidents to the product and selects the highest severity", async () => {
  const { host } = createHostFixture({
    "GET https://www.google.com/appsstatus/dashboard/incidents.json": [
      createJsonResponse([
        {
          begin: "2026-03-10T10:00:00Z",
          currently_affected_products: [{ id: "gemini" }],
          end: null,
          external_desc: "Minor issue",
          modified: "2026-03-10T11:00:00Z",
          most_recent_update: {
            status: "SERVICE_INFORMATION",
            text: "**Summary**\n- Minor issue",
            when: "2026-03-10T11:30:00Z",
          },
          severity: "low",
        },
        {
          begin: "2026-03-10T12:00:00Z",
          currently_affected_products: [{ id: "gemini" }],
          end: null,
          external_desc: "Outage",
          modified: "2026-03-10T12:30:00Z",
          most_recent_update: {
            status: "SERVICE_OUTAGE",
            text: "**Description**\n- API unavailable",
            when: "2026-03-10T13:00:00Z",
          },
          severity: "high",
        },
        {
          begin: "2026-03-10T14:00:00Z",
          currently_affected_products: [{ id: "other-product" }],
          end: null,
          external_desc: "Wrong product",
          modified: "2026-03-10T14:30:00Z",
          most_recent_update: {
            status: "SERVICE_OUTAGE",
            text: "**Summary**\n- Ignore me",
            when: "2026-03-10T15:00:00Z",
          },
          severity: "high",
        },
      ]),
    ],
  });

  const statusBundle = await tryFetchWorkspaceStatusBundle(host, "gemini");

  expect(statusBundle).toEqual({
    incidents: [
      {
        severity: "low",
        status: "SERVICE_INFORMATION",
        summary: "Minor issue",
        updatedAt: "2026-03-10T11:30:00.000Z",
      },
      {
        severity: "high",
        status: "SERVICE_OUTAGE",
        summary: "API unavailable",
        updatedAt: "2026-03-10T13:00:00.000Z",
      },
    ],
    serviceStatus: {
      description: "API unavailable",
      indicator: "critical",
      updatedAt: "2026-03-10T13:00:00.000Z",
    },
  });
});

test("tryFetchProviderServiceStatus returns null when the upstream response is invalid", async () => {
  const { host } = createHostFixture({
    "GET https://status.example.com/api/v2/status.json": [
      createJsonResponse({
        page: {
          updated_at: "2026-03-11T09:15:00Z",
        },
      }),
    ],
  });

  const serviceStatus = await tryFetchProviderServiceStatus(host, {
    baseUrl: "https://status.example.com",
    kind: "statuspage",
  });

  expect(serviceStatus).toBeNull();
});

test("loadProviderServiceStatus reports invalid payload separately from availability", async () => {
  const { host } = createHostFixture({
    "GET https://status.example.com/api/v2/status.json": [
      createJsonResponse({
        page: {
          updated_at: "2026-03-11T09:15:00Z",
        },
      }),
    ],
  });

  const result = await loadProviderServiceStatus(host, {
    baseUrl: "https://status.example.com",
    kind: "statuspage",
  });

  expect(result).toEqual({
    failureKind: "invalid_payload",
    message: "Statuspage response did not include a status object.",
    status: "unavailable",
  });
});

test("tryFetchWorkspaceStatusBundle returns empty defaults when the workspace payload is invalid", async () => {
  const { host } = createHostFixture({
    "GET https://www.google.com/appsstatus/dashboard/incidents.json": [
      createJsonResponse({
        incidents: [],
      }),
    ],
  });

  const statusBundle = await tryFetchWorkspaceStatusBundle(host, "gemini");

  expect(statusBundle).toEqual({
    incidents: [],
    serviceStatus: null,
  });
});

test("loadWorkspaceStatusBundle reports fetch failures separately from empty results", async () => {
  const { host } = createHostFixture({});

  const result = await loadWorkspaceStatusBundle(host, "gemini");

  expect(result).toEqual({
    failureKind: "fetch_failed",
    message:
      "No fake HTTP response registered for GET https://www.google.com/appsstatus/dashboard/incidents.json.",
    status: "unavailable",
  });
});
