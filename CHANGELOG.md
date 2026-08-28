# 更新日志

自动化发布说明由 `pnpm tag` 按 Conventional Commit 从上一个稳定 tag 生成为英文分类日志(GitHub Release 正文与 `latest.json` 共用,规则见 `docs/RELEASE.md`)。本文件只记录不随版本自动生成的产品状态说明。

## Unreleased

- **健康报告页(`report`)保持隐藏**:页面路由与骨架已在代码中,但 v0.1.19 起从导航中隐藏(`hide unfinished health report tab`)。计划在阶段 2 手机低头检测落地、统计数据聚合出"每日/每周习惯总结"后,作为完整的健康习惯报告一并开放;在此之前不会以半成品形态出现在主导航中。
