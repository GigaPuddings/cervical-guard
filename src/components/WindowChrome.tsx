import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Moon, Square, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { preferredTheme, saveTheme, type UiTheme } from "../theme";
import type { Language } from "../i18n";
import { languageOf } from "../i18n";
import { defineMessages, localizeMessages } from "../runtimeI18n";
import { useAppStore } from "../store";

const chromeMessages = defineMessages({
  title: "健康提醒 · 姿态与久坐",
  lightTheme: "切换到浅色模式",
  darkTheme: "切换到深色模式",
  minimize: "最小化",
  restore: "还原",
  maximize: "最大化",
  close: "关闭",
});

export function WindowChrome() {
  const language: Language = languageOf(useAppStore((state) => state.snapshot?.settings.language));
  const messages = localizeMessages(chromeMessages, language);
  const [maximized, setMaximized] = useState(false);
  const [theme, setTheme] = useState<UiTheme>(() => preferredTheme());

  useEffect(() => {
    const window = getCurrentWindow();
    let active = true;
    let dispose: (() => void) | undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      // 局部弹层可以先消费 Escape；只有未被处理的 Escape 才关闭内容窗口。
      // reminder-island 不加载此组件，同时显式排除以防未来复用。
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || window.label === "reminder-island") return;
      event.preventDefault();
      void window.close();
    };
    const refresh = () => void window.isMaximized().then((value) => {
      if (active) setMaximized(value);
    }).catch(() => undefined);
    document.addEventListener("keydown", closeOnEscape);
    refresh();
    void window.onResized(refresh).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      document.removeEventListener("keydown", closeOnEscape);
      dispose?.();
    };
  }, []);

  const toggleMaximize = async () => {
    const window = getCurrentWindow();
    if (await window.isMaximized()) await window.unmaximize();
    else await window.maximize();
    setMaximized(await window.isMaximized());
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };

  const controlClass = "grid h-8 w-10 place-items-center text-muted transition hover:bg-panel-muted hover:text-foreground";
  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault();
    void getCurrentWindow().startDragging();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-[250] flex h-9 select-none items-center border-b border-edge bg-sidebar/95 pl-3 backdrop-blur-xl dark:bg-sidebar/98" data-tauri-drag-region onPointerDown={startDragging}>
      <div className="flex min-w-0 flex-1 items-center gap-2 self-stretch" data-tauri-drag-region>
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
        <span className="truncate text-[11px] font-bold text-foreground" data-tauri-drag-region>{messages.title}</span>
      </div>
      <button className={controlClass} title={theme === "dark" ? messages.lightTheme : messages.darkTheme} aria-label={theme === "dark" ? messages.lightTheme : messages.darkTheme} onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button className={controlClass} title={messages.minimize} aria-label={messages.minimize} onClick={() => void getCurrentWindow().minimize()}><Minus size={15} /></button>
      <button className={controlClass} title={maximized ? messages.restore : messages.maximize} aria-label={maximized ? messages.restore : messages.maximize} onClick={() => void toggleMaximize()}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button>
      <button className={`${controlClass} hover:bg-danger hover:text-inverse`} title={messages.close} aria-label={messages.close} onClick={() => void getCurrentWindow().close()}><X size={16} /></button>
    </header>
  );
}
