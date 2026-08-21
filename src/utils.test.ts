import { describe, expect, it } from "vitest";
import { compactDuration, formatDuration, percent } from "./utils";

describe("duration formatting", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(59, "zh-CN")).toBe("59 秒");
    expect(formatDuration(125, "zh-CN")).toBe("2 分钟 5 秒");
    expect(formatDuration(3_720, "zh-CN")).toBe("1 小时 2 分钟");
    expect(formatDuration(3_720, "en-US")).toBe("1 hour 2 minutes");
  });

  it("creates concise labels without abbreviated units", () => {
    expect(compactDuration(1, "zh-CN")).toBe("少于 1 分钟");
    expect(compactDuration(59, "en-US")).toBe("Less than 1 minute");
    expect(compactDuration(1_800, "zh-CN")).toBe("30 分钟");
    expect(compactDuration(5_400, "en-US")).toBe("1 hour 30 minutes");
  });
});

describe("percent", () => {
  it("clamps values and handles zero totals", () => {
    expect(percent(2, 4)).toBe(50);
    expect(percent(10, 4)).toBe(100);
    expect(percent(1, 0)).toBe(0);
  });
});
