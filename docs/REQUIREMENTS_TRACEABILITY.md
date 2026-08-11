# MVP 需求追踪表

本表对应《颈椎健康与久坐行为提醒应用需求分析》和《颈椎健康行为提醒桌面应用技术架构设计方案 v2.0》定义的首个可用版本。

| 验收项 | 实现位置 | 验证方式 |
| --- | --- | --- |
| 权限前先解释用途；不申请麦克风 | `src/features/onboarding`、`src/vision/useVisionMonitor.ts` | 首次引导真实浏览器流程 |
| 权限拒绝后降级为定时提醒 | `Calibration.tsx`、`core.rs` | 无摄像头 Playwright 流程、Rust 生命周期测试 |
| 摄像头暂停后释放 | `vision.rs::stop`、`useVisionMonitor.ts` effect cleanup | 会话停止后摄像头指示灯熄灭 |
| 人体存在、坐姿、站姿观察值 | `src-tauri/src/vision.rs` | MoveNet SinglePose Lightning + 特征融合 Rust 单测 |
| 连续久坐使用单调时间 | `src-tauri/src/core.rs` | `timer_mode_triggers_after_continuous_threshold` |
| 低头使用相对校准基线 | `vision.rs`、`Calibration.tsx` | `uses_relative_calibration_baseline` |
| 低质量画面不产生明确判断 | `core.rs` QualityGate | `low_quality_observation_never_asserts_head_down` |
| 多帧确认、迟滞、人物缺失容忍 | `core.rs::ingest` | 3 秒进入、4 秒退出、10 秒缺失容忍 |
| 暂停、延后、忽略、休息 | `ReminderOverlay.tsx`、Tauri commands | Playwright 提醒到休息流程 |
| 久坐与低头提醒合并、独立冷却 | `core.rs::check_reminders` | Rust 领域逻辑 |
| 会议模式降低提醒等级 | `core.rs::check_reminders` | 设置驱动策略 |
| 今日统计、7/30 日趋势 | `database.rs`、`Dashboard.tsx` | SQLite 查询与真实页面截图 |
| 本地 CSV 导出与全部删除 | `lib.rs`、`database.rs` | `deletion_removes_events_and_statistics` |
| 不保存视频、截图、人脸、逐帧关键点 | SQLite migration、持久化接口 | 数据表审查与数据库测试 |
| 托盘后台运行、单实例、开机启动 | `src-tauri/src/lib.rs` | Tauri 编译与系统集成配置 |
| 本地模型完整性检查 | `VisionService::ensure_session` | 随应用打包的 ONNX 模型，缺失即报错并降级 |

## 阶段边界

需求文档明确将“低头使用手机检测”列为第二阶段。本 MVP 没有将普通物体或单帧结果伪装成手机识别；数据库保留 `suspected_phone_seconds` 兼容字段，IPC 协议也保留后续 Worker 升级空间。

当前视觉执行层由 Rust 后端完成：nokhwa(Windows Media Foundation)负责相机采集，ONNX Runtime 运行随应用打包的 MoveNet SinglePose Lightning 模型做姿态估计，仅把 JPEG 预览帧交给 WebView 展示、结构化观察值交给 Rust 状态机；摄像头帧不会写入数据库、日志或文件。面向长期生产运行的独立 C++ Vision Worker、WinML 硬件后端和手机目标检测模型属于架构文档的阶段 2/3，不在 MVP 验收范围。

