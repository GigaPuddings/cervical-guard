/** Windows 摄像头切换/冷启动期间允许的连续预览解码失败次数。 */
export const PREVIEW_FAILURE_LIMIT = 36

/** 姿态管线就绪后等待首个可显示预览帧的最长时间。 */
export const PREVIEW_START_TIMEOUT_MS = 8_000

export function shouldReportPreviewFailure(failureCount: number): boolean {
  return failureCount >= PREVIEW_FAILURE_LIMIT
}
