import { isTauri } from "@tauri-apps/api/core";
import { DownloadCloud, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy, type Language } from "../../i18n";

type UpdateResource = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
type Stage = "idle" | "checking" | "latest" | "available" | "downloading" | "restarting" | "error";

export function UpdatePanel({ language }: { language: Language }) {
  const t = copy[language].updater;
  const updateRef = useRef<UpdateResource>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => () => { void updateRef.current?.close(); }, []);

  const checkUpdate = async () => {
    if (!isTauri()) {
      setError(t.browserOnly);
      setStage("error");
      return;
    }
    setStage("checking");
    setError("");
    try {
      await updateRef.current?.close();
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: 30_000 });
      updateRef.current = update;
      if (!update) {
        setStage("latest");
        return;
      }
      setVersion(update.version);
      setNotes(update.body ?? "");
      setStage("available");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStage("error");
    }
  };

  const install = async () => {
    const update = updateRef.current;
    if (!update) return;
    setStage("downloading");
    setProgress(0);
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event === "Finished") setProgress(100);
        else if (total > 0) setProgress(Math.min(99, Math.round(downloaded / total * 100)));
      }, { timeout: 5 * 60_000 });
      setStage("restarting");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStage("error");
    }
  };

  const label = stage === "checking" ? t.checking
    : stage === "latest" ? t.latest
      : stage === "available" ? t.available(version)
        : stage === "downloading" ? t.downloading(progress)
          : stage === "restarting" ? t.restart
            : stage === "error" ? `${t.failed}: ${error}`
              : t.description;

  return (
    <div className="mt-4 rounded-[14px] border border-edge-soft bg-panel-muted p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info-soft text-info"><RefreshCw size={18} /></span>
        <div className="min-w-0 flex-1"><strong className="text-xs">{t.title}</strong><p className="mb-0 mt-1 break-words text-[9px] leading-4 text-muted" role={stage === "error" ? "alert" : "status"}>{label}</p></div>
      </div>
      {notes && stage === "available" && <p className="mt-3 max-h-20 overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel px-3 py-2 text-[9px] leading-4 text-muted">{notes}</p>}
      {stage === "downloading" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-edge"><i className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div>}
      <div className="mt-3 flex gap-2">
        {stage === "available" ? <button className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[10px] font-bold text-inverse" onClick={() => void install()}><DownloadCloud size={15} />{t.install}</button>
          : <button className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-4 text-[10px] font-bold text-muted disabled:opacity-50" disabled={stage === "checking" || stage === "downloading" || stage === "restarting"} onClick={() => void checkUpdate()}>{stage === "checking" ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />}{t.check}</button>}
      </div>
    </div>
  );
}
