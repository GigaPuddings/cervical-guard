import { Camera, CameraOff, CirclePause, ShieldCheck, Sparkles } from "lucide-react";
import { languageOf } from "../i18n";
import { defineMessages, localizeMessages } from "../runtimeI18n";
import type { AppSnapshot } from "../types";

const statusMessages = defineMessages({
  unavailable: { zh: "尚未启用", en: 'Not enabled' },
  initializing: { zh: "正在启动", en: 'Starting' },
  calibrating: { zh: "正在校准", en: 'Calibrating' },
  monitoring: { zh: "检测进行中", en: 'Monitoring' },
  paused: { zh: "检测已暂停", en: 'Monitoring paused' },
  break: { zh: "休息中", en: 'On break' },
  degraded: { zh: "定时提醒模式", en: 'Timer reminder mode' },});

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
