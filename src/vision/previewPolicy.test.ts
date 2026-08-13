import { describe, expect, it } from "vitest";
import {
  PREVIEW_FAILURE_LIMIT,
  PREVIEW_START_TIMEOUT_MS,
  shouldReportPreviewFailure,
} from "./previewPolicy";

describe("preview startup policy", () => {
  it("keeps transient camera startup failures in the loading state", () => {
    expect(shouldReportPreviewFailure(PREVIEW_FAILURE_LIMIT - 1)).toBe(false);
  });

  it("surfaces a persistent preview failure", () => {
    expect(shouldReportPreviewFailure(PREVIEW_FAILURE_LIMIT)).toBe(true);
  });

  it("allows a full cold-start grace period before showing retry UI", () => {
    expect(PREVIEW_START_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
  });
});
