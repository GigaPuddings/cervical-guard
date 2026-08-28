import { describe, expect, it } from "vitest";
import { defineMessages, formatMessage, localizeMessages, messageText } from "./runtimeI18n";

const sample = defineMessages({
  greeting: { zh: "该舒展一下了", en: "Time to stretch" },
  counter: { zh: "已连续 {duration}", en: "Continuous: {duration}" }
});

describe("runtime key-value messages", () => {
  it("picks the copy that matches the requested language", () => {
    expect(messageText(sample.greeting, "zh-CN")).toBe("该舒展一下了");
    expect(messageText(sample.greeting, "en-US")).toBe("Time to stretch");
  });

  it("expands a whole message catalog for components", () => {
    const messages = localizeMessages(sample, "en-US");
    expect(messages).toEqual({ greeting: "Time to stretch", counter: "Continuous: {duration}" });
    const chinese = localizeMessages(sample, "zh-CN");
    expect(chinese.greeting).toBe("该舒展一下了");
  });

  it("formats parameterized templates without locale guessing", () => {
    expect(formatMessage(sample.counter.zh, { duration: "45 分钟" })).toBe("已连续 45 分钟");
    expect(formatMessage(sample.counter.en, { duration: "45 minutes" })).toBe("Continuous: 45 minutes");
  });
});
