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
});
