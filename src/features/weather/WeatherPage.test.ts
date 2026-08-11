import { describe, expect, it } from "vitest";
import { reasonMessage } from "./WeatherPage";

describe("weather operation errors", () => {
  it("preserves String errors from async operations", () => {
    expect(reasonMessage("城市搜索暂不可用")).toBe("城市搜索暂不可用");
  });

  it("keeps Error messages and falls back for unknown values", () => {
    expect(reasonMessage(new Error("网络不可用"))).toBe("网络不可用");
    expect(reasonMessage({ code: "unknown" })).toBe("操作暂时无法完成");
  });
});
