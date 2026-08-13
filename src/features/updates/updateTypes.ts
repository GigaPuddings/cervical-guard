export type UpdateResource = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;

export type UpdateStage = "idle" | "checking" | "latest" | "available" | "downloading" | "restarting" | "error";

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

export function shouldShowDeferredUpdateAction(stage: UpdateStage, updateAvailable: boolean): boolean {
  return stage === "downloading" || (stage === "available" && updateAvailable);
}

export function shouldShowActualDownloadProgress(stage: UpdateStage, downloadStarted: boolean): boolean {
  return stage === "downloading" && downloadStarted;
}
