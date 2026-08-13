import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { DownloadCloud, LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import packageJson from "../../../package.json";
import { copy, type Language } from "../../i18n";

const MarkdownPreview = lazy(() => import("./MarkdownPreview"));

type UpdateResource = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
export type UpdateStage = "idle" | "checking" | "latest" | "available" | "downloading" | "restarting" | "error";

function shouldCheckWhenOpened(stage: UpdateStage): boolean {
  return stage === "idle" || stage === "latest" || stage === "error";
}

export function shouldShowDeferredUpdateAction(stage: UpdateStage, updateAvailable: boolean): boolean {
  return stage === "downloading" || (stage === "available" && updateAvailable);
}

export function shouldShowActualDownloadProgress(stage: UpdateStage, downloadStarted: boolean): boolean {
  return stage === "downloading" && downloadStarted;
}

export interface AppUpdater {
  stage: UpdateStage;
  currentVersion: string;
  version: string;
  notes: string;
  date: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  downloadStarted: boolean;
  error: string;
  dialogOpen: boolean;
  updateAvailable: boolean;
  open: () => void;
  close: () => void;
  check: (reveal?: boolean) => Promise<void>;
  install: () => Promise<void>;
}

function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function useAppUpdater(language: Language): AppUpdater {
  const t = copy[language].updater;
  const updateRef = useRef<UpdateResource>(null);
  const checkingRef = useRef(false);
  const stageRef = useRef<UpdateStage>("idle");
  const proxyRef = useRef<string | undefined>(undefined);
  const startupCheckedRef = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stage, setStage] = useState<UpdateStage>("idle");
  const [currentVersion, setCurrentVersion] = useState(packageJson.version);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [bytesPerSecond, setBytesPerSecond] = useState(0);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [error, setError] = useState("");
  const updateAvailable = Boolean(version) && stage !== "latest" && stage !== "restarting";

  const changeStage = useCallback((next: UpdateStage) => {
    stageRef.current = next;
    setStage(next);
  }, []);

  const resolveProxy = useCallback(async () => {
    if (isTauri()) {
      proxyRef.current = await invoke<string | null>("get_update_proxy").then((value) => value ?? undefined).catch(() => undefined);
    }
    return proxyRef.current;
  }, []);

  const checkUpdate = useCallback(async (reveal = true) => {
    if (reveal) setDialogOpen(true);
    if (checkingRef.current || stageRef.current === "downloading" || stageRef.current === "restarting") return;
    if (!isTauri()) {
      setError(t.browserOnly);
      changeStage("error");
      return;
    }
    checkingRef.current = true;
    changeStage("checking");
    setError("");
    try {
      await updateRef.current?.close();
      updateRef.current = null;
      setVersion("");
      setNotes("");
      setDate("");
      setDownloadStarted(false);
      const { check } = await import("@tauri-apps/plugin-updater");
      const proxy = await resolveProxy();
      const update = await check(proxy ? { timeout: 30_000, proxy } : { timeout: 30_000 });
      updateRef.current = update;
      if (!update) {
        setVersion("");
        setNotes("");
        setDate("");
        changeStage("latest");
        return;
      }
      setCurrentVersion(update.currentVersion || packageJson.version);
      setVersion(update.version);
      setNotes(update.body?.trim() ?? "");
      setDate(update.date ?? "");
      changeStage("available");
    } catch (reason) {
      setError(reasonText(reason));
      changeStage("error");
    } finally {
      checkingRef.current = false;
    }
  }, [changeStage, resolveProxy, t.browserOnly]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    setDialogOpen(true);
    if (stageRef.current === "downloading" || stageRef.current === "restarting") return;
    changeStage("downloading");
    setError("");
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setBytesPerSecond(0);
    setDownloadStarted(false);
    let downloaded = 0;
    let total = 0;
    let measuredAt = performance.now();
    let measuredBytes = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setDownloadStarted(true);
          total = event.data.contentLength ?? 0;
          setTotalBytes(total);
        }
        if (event.event === "Progress") {
          // 防御旧版本插件未先发 Started 的情况；收到真实字节后仍应切到真实进度。
          setDownloadStarted(true);
          downloaded += event.data.chunkLength;
          setDownloadedBytes(downloaded);
          const now = performance.now();
          const elapsed = now - measuredAt;
          if (elapsed >= 750) {
            setBytesPerSecond(Math.round((downloaded - measuredBytes) * 1_000 / elapsed));
            measuredAt = now;
            measuredBytes = downloaded;
          }
        }
        if (event.event === "Finished") {
          setDownloadStarted(true);
          setProgress(100);
        }
        else if (total > 0) setProgress(Math.min(99, Math.round(downloaded / total * 100)));
      }, { timeout: 30 * 60_000 });
      setProgress(100);
      changeStage("restarting");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (reason) {
      setError(reasonText(reason));
      changeStage("error");
    }
  }, [changeStage]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen("updater://open", () => {
      if (!active) return;
      setDialogOpen(true);
      if (shouldCheckWhenOpened(stageRef.current)) void checkUpdate(false);
    }).then((dispose) => {
      if (active) unlisten = dispose;
      else dispose();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [checkUpdate]);

  useEffect(() => {
    if (!isTauri() || startupCheckedRef.current) return;
    const timer = window.setTimeout(() => {
      startupCheckedRef.current = true;
      void checkUpdate(false);
    }, 3_500);
    return () => window.clearTimeout(timer);
  }, [checkUpdate]);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke("set_update_tray_status", {
      stage,
      version: version || null,
      progress,
      language,
    }).catch(() => undefined);
  }, [language, progress, stage, version]);

  useEffect(() => () => { void updateRef.current?.close(); }, []);

  return {
    stage,
    currentVersion,
    version,
    notes,
    date,
    progress,
    downloadedBytes,
    totalBytes,
    bytesPerSecond,
    downloadStarted,
    error,
    dialogOpen,
    updateAvailable,
    open: () => {
      setDialogOpen(true);
      if (shouldCheckWhenOpened(stageRef.current)) void checkUpdate(false);
    },
    close: () => setDialogOpen(false),
    check: checkUpdate,
    install,
  };
}

function formatBytes(value: number, language: Language): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

export function UpdateDialog({ updater, language }: { updater: AppUpdater; language: Language }) {
  if (!updater.dialogOpen) return null;
  const t = copy[language].updater;
  const busy = updater.stage === "checking" || updater.stage === "downloading" || updater.stage === "restarting";
  const published = updater.date
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(updater.date))
    : "";
  const status = updater.stage === "checking" ? t.checking
    : updater.stage === "latest" ? t.latest
      : updater.stage === "available" ? t.available(updater.version)
        : updater.stage === "downloading" ? (updater.downloadStarted ? t.downloading(updater.progress) : t.preparingDownload)
          : updater.stage === "restarting" ? t.restart
            : updater.stage === "error" ? `${t.failed}: ${updater.error}`
              : t.description;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-panel-strong/45 p-4 backdrop-blur-[3px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) updater.close(); }}>
      <section className="flex max-h-[min(680px,calc(100vh-32px))] w-full max-w-[620px] flex-col overflow-hidden rounded-[14px] border border-edge bg-panel shadow-panel" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
        <header className="flex items-start gap-4 border-b border-edge px-6 py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><Sparkles size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-black" id="update-dialog-title">{t.title}</h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{status}</p>
          </div>
          <button className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel-muted hover:text-foreground" aria-label={language === "en-US" ? "Close" : "关闭"} onClick={updater.close}><X size={18} /></button>
        </header>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 rounded-2xl bg-panel-muted p-4 sm:grid-cols-2">
            <div><small className="block text-[9px] font-bold text-subtle">{t.currentVersion}</small><strong className="mt-1 block text-sm">v{updater.currentVersion}</strong></div>
            <div><small className="block text-[9px] font-bold text-subtle">{t.latestVersion}</small><strong className="mt-1 block text-sm text-accent">{updater.version ? `v${updater.version}` : updater.stage === "latest" ? `v${updater.currentVersion}` : "—"}</strong></div>
          </div>

          {updater.updateAvailable && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3"><h3 className="m-0 text-xs font-extrabold">{t.releaseNotes}</h3>{published && <time className="text-[9px] text-subtle">{published}</time>}</div>
              <div className="max-h-[260px] overflow-y-auto rounded-xl border border-edge-soft bg-panel-muted px-4 py-3 text-[10px] leading-5 text-muted">
                <Suspense fallback={<p className="my-2 animate-pulse text-subtle">{t.loadingReleaseNotes}</p>}>
                  <MarkdownPreview markdown={updater.notes || t.noReleaseNotes} />
                </Suspense>
              </div>
            </div>
          )}

          {updater.stage === "downloading" && !updater.downloadStarted && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent-soft/45 p-4 text-[10px] font-bold text-accent" role="status" aria-live="polite">
              <LoaderCircle className="animate-spin" size={17} />
              <span>{t.preparingDownload}</span>
            </div>
          )}

          {shouldShowActualDownloadProgress(updater.stage, updater.downloadStarted) && (
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent-soft/45 p-4" role="status" aria-live="polite">
              <div className="flex items-center justify-between text-[10px] font-bold"><span>{t.downloadProgress}</span><span>{updater.totalBytes > 0 ? `${formatBytes(updater.downloadedBytes, language)} / ${formatBytes(updater.totalBytes, language)}` : formatBytes(updater.downloadedBytes, language)}</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-edge">
                <i className="block h-full rounded-full bg-accent transition-[width]" style={{ width: updater.totalBytes > 0 ? `${updater.progress}%` : "0%" }} />
              </div>
              <p className="mb-0 mt-2 text-right text-[10px] font-extrabold text-accent">{updater.totalBytes > 0 ? `${updater.progress}%` : formatBytes(updater.downloadedBytes, language)}</p>
              <div className="mt-2 text-[9px] text-muted">
                <span>{t.speed}: {updater.bytesPerSecond > 0 ? `${formatBytes(updater.bytesPerSecond, language)}/s` : "—"}</span>
              </div>
              <p className="mb-0 mt-2 text-[9px] leading-4 text-subtle">{t.backgroundHint}</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-edge bg-panel-muted/55 px-6 py-4">
          {shouldShowDeferredUpdateAction(updater.stage, updater.updateAvailable) && <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-edge bg-panel px-4 text-[11px] font-bold text-muted hover:bg-panel-muted" onClick={updater.close}>{updater.stage === "downloading" ? t.backgroundDownload : t.later}</button>}
          {updater.updateAvailable && updater.stage !== "downloading" && updater.stage !== "restarting" ? (
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[11px] font-bold text-inverse hover:bg-accent-strong" onClick={() => void updater.install()}><DownloadCloud size={16} />{t.install}</button>
          ) : updater.stage !== "downloading" && updater.stage !== "restarting" ? (
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[11px] font-bold text-inverse hover:bg-accent-strong disabled:opacity-45" disabled={busy} onClick={() => void updater.check(true)}>{updater.stage === "checking" ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}{t.check}</button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
