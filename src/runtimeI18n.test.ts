import { describe, expect, it } from "vitest";
import { translateDynamic } from "./runtimeI18n";

describe("runtime language switching", () => {
  it("restores dynamically formatted English counters to Chinese", () => {
    expect(translateDynamic("Longest session: <1m", "zh-CN")).toBe("最长连续 <1m");
    expect(translateDynamic("0 gentle reminders", "zh-CN")).toBe("0 次温和提醒");
    expect(translateDynamic("0 times", "zh-CN")).toBe("0 次");
  });

  it("localizes the timer detection call to action", () => {
    expect(translateDynamic("开启姿势检测", "en-US")).toBe("Enable posture detection");
    expect(translateDynamic("Timer", "zh-CN")).toBe("定时中");
  });

  it("localizes values, settings presets, and mixed history metadata", () => {
    expect(translateDynamic("3 分钟", "en-US")).toBe("3 minutes");
    expect(translateDynamic("45 分钟 · 推荐", "en-US")).toBe("45 minutes · recommended");
    expect(translateDynamic("04:18 PM · 手动恢复", "en-US")).toBe("04:18 PM · Manual resume");
    expect(translateDynamic("0% 的提醒", "en-US")).toBe("0% of reminders");
  });

  it("localizes composite weather and status copy", () => {
    expect(translateDynamic("湿度 92% · 微风 9 km/h", "en-US")).toBe("Humidity 92% · Light breeze 9 km/h");
    expect(translateDynamic("已添加 上海，并设为概览天气", "en-US")).toBe("Added 上海 and set it as overview weather");
    expect(translateDynamic("仅展示中国城市行政中心 · 已选 1/8", "en-US")).toBe("Chinese administrative centers only · Selected 1/8");
    expect(translateDynamic("降水 86% · UV 峰值 7.3", "en-US")).toBe("Rain 86% · Peak UV 7.3");
    expect(translateDynamic("恢复检测后继续累计", "en-US")).toBe("Timing continues after monitoring resumes");
  });
});
