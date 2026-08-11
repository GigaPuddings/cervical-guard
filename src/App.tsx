import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Calibration } from "./features/calibration/Calibration";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Onboarding } from "./features/onboarding/Onboarding";
import { BreakScreen } from "./features/reminders/BreakScreen";
import { ReminderOverlay } from "./features/reminders/ReminderOverlay";
import { coreClient } from "./infra/client";
import { mockCore } from "./infra/mockCore";
import { useAppStore } from "./store";
import type { AppSettings, AppSnapshot, CalibrationResult, VisionObservation } from "./types";
import { downloadText } from "./utils";
import { useVisionMonitor } from "./vision/useVisionMonitor";

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "操作暂时无法完成";
}

export function App() {
  const { snapshot, page, statistics, busy, error, setSnapshot, setPage, setStatistics, setBusy, setError } = useAppStore();
  const [showIntro, setShowIntro] = useState(false);
  const [cameraFailure, setCameraFailure] = useState<string | null>(null);
  const ingesting = useRef(false);
  const snapshotEpoch = useRef(0);
  const lastReminderId = useRef<string | null>(null);
  const fallbackStarted = useRef(false);

  const run = useCallback(async (operation: () => Promise<AppSnapshot>) => {
    const epoch = ++snapshotEpoch.current;
    setBusy(true);
    try {
      const next = await operation();
      if (epoch === snapshotEpoch.current) setSnapshot(next);
      return next;
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }, [setBusy, setError, setSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const epoch = snapshotEpoch.current;
    void coreClient.getSnapshot().then((value) => {
      if (!cancelled && epoch === snapshotEpoch.current) setSnapshot(value);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(errorMessage(reason));
    });
    return () => { cancelled = true; };
  }, [setError, setSnapshot]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<AppSnapshot>("monitoring://snapshot", (event) => {
      if (active) setSnapshot(event.payload);
    }).then((dispose) => {
      if (active) unlisten = dispose;
      else dispose();
    }).catch((reason: unknown) => {
      if (active) setError(errorMessage(reason));
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [setError, setSnapshot]);

  useEffect(() => {
    // Tauri 后台每秒广播完整快照；同时轮询会产生重复 IPC，并可能让较早发出的
    // 旧响应覆盖刚收到的“开始休息”等新状态。浏览器模拟环境才需要主动轮询。
    if (isTauri() || !snapshot || snapshot.lifecycle === "unavailable" || snapshot.lifecycle === "calibrating") return;
    const timer = window.setInterval(() => {
      const epoch = snapshotEpoch.current;
      void coreClient.getSnapshot()
        .then((value) => {
          if (epoch === snapshotEpoch.current) setSnapshot(value);
        })
        .catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [setSnapshot, snapshot?.lifecycle]);

  useEffect(() => {
    if (page !== "statistics") return;
    void coreClient.getStatistics(30).then(setStatistics).catch((reason: unknown) => setError(errorMessage(reason)));
  }, [page, setError, setStatistics]);

  useEffect(() => {
    const reminder = snapshot?.currentReminder;
    if (!reminder || reminder.id === lastReminderId.current) return;
    lastReminderId.current = reminder.id;
    if (!isTauri()) {
      const silent = !snapshot.settings.soundEnabled || snapshot.settings.meetingMode;
      void coreClient.notify(reminder.title, reminder.message, silent);
    }
  }, [snapshot?.currentReminder, snapshot?.settings.meetingMode, snapshot?.settings.soundEnabled]);

  const onObservation = useCallback((observation: VisionObservation) => {
    if (ingesting.current) return;
    ingesting.current = true;
    const epoch = snapshotEpoch.current;
    void coreClient.ingestObservation(observation)
      .then((value) => {
        if (epoch === snapshotEpoch.current) setSnapshot(value);
      })
      .catch((reason: unknown) => setCameraFailure(errorMessage(reason)))
      .finally(() => { ingesting.current = false; });
  }, [setSnapshot]);

  // 休息期间也保持摄像头低功耗运行：既能在休息中感知离座行为，
  // 也让休息结束的瞬间检测管线已就绪，避免重新打开摄像头导致的 ingest 失败。
  const cameraActive = Boolean(
    snapshot &&
    (snapshot.lifecycle === "monitoring" || snapshot.lifecycle === "break") &&
    snapshot.monitoringMode === "camera" &&
    snapshot.calibrated,
  );
  const vision = useVisionMonitor({
    active: cameraActive,
    cameraId: snapshot?.settings.cameraId ?? "default",
    baseline: snapshot?.calibrationBaseline ?? null,
    onObservation,
  });

  // 摄像头管线恢复就绪后，清除上一轮残留的失败提示（如休息切换期间的瞬时错误）。
  useEffect(() => {
    if (cameraActive && vision.status === "ready") setCameraFailure(null);
  }, [cameraActive, vision.status]);

  useEffect(() => {
    if (!cameraActive || vision.status !== "error" || fallbackStarted.current) return;
    fallbackStarted.current = true;
    setCameraFailure(vision.error ?? "摄像头或姿态模型无法启动");
    void coreClient.startMonitoring("timer").then(setSnapshot).catch((reason: unknown) => setError(errorMessage(reason)));
  }, [cameraActive, setError, setSnapshot, vision.error, vision.status]);

  useEffect(() => {
    if (cameraActive) fallbackStarted.current = false;
  }, [cameraActive]);

  if (!snapshot) {
    return <div className="grid h-full place-content-center justify-items-center gap-3.5 bg-canvas text-xs text-muted"><div className="grid size-[52px] place-items-center rounded-[17px_17px_17px_6px] bg-accent text-[19px] font-extrabold text-inverse shadow-panel">健</div><strong>本地状态暂不可用</strong><span>请关闭后重新打开应用</span>{error && <small className="text-danger">{error}</small>}</div>;
  }

  const startCameraOnboarding = async () => {
    setShowIntro(false);
    await run(() => coreClient.finishOnboarding("camera", "prompt"));
  };
  const startTimerOnboarding = async (permission: AppSnapshot["permission"] = "prompt") => {
    setShowIntro(false);
    await run(() => coreClient.finishOnboarding("timer", permission));
  };
  const finishCalibration = async (baseline: number, cameraId: string) => {
    const result: CalibrationResult = { baseline, cameraId };
    await run(() => coreClient.saveCalibration(result));
  };
  const saveSettings = async (settings: AppSettings) => {
    const next = await run(() => coreClient.updateSettings(settings));
    return Boolean(next);
  };
  const exportStatistics = async () => {
    try {
      const csv = await coreClient.exportStatistics();
      downloadText(`健康提醒统计_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  const deleteData = async () => {
    if (!window.confirm("确认删除全部本地统计数据？此操作无法撤销。设置和校准信息会保留。")) return;
    await run(() => coreClient.deleteLocalData());
    setStatistics([]);
  };
  const recalibrate = async () => {
    await run(() => coreClient.startCalibration());
    setPage("today");
  };

  if (showIntro || snapshot.lifecycle === "unavailable") {
    return <Onboarding busy={busy} onCamera={() => void startCameraOnboarding()} onTimer={() => void startTimerOnboarding("prompt")} />;
  }

  if (snapshot.lifecycle === "calibrating") {
    return (
      <Calibration
        initialCameraId={snapshot.settings.cameraId}
        busy={busy}
        onComplete={(baseline, cameraId) => void finishCalibration(baseline, cameraId)}
        onTimerFallback={() => void startTimerOnboarding("denied")}
        onBack={() => setShowIntro(true)}
      />
    );
  }

  if (snapshot.lifecycle === "break") {
    return <BreakScreen snapshot={snapshot} onEnd={() => void run(() => coreClient.endBreak())} />;
  }

  return (
    <>
      {/* 隐藏的 Tauri 事件预览接收器：不随页面切换卸载 */}
      <img ref={vision.previewRef} className="pointer-events-none fixed -left-0.5 -top-0.5 size-px opacity-0" alt="" aria-hidden="true" />
      <Dashboard
        snapshot={snapshot}
        page={page}
        statistics={statistics}
        visionStatus={vision.status}
        streamUrl={vision.streamUrl}
        previewError={vision.previewError}
        onRetryPreview={vision.retryPreview}
        landmarks={vision.landmarks}
        error={cameraFailure ?? error}
        onPage={setPage}
        onPause={(minutes) => void run(() => coreClient.pauseMonitoring(minutes))}
        onResume={() => void run(() => coreClient.resumeMonitoring())}
        onStartBreak={() => void run(() => coreClient.startBreak())}
        onSaveSettings={saveSettings}
        onExport={() => void exportStatistics()}
        onDeleteData={() => void deleteData()}
        onRecalibrate={() => void recalibrate()}
      />
      {/* 浏览器开发环境保留页面内预览；桌面端只允许 Rust 创建的独立
          reminder-island 窗口承载提醒，避免在主窗口顶部重复渲染“伪灵动岛”。 */}
      {!isTauri() && snapshot.currentReminder && (
        <ReminderOverlay
          reminder={snapshot.currentReminder}
          onBreak={() => void run(() => coreClient.startBreak())}
          onSnooze={() => void run(() => coreClient.snoozeReminder(10))}
          onDismiss={() => void run(() => coreClient.dismissReminder())}
          onPause={() => void run(() => coreClient.pauseMonitoring(60))}
        />
      )}
      {!isTauri() && import.meta.env.DEV && (
        <button className="fixed bottom-3 right-3 z-80 rounded-lg border border-dashed border-edge bg-panel/85 px-2 py-1 text-[8px] text-muted" onClick={() => { mockCore.triggerDemoReminder(); void coreClient.getSnapshot().then(setSnapshot); }}>预览提醒</button>
      )}
    </>
  );
}
