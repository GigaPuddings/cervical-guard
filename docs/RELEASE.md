# GitHub Releases 与应用内更新

本项目使用 Tauri 2 updater、NSIS 和 GitHub Releases。更新包必须签名；签名校验不能关闭。

## 一次性配置

1. 私钥保存在本机 `C:\Users\zero\.tauri\cervical-guard.key`，不要提交、发送或丢失。公钥已写入 `src-tauri/tauri.conf.json`。
2. 在 GitHub 仓库 `Settings > Secrets and variables > Actions` 添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整文本；
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：当前密钥未设置密码，因此可留空或不创建。生产密钥建议设置强密码。
3. 妥善离线备份私钥。丢失私钥后，已安装版本无法验证以后发布的更新。

## 发布

1. 同时更新 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的 SemVer 版本号并提交。
2. 在干净工作区运行 `pnpm tag`。该命令会执行完整测试、校验三处版本一致、推送当前提交，并创建、上传 `v<version>` 标签。
3. GitHub Actions 会生成 NSIS 安装包、更新签名和 `latest.json`，然后自动发布正式 GitHub Release。
4. 在 Actions 页面确认 `Release desktop app` 成功；正式 Release 会被应用内更新检查发现。

不要手工编辑 `latest.json` 的签名字段；`tauri-action` 会从当前构建生成正确内容。
