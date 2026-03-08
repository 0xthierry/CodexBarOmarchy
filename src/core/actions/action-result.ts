const providerActionNames = ["refresh", "login", "repair"] as const;
const providerActionStatuses = ["success", "error", "unsupported"] as const;

type ProviderId = "claude" | "codex" | "gemini";
type ProviderActionName = (typeof providerActionNames)[number];
type ProviderActionStatus = (typeof providerActionStatuses)[number];

interface ProviderActionResult<
  ProviderValue extends ProviderId,
  ActionValue extends ProviderActionName,
> {
  actionName: ActionValue;
  message: string;
  providerId: ProviderValue;
  status: ProviderActionStatus;
}

const createProviderActionResult = <
  ProviderValue extends ProviderId,
  ActionValue extends ProviderActionName,
>(input: {
  actionName: ActionValue;
  message: string;
  providerId: ProviderValue;
  status: ProviderActionStatus;
}): ProviderActionResult<ProviderValue, ActionValue> => input;

const createErrorProviderActionResult = <
  ProviderValue extends ProviderId,
  ActionValue extends ProviderActionName,
>(
  providerId: ProviderValue,
  actionName: ActionValue,
  message: string,
): ProviderActionResult<ProviderValue, ActionValue> =>
  createProviderActionResult({
    actionName,
    message,
    providerId,
    status: "error",
  });

const createSuccessfulProviderActionResult = <
  ProviderValue extends ProviderId,
  ActionValue extends ProviderActionName,
>(
  providerId: ProviderValue,
  actionName: ActionValue,
  message: string,
): ProviderActionResult<ProviderValue, ActionValue> =>
  createProviderActionResult({
    actionName,
    message,
    providerId,
    status: "success",
  });

const createUnsupportedProviderActionResult = <
  ProviderValue extends ProviderId,
  ActionValue extends ProviderActionName,
>(
  providerId: ProviderValue,
  actionName: ActionValue,
  message: string,
): ProviderActionResult<ProviderValue, ActionValue> =>
  createProviderActionResult({
    actionName,
    message,
    providerId,
    status: "unsupported",
  });

export {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
  createUnsupportedProviderActionResult,
  providerActionNames,
  providerActionStatuses,
  type ProviderActionName,
  type ProviderActionResult,
  type ProviderActionStatus,
};
