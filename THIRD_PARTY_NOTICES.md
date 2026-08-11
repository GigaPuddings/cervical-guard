# 第三方组件与模型声明

健康提醒 MVP 随应用分发以下第三方组件。摄像头画面不会发送给这些项目或其维护者。

| 组件 | 用途 | 许可证 |
| --- | --- | --- |
| React | 桌面界面 | MIT |
| Tauri | 桌面容器与系统集成 | Apache-2.0 / MIT |
| nokhwa | 相机采集（Windows Media Foundation） | MIT |
| ONNX Runtime（ort） | 本地姿态推理 | MIT |
| MoveNet SinglePose Lightning | 本地人体关键点模型 | Apache-2.0 |
| rusqlite / SQLite | 本地结构化数据存储 | MIT / Public Domain |
| Lucide | 界面图标 | ISC |
| Zod | IPC 载荷运行时校验 | MIT |
| Zustand | 前端 UI 状态 | MIT |
| Open-Meteo Weather API | 当前天气与 5 日预报（可选联网能力） | API 数据 CC BY 4.0 |
| Open-Meteo Geocoding / GeoNames | 中国城市搜索 | CC BY 4.0 |

模型来源：Google MoveNet SinglePose Lightning（TensorFlow Hub），转换为 ONNX 格式随应用打包在 `src-tauri/resources/models/`，缺失时应用会报错并降级为定时提醒；完整性在启动推理前由本地文件存在性检查保证。

天气数据署名：Weather data by [Open-Meteo.com](https://open-meteo.com/)，依据 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用；城市搜索数据由 Open-Meteo 基于 GeoNames 提供。当前使用的免费端点须遵守供应商条款，商业发行前必须重新完成供应商、用量与许可证审查。

完整依赖版本记录在 `pnpm-lock.yaml` 与 `src-tauri/Cargo.lock`。各组件的完整许可证文本可从对应源码包获得。
