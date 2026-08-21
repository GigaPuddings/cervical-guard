import { Camera, CameraOff, CirclePause, ShieldCheck, Sparkles } from "lucide-react";
import { languageOf } from "../i18n";
import { defineMessages, localizeMessages } from "../runtimeI18n";
import type { AppSnapshot } from "../types";

const statusMessages = defineMessages({
  unavailable: "尚未启用",
  initializing: "正在启动",
  calibrating: "正在校准",
  monitoring: "检测进行中",
  paused: "检测已暂停",
  break: "休息中",
  degraded: "定时提醒模式",
});

export function StatusPill({ snapshot }: { snapshot: AppSnapshot }) {
  const labels = localizeMessages(statusMessages, languageOf(snapshot.settings.language));
  const Icon =
    snapshot.lifecycle === "monitoring"
      ? snapshot.monitoringMode === "camera"
        ? Camera
        : Sparkles
      : snapshot.lifecycle === "paused"
        ? CirclePause
        : snapshot.lifecycle === "degraded"
          ? CameraOff
          : ShieldCheck;
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-muted">
      <span className={`size-2 shrink-0 rounded-full ${snapshot.lifecycle === "paused" ? "bg-subtle" : snapshot.lifecycle === "monitoring" ? "bg-accent" : "bg-warning"}`} />
      <Icon className="shrink-0" size={14} />
      <span className="truncate">{labels[snapshot.lifecycle]}</span>
    </span>
  );
}
