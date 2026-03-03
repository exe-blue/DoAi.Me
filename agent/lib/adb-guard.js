function classifyAdbResponse(response) {
  if (!response) return { status: "failed", code: null, reason: "empty_response" };
  if (response.queued) {
    return {
      status: "queued",
      code: response.code ?? null,
      reason: "queued",
      dropped: response.dropped ?? 0,
    };
  }
  if (typeof response.code === "number" && response.code !== 10000) {
    return { status: "failed", code: response.code, reason: "code_not_10000" };
  }
  return { status: "success", code: response.code ?? 10000, reason: "ok" };
}

function assertAdbSuccess(response, context = {}) {
  const classification = classifyAdbResponse(response);
  if (classification.status === "success") return classification;

  const command = context.command ? ` cmd="${context.command}"` : "";
  const phase = context.phase ? ` phase=${context.phase}` : "";
  const serial = context.serial ? ` serial=${context.serial}` : "";
  const code = classification.code != null ? ` code=${classification.code}` : "";
  const err = new Error(`ADB ${classification.status}${code}${serial}${phase}${command}`);
  err.name = "AdbGuardError";
  err.isAdbGuardError = true;
  err.adbStatus = classification.status;
  err.adbCode = classification.code;
  err.adbReason = classification.reason;
  err.adbContext = context;
  err.adbResponse = response;
  throw err;
}

module.exports = {
  classifyAdbResponse,
  assertAdbSuccess,
};
