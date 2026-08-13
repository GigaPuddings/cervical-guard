import { describe, expect, it } from "vitest";
import { localizeBackendMessage } from "./i18n";

describe("localizeBackendMessage", () => {
  it("translates known camera failures and preserves diagnostics", () => {
    expect(localizeBackendMessage("摄像头不支持当前视频格式。请更新驱动。（错误码 0xC00DAFC8）", "en-US"))
      .toBe("The camera does not support the required video format. Try another camera or update its driver. (error code 0xC00DAFC8)");
  });

  it("leaves unknown messages and Chinese copy unchanged", () => {
    expect(localizeBackendMessage("未知错误", "en-US")).toBe("未知错误");
    expect(localizeBackendMessage("未检测到可用摄像头。", "zh-CN")).toBe("未检测到可用摄像头。");
  });
});
