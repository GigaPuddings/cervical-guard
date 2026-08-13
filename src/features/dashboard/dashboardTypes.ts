import type { AppUpdater } from "../updates/updateTypes";
import type {
  AppPage,
  AppSettings,
  AppSnapshot,
  BehaviorHistoryEvent,
  DailyStatistics,
  LandmarkPoint,
} from "../../types";
import type { VisionStatus } from "../../vision/useVisionMonitor";
import type { Language } from "../../i18n";

export interface DashboardProps {
  snapshot: AppSnapshot;
  page: AppPage;
  statistics: DailyStatistics[];
  behaviorHistory: BehaviorHistoryEvent[];
  visionStatus: VisionStatus;
  streamUrl: string | null;
  previewError: string | null;
  landmarks: LandmarkPoint[];
  error: string | null;
  onPage: (page: AppPage) => void;
  onPause: (minutes: number | null) => void;
  onResume: () => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  onSaveSettings: (settings: AppSettings) => Promise<boolean>;
  onExport: () => void;
  onDeleteData: () => void;
  onEnableCamera: () => void;
  onRecalibrate: () => void;
  onRetryPreview: () => void;
  onHelp: () => void;
  onLanguage: (language: Language) => void;
  updater: AppUpdater;
}
