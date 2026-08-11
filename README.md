# 健康提醒（Cervical Guard）

健康提醒是一款 Windows 优先、核心健康监测完全在本地运行的姿态与久坐行为提醒桌面应用。本仓库实现了需求文档定义的阶段 1 MVP：摄像头授权与校准、人体姿态观察、久坐/持续低头状态机、提醒与休息、统计与隐私数据管理，以及摄像头不可用时的普通定时提醒。天气页是明确标识的可选联网能力，不会上传摄像头画面或参与健康状态机判断。

> 本应用只提供日常健康行为提醒，不用于疾病诊断、治疗或替代医生建议。

## 已实现

- 隐私优先的首次引导，用户主动操作后才申请摄像头；不申请麦克风。
- 相机采集与姿态估计全部在 Rust 后端完成（nokhwa + ONNX Runtime），CPU 本地推理、断网可用、不依赖浏览器权限模型。
- 正常坐姿基线校准，以及有人/无人、坐姿/站姿、持续低头和画面质量观察值。
- Rust 单调计时状态机：多帧确认、进入/退出迟滞、低置信度门控、短暂离座容忍。
- 久坐与低头提醒合并、独立冷却、会议模式、开始休息、延后、忽略和暂停。
- SQLite 设置、事件和每日汇总；7/30 日趋势、CSV 导出和不可逆的统计清空。
- 系统通知、单实例、开机启动、关闭到托盘和摄像头不可用后的定时模式。
- 天气与活动页：中国城市行政中心搜索、最多 8 个地点、当前天气与 5 日预报、15 分钟缓存及断网旧数据回退；首选地点同步显示在今日概览、休息页和灵动岛。
- 随应用打包的 MoveNet SinglePose Lightning 姿态估计模型，缺失即报错并降级为定时提醒。

手机目标检测按原需求属于第二阶段，当前版本不提供虚假的“玩手机”判断。详细映射见 [MVP 需求追踪表](docs/REQUIREMENTS_TRACEABILITY.md)。

## 技术结构

```text
React 19 + TypeScript strict + 原生 CSS（仅交互与预览）
  ├─ 可选在线天气读模型：Open-Meteo + localStorage 短期缓存
  └─ Tauri command / event（schemaVersion = 2）
       ├─ Rust 视觉层：nokhwa 相机采集 + ONNX Runtime 姿态估计
       │    └─ JPEG 预览帧 → WebView 展示；结构化观察值 → 状态机
       └─ Rust 领域状态机
            ├─ 提醒策略与系统通知
            ├─ SQLite 设置/事件/每日统计
            └─ 托盘、单实例与开机启动
```

摄像头帧只在 Rust 后端内存中短暂存在并压缩为 JPEG 预览帧，不会写入数据库、日志或文件。Rust 是行为判断的唯一事实来源，React 不自行决定是否提醒。

天气能力的详细组件边界、接口契约、缓存/降级、隐私和商业化约束见 [天气功能架构设计](docs/WEATHER_ARCHITECTURE.md)。

## 本地运行

需要 Node.js 20+、pnpm 11、Rust stable、Windows WebView2 和 Visual Studio C++ Build Tools。首次构建会联网下载 ONNX Runtime 运行时（由 ort 的 download-binaries 特性完成）。

姿态模型需要单独下载（模型文件不纳入 Git）:

```powershell
pip install tensorflow tf2onnx
python scripts/download_movenet_model.py
```

```powershell
pnpm install
pnpm tauri dev
```

只运行浏览器界面（会使用内存模拟核心，便于 UI 开发）：

```powershell
pnpm dev
```

## 验证与构建

```powershell
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Windows 安装包生成在 `src-tauri/target/release/bundle/nsis/`。

## 隐私与本地数据

- 默认不保存或上传视频、截图、人脸、关键点序列或手机内容。
- SQLite 数据库位于系统应用数据目录 `com.cervicalguard.desktop/` 下，只含设置、结构化事件和汇总统计。
- “删除全部统计”会在事务中删除会话、行为事件和每日统计，同时保留用户设置与校准基线。
- 诊断开关预留给后续匿名数值日志；当前版本即使开启也不会写入图像。
- 天气页只会把用户输入的城市关键词发送给 Open-Meteo，并按用户选择的城市坐标获取预报；不读取设备位置。天气偏好和缓存保存在 WebView 的 localStorage 中。

第三方依赖与模型许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
