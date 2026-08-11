import { describe, expect, it } from "vitest";
import { compactDuration, formatDuration, percent } from "./utils";

describe("duration formatting", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(59)).toBe("59秒");
    expect(formatDuration(125)).toBe("2分 05秒");
    expect(formatDuration(3_720)).toBe("1小时 2分");
  });

  it("creates compact chart labels", () => {
    expect(compactDuration(1)).toBe("<1m");
    expect(compactDuration(59)).toBe("<1m");
    expect(compactDuration(1_800)).toBe("30m");
    expect(compactDuration(5_400)).toBe("1h 30m");
  });
});

describe("percent", () => {
  it("clamps values and handles zero totals", () => {
    expect(percent(2, 4)).toBe(50);
    expect(percent(10, 4)).toBe(100);
    expect(percent(1, 0)).toBe(0);
  });
});
