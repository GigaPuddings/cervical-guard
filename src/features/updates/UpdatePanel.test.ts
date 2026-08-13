import { describe, expect, it } from "vitest";
import { shouldShowActualDownloadProgress, shouldShowDeferredUpdateAction } from "./UpdatePanel";

describe("update dialog state presentation", () => {
  it("does not pretend that preparing a download is measurable progress", () => {
    expect(shouldShowActualDownloadProgress("downloading", false)).toBe(false);
    expect(shouldShowActualDownloadProgress("downloading", true)).toBe(true);
  });

  it("only shows the deferred action when an update can actually be deferred", () => {
    expect(shouldShowDeferredUpdateAction("latest", false)).toBe(false);
    expect(shouldShowDeferredUpdateAction("idle", false)).toBe(false);
    expect(shouldShowDeferredUpdateAction("available", true)).toBe(true);
    expect(shouldShowDeferredUpdateAction("downloading", true)).toBe(true);
  });
});
