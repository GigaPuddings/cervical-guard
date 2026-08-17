import { describe, expect, it } from "vitest";
import { locationNeedsLanguageRefresh, reasonMessage } from "./WeatherPage";
import type { WeatherLocation } from "./types";

const shanghai: WeatherLocation = {
  id: "1796236",
  name: "上海",
  admin1: "上海市",
  country: "中国",
  latitude: 31.22222,
  longitude: 121.45806,
  timezone: "Asia/Shanghai",
  source: "search"
};

describe("weather operation errors", () => {
  it("preserves String errors from async operations", () => {
    expect(reasonMessage("城市搜索暂不可用")).toBe("城市搜索暂不可用");
  });

  it("keeps Error messages and falls back for unknown values", () => {
    expect(reasonMessage(new Error("网络不可用"))).toBe("网络不可用");
    expect(reasonMessage({ code: "unknown" })).toBe("操作暂时无法完成");
  });

  it("refreshes saved city labels only when they do not match the interface language", () => {
    expect(locationNeedsLanguageRefresh(shanghai, "en-US")).toBe(true);
    expect(locationNeedsLanguageRefresh({ ...shanghai, name: "Shanghai", admin1: "Shanghai", country: "China" }, "en-US")).toBe(false);
    expect(locationNeedsLanguageRefresh({ ...shanghai, name: "Shanghai", admin1: "Shanghai", country: "China" }, "zh-CN")).toBe(true);
  });
});
