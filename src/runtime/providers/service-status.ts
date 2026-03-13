import { explicitNull } from "@/core/providers/shared.ts";
import type {
  ProviderIncidentSnapshot,
  ProviderServiceStatusIndicator,
  ProviderServiceStatusSnapshot,
} from "@/core/store/runtime-state.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { isRecord, parseJsonText, readString } from "@/runtime/providers/shared.ts";

const googleWorkspaceIncidentsUrl = "https://www.google.com/appsstatus/dashboard/incidents.json";
const statusRequestTimeoutMs = 10_000;

type ProviderServiceStatusSource =
  | {
      baseUrl: string;
      componentName?: string;
      componentNames?: string[];
      componentNameIncludes?: string[];
      kind: "statuspage";
    }
  | {
      kind: "workspace";
      productId: string;
    };

const isProviderServiceStatusIndicator = (value: string): value is ProviderServiceStatusIndicator =>
  value === "none" ||
  value === "maintenance" ||
  value === "minor" ||
  value === "major" ||
  value === "critical" ||
  value === "unknown";

const normalizeStatusPageApiUrl = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/u, "")}/api/v2/status.json`;

const normalizeStatusPageSummaryApiUrl = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/u, "")}/api/v2/summary.json`;

const toIsoString = (value: string | null): string | null => {
  if (value === null) {
    return explicitNull;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.valueOf()) ? explicitNull : parsed.toISOString();
};

const createServiceStatusSnapshot = (
  indicator: ProviderServiceStatusIndicator,
  description: string | null,
  updatedAt: string | null,
): ProviderServiceStatusSnapshot => ({
  description,
  indicator,
  updatedAt,
});

const createWorkspaceIncidentSnapshot = (
  incident: WorkspaceIncident,
): ProviderIncidentSnapshot => ({
  severity: incident.severity,
  status: incident.updateStatus ?? incident.statusImpact,
  summary: extractWorkspaceSummary(incident.updateText ?? incident.summaryText),
  updatedAt: incident.updateWhen ?? incident.modified ?? incident.begin,
});

const fetchStatuspageServiceStatus = async (
  host: RuntimeHost,
  source: Extract<ProviderServiceStatusSource, { kind: "statuspage" }>,
): Promise<ProviderServiceStatusSnapshot> => {
  if (
    (typeof source.componentName === "string" && source.componentName.trim() !== "") ||
    (Array.isArray(source.componentNames) && source.componentNames.length > 0) ||
    (Array.isArray(source.componentNameIncludes) && source.componentNameIncludes.length > 0)
  ) {
    return fetchStatuspageComponentServiceStatus(host, source);
  }

  const response = await host.http.request(normalizeStatusPageApiUrl(source.baseUrl), {
    method: "GET",
    timeoutMs: statusRequestTimeoutMs,
  });

  if (response.statusCode !== 200) {
    throw new Error(`Statuspage request failed with HTTP ${response.statusCode}.`);
  }

  const payload = parseJsonText(response.bodyText);

  if (!isRecord(payload)) {
    throw new Error("Statuspage response was not a JSON object.");
  }

  const statusRecord = payload["status"];
  const pageRecord = payload["page"];

  if (!isRecord(statusRecord)) {
    throw new Error("Statuspage response did not include a status object.");
  }

  const indicatorValue = readString(statusRecord, "indicator") ?? "unknown";
  const indicator = isProviderServiceStatusIndicator(indicatorValue) ? indicatorValue : "unknown";
  const updatedAt = isRecord(pageRecord) ? toIsoString(readString(pageRecord, "updated_at")) : null;

  return createServiceStatusSnapshot(indicator, readString(statusRecord, "description"), updatedAt);
};

const mapStatuspageComponentIndicator = (value: string | null): ProviderServiceStatusIndicator => {
  const normalizedValue = value?.trim().toLowerCase() ?? "";

  if (normalizedValue === "operational") {
    return "none";
  }

  if (normalizedValue === "under_maintenance") {
    return "maintenance";
  }

  if (normalizedValue === "degraded_performance") {
    return "minor";
  }

  if (normalizedValue === "partial_outage") {
    return "major";
  }

  if (normalizedValue === "major_outage") {
    return "critical";
  }

  return "unknown";
};

const normalizeComponentPatterns = (patterns: string[]): string[] =>
  patterns.map((pattern) => pattern.trim().toLowerCase()).filter((pattern) => pattern !== "");

const findMatchingStatuspageComponent = (
  components: unknown[],
  source: Extract<ProviderServiceStatusSource, { kind: "statuspage" }>,
): Record<string, unknown> | null => {
  const normalizedExactNames = new Set([
    ...(typeof source.componentName === "string" ? [source.componentName] : []),
    ...(Array.isArray(source.componentNames) ? source.componentNames : []),
  ]
    .map((pattern) => pattern.trim().toLowerCase())
    .filter((pattern) => pattern !== ""));
  const includesPatterns = normalizeComponentPatterns(source.componentNameIncludes ?? []);

  return (
    components.find((entry): entry is Record<string, unknown> => {
      if (!isRecord(entry)) {
        return false;
      }

      const entryName = readString(entry, "name")?.trim().toLowerCase() ?? "";

      if (entryName === "") {
        return false;
      }

      if (normalizedExactNames.has(entryName)) {
        return true;
      }

      return includesPatterns.some((pattern) => entryName.includes(pattern));
    }) ?? explicitNull
  );
};

const fetchStatuspageComponentServiceStatus = async (
  host: RuntimeHost,
  source: Extract<ProviderServiceStatusSource, { kind: "statuspage" }>,
): Promise<ProviderServiceStatusSnapshot> => {
  const response = await host.http.request(normalizeStatusPageSummaryApiUrl(source.baseUrl), {
    method: "GET",
    timeoutMs: statusRequestTimeoutMs,
  });

  if (response.statusCode !== 200) {
    throw new Error(`Statuspage request failed with HTTP ${response.statusCode}.`);
  }

  const payload = parseJsonText(response.bodyText);

  if (!isRecord(payload)) {
    throw new Error("Statuspage response was not a JSON object.");
  }

  const pageRecord = payload["page"];
  const {components} = payload;

  if (!Array.isArray(components)) {
    throw new TypeError("Statuspage response did not include a components array.");
  }

  const componentRecord = findMatchingStatuspageComponent(components, source);

  if (componentRecord === null) {
    throw new Error("Statuspage response did not include the requested component.");
  }

  const componentStatus = readString(componentRecord, "status");
  const updatedAt = toIsoString(
    readString(componentRecord, "updated_at") ??
      (isRecord(pageRecord) ? readString(pageRecord, "updated_at") : explicitNull),
  );

  return createServiceStatusSnapshot(
    mapStatuspageComponentIndicator(componentStatus),
    explicitNull,
    updatedAt,
  );
};

const readActiveWorkspaceIncidents = (payload: unknown, productId: string): WorkspaceIncident[] => {
  if (!Array.isArray(payload)) {
    throw new TypeError("Workspace incidents response was not a JSON array.");
  }

  return payload
    .filter((value): value is Record<string, unknown> => isRecord(value))
    .map((record) => parseWorkspaceIncident(record))
    .filter(
      (incident): incident is WorkspaceIncident =>
        incident !== null && incident.end === null && incident.productIds.includes(productId),
    );
};

interface WorkspaceIncident {
  begin: string | null;
  end: string | null;
  modified: string | null;
  productIds: string[];
  severity: string | null;
  statusImpact: string | null;
  summaryText: string | null;
  updateStatus: string | null;
  updateText: string | null;
  updateWhen: string | null;
}

interface WorkspaceStatusBundle {
  incidents: ProviderIncidentSnapshot[];
  serviceStatus: ProviderServiceStatusSnapshot;
}

interface WorkspaceStatusBundleFallback {
  incidents: ProviderIncidentSnapshot[];
  serviceStatus: ProviderServiceStatusSnapshot | null;
}

type ServiceStatusLoadFailureKind = "fetch_failed" | "invalid_payload";

interface ServiceStatusLoadSuccess<Value> {
  status: "ok";
  value: Value;
}

interface ServiceStatusLoadUnavailable {
  failureKind: ServiceStatusLoadFailureKind;
  message: string;
  status: "unavailable";
}

type ServiceStatusLoadResult<Value> =
  | ServiceStatusLoadSuccess<Value>
  | ServiceStatusLoadUnavailable;

const readWorkspaceProducts = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => readString(entry, "id"))
    .filter((entry): entry is string => entry !== null);
};

const parseWorkspaceIncident = (record: Record<string, unknown>): WorkspaceIncident | null => {
  const mostRecentUpdate = record["most_recent_update"];

  return {
    begin: toIsoString(readString(record, "begin")),
    end: toIsoString(readString(record, "end")),
    modified: toIsoString(readString(record, "modified")),
    productIds: [
      ...readWorkspaceProducts(record["currently_affected_products"]),
      ...readWorkspaceProducts(record["affected_products"]),
    ],
    severity: readString(record, "severity"),
    statusImpact: readString(record, "status_impact"),
    summaryText: readString(record, "external_desc"),
    updateStatus: isRecord(mostRecentUpdate) ? readString(mostRecentUpdate, "status") : null,
    updateText: isRecord(mostRecentUpdate) ? readString(mostRecentUpdate, "text") : null,
    updateWhen: isRecord(mostRecentUpdate)
      ? toIsoString(readString(mostRecentUpdate, "when"))
      : null,
  };
};

const indicatorRank = (indicator: ProviderServiceStatusIndicator): number => {
  if (indicator === "critical") {
    return 4;
  }

  if (indicator === "major") {
    return 3;
  }

  if (indicator === "minor") {
    return 2;
  }

  if (indicator === "maintenance" || indicator === "unknown") {
    return 1;
  }

  return 0;
};

const mapWorkspaceIndicator = (
  status: string | null,
  severity: string | null,
): ProviderServiceStatusIndicator => {
  const normalizedStatus = status?.toUpperCase() ?? "";

  if (normalizedStatus === "AVAILABLE") {
    return "none";
  }

  if (normalizedStatus === "SERVICE_INFORMATION") {
    return "minor";
  }

  if (normalizedStatus === "SERVICE_DISRUPTION") {
    return "major";
  }

  if (normalizedStatus === "SERVICE_OUTAGE") {
    return "critical";
  }

  if (normalizedStatus === "SERVICE_MAINTENANCE" || normalizedStatus === "SCHEDULED_MAINTENANCE") {
    return "maintenance";
  }

  const normalizedSeverity = severity?.toLowerCase() ?? "";

  if (normalizedSeverity === "high") {
    return "critical";
  }

  if (normalizedSeverity === "medium") {
    return "major";
  }

  if (normalizedSeverity === "low") {
    return "minor";
  }

  return "minor";
};

const extractWorkspaceSummary = (text: string | null): string | null => {
  if (text === null) {
    return explicitNull;
  }

  const normalizedText = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  for (const line of lines) {
    const normalizedLine = line.toLowerCase();

    if (
      normalizedLine.startsWith("**summary") ||
      normalizedLine.startsWith("**description") ||
      normalizedLine === "summary"
    ) {
      continue;
    }

    let cleaned = line.replaceAll("**", "");
    cleaned = cleaned.replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, "$1").trim();

    if (cleaned.startsWith("- ")) {
      cleaned = cleaned.slice(2).trim();
    }

    if (cleaned !== "") {
      return cleaned;
    }
  }

  return explicitNull;
};

const fetchWorkspaceServiceStatus = async (
  host: RuntimeHost,
  productId: string,
): Promise<ProviderServiceStatusSnapshot> => {
  const bundle = await fetchWorkspaceStatusBundle(host, productId);
  return bundle.serviceStatus;
};

const selectMostSevereWorkspaceIncident = (
  incidents: WorkspaceIncident[],
): [WorkspaceIncident, ProviderServiceStatusIndicator] | null => {
  const firstIncident = incidents[0];

  if (firstIncident === undefined) {
    return explicitNull;
  }

  let bestIncident = firstIncident;
  let bestIndicator = mapWorkspaceIndicator(bestIncident.updateStatus, bestIncident.severity);

  for (const incident of incidents.slice(1)) {
    const indicator = mapWorkspaceIndicator(incident.updateStatus, incident.severity);

    if (indicatorRank(indicator) > indicatorRank(bestIndicator)) {
      bestIncident = incident;
      bestIndicator = indicator;
    }
  }

  return [bestIncident, bestIndicator];
};

const createWorkspaceServiceStatusSnapshot = (
  incidents: WorkspaceIncident[],
): ProviderServiceStatusSnapshot => {
  const selectedIncident = selectMostSevereWorkspaceIncident(incidents);

  if (selectedIncident === null) {
    return createServiceStatusSnapshot("none", explicitNull, explicitNull);
  }
  const [bestIncident, bestIndicator] = selectedIncident;

  return createServiceStatusSnapshot(
    bestIndicator,
    extractWorkspaceSummary(bestIncident.updateText ?? bestIncident.summaryText),
    bestIncident.updateWhen ?? bestIncident.modified ?? bestIncident.begin,
  );
};

const createWorkspaceStatusBundle = (incidents: WorkspaceIncident[]): WorkspaceStatusBundle => ({
  incidents: incidents.map((incident) => createWorkspaceIncidentSnapshot(incident)),
  serviceStatus: createWorkspaceServiceStatusSnapshot(incidents),
});

const fetchWorkspaceStatusBundle = async (
  host: RuntimeHost,
  productId: string,
): Promise<WorkspaceStatusBundle> => {
  const response = await host.http.request(googleWorkspaceIncidentsUrl, {
    method: "GET",
    timeoutMs: statusRequestTimeoutMs,
  });

  if (response.statusCode !== 200) {
    throw new Error(`Workspace status request failed with HTTP ${response.statusCode}.`);
  }

  const incidents = readActiveWorkspaceIncidents(parseJsonText(response.bodyText), productId);

  return createWorkspaceStatusBundle(incidents);
};

const fetchWorkspaceIncidents = async (
  host: RuntimeHost,
  productId: string,
): Promise<ProviderIncidentSnapshot[]> => {
  const bundle = await fetchWorkspaceStatusBundle(host, productId);
  return bundle.incidents;
};

const fetchProviderServiceStatus = async (
  host: RuntimeHost,
  source: ProviderServiceStatusSource,
): Promise<ProviderServiceStatusSnapshot> => {
  if (source.kind === "statuspage") {
    return fetchStatuspageServiceStatus(host, source);
  }

  return fetchWorkspaceServiceStatus(host, source.productId);
};

const classifyServiceStatusLoadFailure = (
  error: unknown,
): Omit<ServiceStatusLoadUnavailable, "status"> => {
  if (
    error instanceof SyntaxError ||
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.message.includes("response was not") || error.message.includes("did not include")))
  ) {
    return {
      failureKind: "invalid_payload",
      message: error instanceof Error ? error.message : "Service status payload was invalid.",
    };
  }

  return {
    failureKind: "fetch_failed",
    message: error instanceof Error ? error.message : "Service status fetch failed.",
  };
};

const loadServiceStatus = async <Value>(
  load: () => Promise<Value>,
): Promise<ServiceStatusLoadResult<Value>> => {
  try {
    return {
      status: "ok",
      value: await load(),
    };
  } catch (error) {
    return {
      ...classifyServiceStatusLoadFailure(error),
      status: "unavailable",
    };
  }
};

const withFallback = async <Value>(load: () => Promise<Value>, fallback: Value): Promise<Value> => {
  const result = await loadServiceStatus(load);

  if (result.status === "ok") {
    return result.value;
  }

  return fallback;
};

const loadProviderServiceStatus = async (
  host: RuntimeHost,
  source: ProviderServiceStatusSource,
): Promise<ServiceStatusLoadResult<ProviderServiceStatusSnapshot>> =>
  loadServiceStatus(() => fetchProviderServiceStatus(host, source));

const tryFetchProviderServiceStatus = async (
  host: RuntimeHost,
  source: ProviderServiceStatusSource,
): Promise<ProviderServiceStatusSnapshot | null> =>
  withFallback(() => fetchProviderServiceStatus(host, source), explicitNull);

const loadWorkspaceIncidents = async (
  host: RuntimeHost,
  productId: string,
): Promise<ServiceStatusLoadResult<ProviderIncidentSnapshot[]>> =>
  loadServiceStatus(() => fetchWorkspaceIncidents(host, productId));

const tryFetchWorkspaceIncidents = async (
  host: RuntimeHost,
  productId: string,
): Promise<ProviderIncidentSnapshot[]> =>
  withFallback(() => fetchWorkspaceIncidents(host, productId), []);

const loadWorkspaceStatusBundle = async (
  host: RuntimeHost,
  productId: string,
): Promise<ServiceStatusLoadResult<WorkspaceStatusBundle>> =>
  loadServiceStatus(() => fetchWorkspaceStatusBundle(host, productId));

const tryFetchWorkspaceStatusBundle = async (
  host: RuntimeHost,
  productId: string,
): Promise<WorkspaceStatusBundleFallback> => {
  const result = await loadServiceStatus(() => fetchWorkspaceStatusBundle(host, productId));

  if (result.status === "ok") {
    return result.value;
  }

  return {
    incidents: [],
    serviceStatus: explicitNull,
  };
};

export {
  fetchProviderServiceStatus,
  loadProviderServiceStatus,
  loadWorkspaceIncidents,
  loadWorkspaceStatusBundle,
  tryFetchWorkspaceStatusBundle,
  tryFetchWorkspaceIncidents,
  tryFetchProviderServiceStatus,
  type ProviderServiceStatusSource,
  type ServiceStatusLoadFailureKind,
  type ServiceStatusLoadResult,
};
