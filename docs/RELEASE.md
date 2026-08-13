# GitHub Releases 与应用内更新

本项目使用 Tauri 2 updater、NSIS 和 GitHub Releases。更新包必须签名；签名校验不能关闭。

安装包产品名固定为英文 `Cervical Guard`，避免 GitHub Release 对非 ASCII 资产名进行截断或改写。

## 一次性配置

1. 私钥保存在本机 `C:\Users\zero\.tauri\cervical-guard.key`，不要提交、发送或丢失。公钥已写入 `src-tauri/tauri.conf.json`。
2. 在 GitHub 仓库 `Settings > Secrets and variables > Actions` 添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：私钥文件的完整文本；
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：当前密钥未设置密码，因此可留空或不创建。生产密钥建议设置强密码。
3. 妥善离线备份私钥。丢失私钥后，已安装版本无法验证以后发布的更新。

## 发布

1. 使用 `git add <files>` 暂存修改，再运行 `pnpm commit`，按提示选择 `feat`、`fix`、`perf` 或其他 Conventional Commit 类型并提交。仓库的 `commit-msg` hook 也会校验直接执行的 `git commit`。
2. 确认工作区干净，然后运行 `pnpm tag`。
3. 命令会读取并显示最新正式 Release、远端已使用的最高标签版本和当前项目版本，然后提示输入新的 `x.y.z` 版本号。也可非交互运行，例如 `pnpm tag -- 0.2.0`。
4. 新版本必须高于已发布或已撤回的所有标签版本。命令会同步更新 `package.json`、`src-tauri/Cargo.toml`、`Cargo.lock` 和 `tauri.conf.json`，执行完整测试并提交版本变更。
5. 测试通过后会预览自动更新日志，再推送代码和标签、等待 GitHub Actions 完成，并检查正式 Release 中存在 NSIS、签名和 `latest.json` 后才返回成功。

更新日志读取上一个稳定版本标签到当前标签之间的提交，生成英文 Markdown，并按 `Features`、`Fixes`、`Performance`、`Other Changes` 分类。无法识别的历史提交会进入 `Other Changes`，不会阻止发布；自动版本提交 `chore: release vX.Y.Z` 不进入日志。GitHub Release 正文和 Tauri `latest.json` 的 `notes` 使用同一份内容。

## 撤回并替换最新版本

1. 运行 `pnpm release:withdraw`，核对最新版本和待删除资产，并按提示输入完整确认文本。
2. 撤回只删除最新 GitHub Release 及下载资产，保留 Git 标签作为不可复用的版本记录。
3. 修复代码并提交后再次运行 `pnpm tag`，输入更高版本。例如撤回 `0.1.0` 后发布 `0.1.1`。

不要用相同版本号覆盖已经公开过的安装包。GitHub CDN、`latest.json` 和客户端可能缓存旧二进制或签名；复用版本号会造成不可预测的更新校验结果。

不要手工编辑 `latest.json` 的签名字段；`tauri-action` 会从当前构建生成正确内容。
