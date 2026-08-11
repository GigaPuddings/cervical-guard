import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Moon, Square, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { preferredTheme, saveTheme, type UiTheme } from "../theme";

export function WindowChrome() {
  const [maximized, setMaximized] = useState(false);
  const [theme, setTheme] = useState<UiTheme>(() => preferredTheme());

  useEffect(() => {
    const window = getCurrentWindow();
    let active = true;
    let dispose: (() => void) | undefined;
    const refresh = () => void window.isMaximized().then((value) => {
      if (active) setMaximized(value);
    }).catch(() => undefined);
    refresh();
    void window.onResized(refresh).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
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
        <span className="truncate text-[11px] font-bold text-foreground" data-tauri-drag-region>健康提醒 · 姿态与久坐</span>
      </div>
      <button className={controlClass} title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"} onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button className={controlClass} title="最小化" aria-label="最小化" onClick={() => void getCurrentWindow().minimize()}><Minus size={15} /></button>
      <button className={controlClass} title={maximized ? "还原" : "最大化"} aria-label={maximized ? "还原" : "最大化"} onClick={() => void toggleMaximize()}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button>
      <button className={`${controlClass} hover:bg-danger hover:text-inverse`} title="关闭" aria-label="关闭" onClick={() => void getCurrentWindow().close()}><X size={16} /></button>
    </header>
  );
}
