import { invoke, isTauri } from "@tauri-apps/api/core";
import { snapshotSchema, statisticsSchema } from "../schemas";
import type {
  AppSettings,
  AppSnapshot,
  CalibrationResult,
  CameraDevice,
  DailyStatistics,
  VisionFrame,
  VisionObservation,
} from "../types";
import { mockCore } from "./mockCore";

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return mockCore.command<T>(name, args);
  return invoke<T>(name, args);
}

export const coreClient = {
  async getSnapshot(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("get_app_snapshot"));
  },

  async finishOnboarding(mode: "camera" | "timer", permission: AppSnapshot["permission"]): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("finish_onboarding", { mode, permission }));
  },

  async saveCalibration(result: CalibrationResult): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("save_calibration", { result }));
  },

  async startMonitoring(mode: "camera" | "timer"): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("start_monitoring", { mode }));
  },

  async startCalibration(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("start_calibration"));
  },

  async ingestObservation(observation: VisionObservation): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("ingest_observation", { observation }));
  },

  async pauseMonitoring(minutes: number | null): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("pause_monitoring", { minutes }));
  },

  async resumeMonitoring(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("resume_monitoring"));
  },

  async startBreak(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("start_break"));
  },

  async endBreak(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("end_break"));
  },

  async snoozeReminder(minutes = 10): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("snooze_reminder", { minutes }));
  },

  async dismissReminder(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("dismiss_reminder"));
  },

  async updateSettings(settings: AppSettings): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("update_settings", { settings }));
  },

  async getStatistics(days: number): Promise<DailyStatistics[]> {
    return statisticsSchema.parse(await command<unknown>("get_statistics", { days }));
  },

  async exportStatistics(): Promise<string> {
    return command<string>("export_statistics");
  },

  async deleteLocalData(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>("delete_local_data"));
  },

  async listCameras(): Promise<CameraDevice[]> {
    return command<CameraDevice[]>("list_cameras");
  },

  async startVision(cameraId: string, baseline: number | null): Promise<void> {
    await command<void>("start_vision", { cameraId, baseline });
  },

  async stopVision(): Promise<void> {
    await command<unknown>("stop_vision");
  },

  async captureFrame(): Promise<VisionFrame> {
    return command<VisionFrame>("capture_frame");
  },

  async notify(title: string, body: string, silent = true): Promise<void> {
    if (!isTauri()) {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, silent });
      }
      return;
    }
    const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  },
};
