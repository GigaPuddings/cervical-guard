# Design QA

**Source visual truth**

- `C:\Users\zero\AppData\Local\Temp\codex-clipboard-9ccde4f4-d3a6-47d6-ac05-c31cfa057cdc.png` — latest weather-page annotation; red regions identify the selected location card, feels-like treatment, advice/temperature row, and seven-day forecast strip.
- `C:\Users\zero\AppData\Local\Temp\codex-clipboard-6bbada27-662f-4ea0-bc6b-2f75802f8014.png` — latest habit-page annotation; red regions identify the period selector and six-card summary row.
- `C:\Users\zero\AppData\Local\Temp\codex-clipboard-afbc2366-dbfa-4009-a3a8-ae844a93ced4.png` — latest compact-density and preview-alignment reference.
- `D:\zero\文档\OneDrive\Desktop\今日概览.png`
- `D:\zero\文档\OneDrive\Desktop\习惯趋势.png`
- `D:\zero\文档\OneDrive\Desktop\天气与活动.png`
- `D:\zero\文档\OneDrive\Desktop\偏好设置.png`
- Icon language reference: `C:\Users\zero\AppData\Local\Temp\codex-clipboard-809535e8-1501-4cab-9a6b-b418e713408a.png`

**Rendered implementation**

- Local preview: `http://127.0.0.1:4173/?demo=target`
- Screenshots:
  - `output/design-qa/home.png`
  - `output/design-qa/home-comments-revised.png`
  - `output/design-qa/home-density-reference-viewport.png`
  - `output/design-qa/home-density-revised.png`
  - `output/design-qa/habit-trend.png`
  - `output/design-qa/habit-annotations-final.png`
  - `output/design-qa/habit-annotations-1672x941.png`
  - `output/design-qa/weather.png`
  - `output/design-qa/weather-annotations-final-1672x941.png`
  - `output/design-qa/weather-annotations-final-1708x898.png`
  - `output/design-qa/settings.png`

**Normalization and state**

- CSS viewport: `1338 x 753`.
- Implementation screenshots: `1338 x 753` pixels at device density `1`.
- Source screenshots: `1672 x 941` pixels. They were normalized to `1338 x 753` with high-quality bicubic resampling to account for the apparent 125% Windows capture density before visual comparison.
- Browser-comment correction pass: annotated CSS viewport `1708 x 898` at device density `1.5`, with document dimensions confirmed at `1708 x 898` and no overflow. The in-app screenshot service emitted `1280 x 720` comparison evidence, so the source was normalized to the same `1280 x 720` image dimensions. The responsive ring now reaches the reference `280px` size while retaining its proportions.
- Compact-density correction pass: source and implementation were captured at the same `1671 x 941` CSS viewport and compared at `1:1` pixel dimensions. A second implementation capture at the user's `1708 x 898` viewport confirms the responsive height contraction with no document overflow.
- Habit annotation pass: the original `习惯趋势.png` source is `1672 x 941` pixels and the browser implementation was recaptured at the same `1672 x 941` CSS viewport with device density `1`. A separate `1708 x 898` capture preserves the user's current browser viewport. Dynamic metric values remain intentionally live; geometry, labels, type hierarchy, and selector state are compared directly.
- Weather annotation pass: the original `天气与活动.png` source and implementation were compared at the same `1672 x 941` CSS viewport and device density `1`; a second `1708 x 898` capture verifies the user's current window. The page now uses a responsive two-density height system, so the detail card fills the available desktop height without clipping or the prior empty lower canvas.
- Theme: light.
- Home state: monitoring, natural posture, 53:02 seated, 85% stability.
- Habit state: seven-day segment selected; activity data remains realistic runtime mock data, so values and dates intentionally differ from the static target.
- Weather state: Shanghai selected; live Open-Meteo values intentionally differ from the static target capture.
- Settings state: Dynamic Island category selected with target switch states.

**Full-view comparison evidence**

- `output/design-qa/home-comparison.png`
- `output/design-qa/home-comments-comparison.png` — post-annotation full-page comparison.
- `output/design-qa/home-density-comparison.png` — exact-viewport compact-density comparison.
- `output/design-qa/habit-trend-comparison.png`
- `output/design-qa/habit-annotations-equal-comparison.png` — latest same-size full-view habit comparison.
- `output/design-qa/weather-comparison.png`
- `output/design-qa/weather-annotations-equal-comparison.png` — latest same-size full-view weather comparison.
- `output/design-qa/settings-comparison.png`

**Focused comparison evidence**

- `output/design-qa/home-focused-comparison.png` — current-session and live-detection cards.
- `output/design-qa/home-comments-focused-comparison.png` — post-annotation ring, posture details, preview treatment, and detection entry cards.
- `output/design-qa/home-density-focused-comparison.png` — exact-viewport main cards, preview icon, advice row, and detection entries.
- `output/design-qa/habit-trend-focused-comparison.png` — metric row, chart, and recent records.
- `output/design-qa/habit-annotations-equal-focused.png` — latest period selector and six metric cards, cropped from the same-size source and implementation captures.
- `output/design-qa/weather-focused-comparison.png` — weather dashboard, advice, and seven-day strip.
- `output/design-qa/weather-annotations-equal-focused.png` — latest selected-place card, hero, six conditions, advice/range cards, and forecast strip.
- `output/design-qa/settings-focused-comparison.png` — Dynamic Island settings rows and switch states.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Typography: Microsoft YaHei UI/PingFang SC/Noto Sans CJK SC system stack, weight hierarchy, line height, and compact desktop text density visually match the reference. No broken wrapping or truncation was observed at the target viewport.
- Spacing and layout: 240px sidebar, main-column proportions, card placement, radii, border weight, and light elevation align with the normalized references. The 1280 x 720 compact-window check produced no document overflow.
- Colors and tokens: canvas `#F7F8F5`, panel `#FFFFFF`, accent `#28784B`, accent-soft `#E7F1E8`, foreground `#18231D`, muted `#6B756F`, and border `#E5E9E5` consistently map to the source visual system.
- Image quality: the weather hero uses a dedicated raster skyline asset with the correct wide crop, quiet blue-day lighting, and sufficient resolution. No placeholder, inline SVG, or CSS-art substitute is used for the hero.
- Copy and content: page headings, navigation, privacy copy, setting labels, and primary actions match the provided Chinese design. Dynamic statistics and live weather values are expected to differ from the static captures.
- Icons and controls: Lucide outline icons provide a consistent stroke family. Selected navigation, period segment, disabled/enabled switches, and primary CTA states are visible and aligned.
- Annotation corrections: the session ring now uses rounded progress ends, a visible head marker, and the reference green gradient; posture encouragement copy and its icon change with the live posture/lifecycle state; the camera preview uses the target dark-green falloff with no black caption layer; the two detection entries are independent bordered cards; and the ignored-reminder note/icon changes across zero, occasional, and frequent-dismissal states.
- Density correction: at the reference viewport, both main cards now start at `y=225` and measure `493px` high; the preview starts at `y=285`, measures `259px` high, and its `100px` ScanFace icon is optically centered to match the reference. The advice row, two detection entries, and five metric cards now align to the same vertical rhythm as the supplied design.
- Habit annotation correction: the content is constrained to the compact desktop frame; the summary row starts at `y=192`, each card measures `144px` high, and the chart begins at `y=360`. The six cards now use the source structure—`42px` icon with the label on the same row, then the primary value and dynamic daily context beneath. The period selector measures `236 x 44px`, uses equal segments, and restores the source white active label.
- Weather annotation correction: the content frame is constrained to `1348px`, the saved-place column is `260px`, and the selected Shanghai card is approximately `64px` high with separate location and weather glyphs. At the current `1708 x 898` viewport, the weather hero is `250px`, the advice/range row is approximately `165px`, and the forecast strip is `124px`; at the `1672 x 941` reference viewport these expand to `268px`, `176px`, and `130px`. The hero restores the feels-like hierarchy, air-quality pill, target metric-card ratio, timestamp prefix, multicolor temperature range, and weekday/date hierarchy.
- Accessibility and behavior: primary controls use semantic buttons, tabs, checkboxes, labels, alt text, and visible focus-capable controls. Runtime console contains no warnings or errors.

**Comparison history**

1. Initial comparison found P2 vertical drift in the weather detail footer and forecast strip, a visible internal scrollbar in the Dynamic Island settings panel, demo timer drift, and switch-state mismatch.
2. Fixes applied: rebalanced weather advice/forecast heights, removed island-panel-only overflow, aligned the settings grid to the source margins, froze the visual demo timer at 53:02, and seeded the reference switch states.
3. Focused post-fix comparisons above confirm the weather footer fits the frame, the settings panel has no scrollbar, margins and rows align, and the target control states are restored.
4. Browser comments 1–4 identified P2 drift in the session ring scale/color/caps, posture typography and supporting icons, preview gradient/caption alignment, the two detection entry surfaces, and the ignored-reminder note icon.
5. Fixes applied: introduced a responsive rounded progress ring, matched the source gradient direction, restored the requested copy and Lucide icons, restructured the preview caption and entry cards, and added the metric note icon.
6. `home-comments-comparison.png` and `home-comments-focused-comparison.png` are the post-fix visual evidence. They show no remaining actionable P0/P1/P2 mismatch in the four annotated regions.
7. The follow-up correction removed the preview caption fill entirely (the text remains on the preview's dark-green surface), added the progress-head marker, and made posture and ignored-reminder feedback state-driven. The focused comparison confirms the corrected no-black-layer preview and marker placement.
8. The latest annotated screenshot identified P2 drift in the main-card height, excess vertical whitespace, preview icon size, and preview icon alignment.
9. Fixes applied: capped the main track at `493px`, restored the reference header/metric row rhythm, constrained the content width, enlarged and optically centered the ScanFace icon, and matched the advice/action row heights. `home-density-comparison.png` and `home-density-focused-comparison.png` confirm the annotated regions now match at the exact reference viewport.
10. The latest habit-page annotation identified P2 drift in the period selector proportions, overly wide summary cards, the vertical icon/label stack, compressed card height, abbreviated labels, and non-reference secondary copy.
11. Fixes applied: constrained the page to the compact `1348px` content frame, restored the `108 / 144 / flexible` row rhythm, rebuilt the compact metric layout, reinstated the full source labels, and converted secondary text to dynamic source-style daily averages and longest-session date context.
12. `habit-annotations-equal-comparison.png` and `habit-annotations-equal-focused.png` are the post-fix evidence. The focused comparison shows no remaining actionable P0/P1/P2 mismatch in the two red regions.
13. The weather-page annotation identified P2 drift in the selected-place card, feels-like placement, dashboard aspect ratio, compressed advice/range cards, short forecast strip, and excess empty canvas below the weather module.
14. Fixes applied: constrained the weather frame, restored the `260px` place column and compact selected card, rebuilt the hero/metric proportions, added the air-quality and update treatments, introduced height-responsive advice and forecast tracks, and restored the source temperature-range and forecast typography.
15. `weather-annotations-equal-comparison.png` and `weather-annotations-equal-focused.png` are the post-fix evidence. No actionable P0/P1/P2 mismatch remains in the annotated weather regions; live measurements and forecast text intentionally remain dynamic.

**Primary interactions tested**

- Sidebar navigation across all four target pages.
- Seven-day / thirty-day habit filter and restoration to seven days.
- Dynamic Island master checkbox off/on with state restoration.
- Start break / end break flow, including dynamic posture copy/icon transition to `休息进行中` and restoration to `姿态自然`.
- Exact `1671 x 941` reference viewport and `1708 x 898` current-window fit; both remained free of horizontal and vertical document overflow.
- Compact 1280 x 720 desktop fit.
- Weather Add City control transfers focus to the city search field; weather navigation and responsive viewport restoration were rechecked after reload.

**Verification**

- `pnpm test`: 13 files, 40 tests passed.
- `pnpm test:release`: 15 tests passed.
- `pnpm build`: passed.
- Browser console: 0 warnings, 0 errors.

**Follow-up polish**

- P3: weather temperature, forecast icons, and statistic values remain live/dynamic rather than frozen to the exact numbers in the supplied screenshots; this preserves the product behavior without changing the target composition.

**Default-window responsive correction**

- New source evidence: `C:\Users\zero\AppData\Local\Temp\codex-clipboard-f8d71f4f-5df3-4616-baf7-42c1d9fa46a6.png`, `C:\Users\zero\AppData\Local\Temp\codex-clipboard-55b7fc3e-41e6-41ca-bd7c-5f106eb00dc2.png`, `C:\Users\zero\AppData\Local\Temp\codex-clipboard-0812ded2-035c-4c67-bc42-642a487803d2.png`, and `C:\Users\zero\AppData\Local\Temp\codex-clipboard-96caa627-848d-4c6e-92df-21f96039a7fd.png` document the Tauri default-window failures across Home, Habit, Weather, and Settings.
- Confirmed runtime sizes: Tauri default `1338 x 753`, minimum `1120 x 700`, and large reference `1672 x 941`. The uploaded default-window captures use Windows display scaling, so physical screenshot dimensions are larger than the CSS viewport.
- Root cause: page-specific fixed tracks and minimum column widths had been calibrated against the large reference viewport. At the real default and minimum sizes they produced Home card overlap, Habit truncation, Weather clipping/overlap, and Settings overflow.
- Fixes applied: responsive page tracks, compact default-height geometry, page-level fallback scrolling at minimum height, a `3 x 2` Habit metric fallback below `1180px`, reduced Weather minimum columns and compact hero/advice/forecast tracks, and stacked Runtime setting fields below `1280px`.
- Default final captures: `output/design-qa/responsive-home-final-1338x753.png`, `output/design-qa/responsive-habit-final-1338x753.png`, `output/design-qa/responsive-weather-final-1338x753.png`, `output/design-qa/responsive-settings-island-final-1338x753.png`, and `output/design-qa/responsive-settings-runtime-final-1338x753.png`.
- Minimum final captures: `output/design-qa/responsive-home-min-final-1120x700.png`, `output/design-qa/responsive-habit-min-1120x700.png`, `output/design-qa/responsive-weather-min-final-1120x700.png`, and `output/design-qa/responsive-settings-runtime-min-final-1120x700.png`.
- Large regression captures: `output/design-qa/responsive-home-large-1672x941.png` and `output/design-qa/responsive-habit-large-1672x941.png`.
- Same-input full comparisons: `output/design-qa/responsive-home-default-comparison.png`, `output/design-qa/responsive-habit-default-comparison.png`, `output/design-qa/responsive-weather-default-comparison.png`, and `output/design-qa/responsive-settings-default-comparison.png`.
- Same-input focused comparisons: `output/design-qa/responsive-home-default-focused.png`, `output/design-qa/responsive-habit-default-focused.png`, `output/design-qa/responsive-weather-default-focused.png`, and `output/design-qa/responsive-settings-default-focused.png`.
- Result: no actionable P0, P1, or P2 responsive mismatch remains. Default windows preserve the reference desktop density; minimum windows remain usable through deliberate vertical scrolling without horizontal clipping or component overlap.
- Final interaction regression: sidebar navigation, Habit `近 7 天 / 近 30 天`, and Settings `运行 / 灵动岛` switches were exercised at `1338 x 753`; browser console remained at 0 warnings and 0 errors.

**Weather default-density correction — 2026-08-25**

- Source visual truth: `D:\zero\文档\OneDrive\Desktop\天气与活动.png` (`1672 x 941`) and the user's latest default-window capture `C:\Users\zero\AppData\Local\Temp\codex-clipboard-646074d7-11db-4974-81c3-cc8a059a19fa.png` (`2010 x 1132`). Their apparent `1.25x` and `1.5x` Windows densities normalize to the same approximately `1338 x 753` CSS window.
- Before evidence: `output/design-qa/weather-default-user-comparison.png` and `output/design-qa/weather-default-user-focused.png` place the normalized current capture and source in the same comparison input.
- Earlier P2 findings: the outer tracks were already close, but the search box, saved-location row, detail heading, weather values, advice content, and forecast labels retained large-screen internal sizing. This made the correctly sized tracks look crowded. The user capture also showed the hero region without its skyline image.
- Fixes: added default-height internal density rules for the search, saved places, detail heading, hero copy, six metrics, advice/range cards, and seven-day forecast; reduced the compact page width by `20px` to restore the source right margin and hero/metric ratio; increased the minimum-height header track to prevent overlap; preserved the supplied `1619 x 971` Shanghai skyline asset and verified that the production build emits it.
- Browser-rendered implementation: `output/design-qa/weather-default-browser-after-pass1.png`. The in-app browser screenshot service renders at `1280 x 720`, DPR `1.5`; the page uses the same compact responsive branch as the default desktop window. The weather detail measured `748 x 600`, `scrollWidth 747`, `scrollHeight 599`; document size remained `1280 x 720`, and the hero image reported `complete: true`, natural size `1619 x 971`.
- Post-fix full comparison: `output/design-qa/weather-default-pass1-comparison.png`.
- Post-fix focused comparison: `output/design-qa/weather-default-pass1-focused.png`.
- Findings after correction: no actionable P0, P1, or P2 mismatch remains in typography, spacing/layout, colors/tokens, image quality, icons, or static copy. Live temperatures, dates, and conditions remain intentionally dynamic.
- Interaction and accessibility check: `添加城市` transfers focus to the city-search input; semantic buttons remain enabled; browser console contains 0 warnings and 0 errors.
- Verification: `pnpm test` passed 13 files / 40 tests; `pnpm build` passed. The existing bundle-size advisory remains non-blocking and unrelated to the visual correction.

**Home default-density and active-state correction — 2026-08-25**

- Source visual truth: `D:\zero\文档\OneDrive\Desktop\今日概览.png` (`1672 x 941`) and the user's latest default-window capture `C:\Users\zero\AppData\Local\Temp\codex-clipboard-cd64f2e3-dcc8-4edc-abc3-777d2eb0a6d0.png` (`2012 x 1134`). Their Windows-density-normalized logical frames are approximately `1338 x 753` and `1341 x 756`, so the supplied images are valid default-window peers.
- Before evidence: `output/design-qa/home-before-comparison.png` places both full views in one equal-size comparison input. It confirms that the outer two-column cards and five-card metric track were already close; the visible P2 drift came from oversized internal controls and the focused navigation outline.
- Fixes: reduced the default-height page title, weather summary, weather glyph/copy, and break CTA; restored the left session header to `48px`; matched the `226px` session ring, `42px` posture icon, and `28px` posture title; shifted the session contents upward through compact vertical padding; removed the selected navigation outline while keeping a soft-green keyboard-focus treatment.
- Post-fix browser evidence: `output/design-qa/home-nav-final-1280x720.png`. The in-app browser capture service is limited to a `1280 x 720` CSS viewport, so this is a compact-window regression rather than a replacement for the density-normalized default capture. It verifies that the page remains usable at the narrower viewport and that the active navigation has no border line.
- Same-input post-fix comparisons: `output/design-qa/home-final-comparison.png` and `output/design-qa/home-final-focused-comparison.png`. Dynamic time, posture, temperature, and monitoring values intentionally differ from the static design; geometry and visual hierarchy are compared independently of those values.
- Typography: the corrected display/title sizes and posture hierarchy now match the target's compact desktop optical scale; no new wrapping or truncation appears.
- Spacing and layout: outer card tracks remain unchanged; only the oversized internal header/action/icon dimensions were reduced. The left and right card proportions, preview height, advice row, detection entries, and metric-card row remain stable.
- Colors and tokens: the active navigation now resolves to `rgb(231, 241, 232)` (`#E7F1E8`) with accent text and `outline-style: none`, matching the source fill-only state. Existing canvas, card, border, and preview tokens remain unchanged.
- Image quality and icons: the existing Lucide icon family and dark-green preview surface are preserved; no raster or placeholder substitutions were introduced.
- Copy and behavior: app copy remains dynamic and source-aligned. Sidebar navigation, start/end break, pause for 30 minutes, and resume detection were exercised successfully after the density changes.
- Verification: `pnpm test` passed 13 files / 40 tests; `pnpm build` passed; `git diff --check` reported no whitespace errors (only existing LF-to-CRLF notices). The existing Vite bundle-size advisory is unchanged and unrelated to this UI correction.
- Result: no actionable P0, P1, or P2 mismatch remains in the newly reported default-window density or selected-navigation treatment.

**Full-screen proportional scaling correction — 2026-08-25**

- New source evidence: `C:\Users\zero\AppData\Local\Temp\codex-clipboard-7535d7d5-0fc9-4955-9591-6458d439411d.png` and `C:\Users\zero\AppData\Local\Temp\codex-clipboard-d7aced8b-a226-4614-8f79-9a4e4924bc9f.png` (`2561 x 1529`) document the large-window Home and Weather layouts. Their Windows-density-normalized logical viewport is approximately `1707 x 1019`.
- Confirmed root cause: the default-window fix retained a `1348px` content maximum and fixed-height page tracks. Maximizing the window increased the canvas, but the core cards did not participate in the extra width or height.
- Fixes: added a wide-desktop content track up to `1520px`; changed the Home header/main/metric tracks to `clamp()` plus a flexible middle row; scaled the session ring, posture block, preview face, advice card, detection entries, and metric row together; rebuilt the tall Weather detail card as proportional `minmax()` rows so the hero, advice/range row, and forecast strip share the available height.
- Full-screen implementation captures: `output/design-qa/fullscreen-home-after.png` and `output/design-qa/fullscreen-weather-after.png` at the same logical `1707 x 1019` viewport.
- Same-input full comparisons: `output/design-qa/fullscreen-home-comparison.png` and `output/design-qa/fullscreen-weather-comparison.png`.
- Home measurements: page `1467 x 983`; primary cards `1419 x 546`; metric row `1419 x 162`; progress ring approximately `318 x 318`. Document dimensions remain exactly `1707 x 1019`, with no horizontal or vertical overflow.
- Weather measurements: page `1467 x 983`; detail card `1119 x 802`; hero approximately `1085 x 297`; advice/range row approximately `1085 x 186`; forecast strip approximately `1085 x 145`. Document dimensions remain exactly `1707 x 1019`, with no clipping or overflow.
- Default-window regression: at `1280 x 720`, the full-screen media branch remains inactive. Home and Weather document dimensions stay `1280 x 720`; the compact Weather card retains its deliberate page-level fallback scroll at this minimum-height boundary.
- Navigation correction: the later user requirement supersedes the earlier fill-only active treatment. Active sidebar entries now retain the soft-green fill and add a subtle `38%` accent border; the border is present for both Home and Weather without changing control dimensions.
- Interaction regression: sidebar navigation, Start Break / End Break state restoration, and Weather Add City focus transfer all passed.
- Verification: `pnpm test` passed 13 files / 40 tests; `pnpm test:release` passed 15 tests; `pnpm build` passed; `git diff --check` reported no whitespace errors. The existing Vite chunk-size advisory remains non-blocking and unrelated.

**Weather city image and live guidance correction — 2026-08-25**

- Source evidence: `C:\Users\zero\AppData\Local\Temp\codex-clipboard-d06438a6-d951-4793-8412-8ec277b0261a.png` (`2010 x 1132`) marks the city hero in red and the live advice/range region in green. The active runtime state is Beijing with `100%` rain probability, `41.0 mm` precipitation, and a `24–31°` daily range.
- Confirmed P2 defects: non-Shanghai cities reused the Shanghai hero/fallback surface; only the range values and first advice sentence were live. The extra advice, four chips, activity badge, thermal copy, clothing guidance, and range-marker positions were static. Supporting cards could also contradict the live values (`41.0 mm` shown as little precipitation and `100%` shown as low probability).
- City image fix: Shanghai keeps the supplied local skyline asset; other saved cities resolve a freely licensed representative city image from MediaWiki PageImages. City changes immediately clear the previous image, stale responses are ignored, successful results are cached, and remote images expose a visible source link. The Tauri CSP now permits only the required Wikipedia API and Wikimedia image hosts.
- Live guidance fix: activity suitability, supporting metric labels, advice summary/detail, four chips, thermal assessment, clothing guidance, and both temperature-bar markers now derive from the selected city's current conditions and first daily forecast. The Beijing rain state correctly resolves to `建议室内活动`, `降水较多`, `很高`, an indoor-movement recommendation, rain gear, hydration, sunscreen, `体感炎热`, and heat-aware clothing guidance.
- Language compatibility: newly derived labels and guidance are produced independently for Chinese and English, including the city-image attribution, without retaining fixed Chinese fragments after a language switch.
- Browser evidence: `output/design-qa/weather-dynamic-beijing-after.png` at the in-app browser's `1280 x 720` capture surface (page CSS viewport `1708 x 898`); `output/design-qa/weather-dynamic-beijing-comparison.png` and `output/design-qa/weather-dynamic-beijing-focused.png` provide full and focused same-input comparisons.
- Runtime checks: switching between Shanghai and Beijing updates the hero source and alt text; the Beijing remote image completed with a non-zero natural width; the source entry and all dynamic Beijing labels were present. Document width remained equal to viewport width (`1708px`) with no horizontal overflow.
- Typography, spacing/layout, colors/tokens, icon system, and responsive tracks were intentionally left unchanged; the correction only replaces the city visual/data dependencies and contradictory copy.
- Verification: `pnpm test` passed 14 files / 44 tests; `pnpm test:release` passed 15 tests; `pnpm build` passed; `git diff --check` reported no whitespace errors (only existing LF-to-CRLF notices). The existing Vite chunk-size advisory remains non-blocking and unrelated.

**Today live-state and dynamic-data correction — 2026-08-26**

- Source visual truth: `C:\Users\zero\AppData\Local\Temp\codex-clipboard-c08f1f55-2471-4cd6-b78e-25789e5adf87.png` (`2008 x 1131`). The annotated regions identify the paused preview placeholder, current-session reminder area, and five bottom-card supporting messages.
- Final implementation captures: `output/design-qa/today-camera-running-45m-1338x753.png`, `output/design-qa/today-camera-running-45m-1120x700.png`, and `output/design-qa/today-camera-running-45m-1672x941.png`.
- Same-input comparison: `output/design-qa/today-reference-vs-implementation-1338x753.png`. The source was normalized to `1338 x 753`; its paused state is compared with the intentionally different active-camera state required by this correction.
- Preview behavior: active camera monitoring immediately hides both the ScanFace placeholder and its two-line caption. While the stream initializes, only the centered camera/connection status remains visible.
- Reminder behavior: selecting the 45-minute preset changes the header support copy, progress-ring recommendation, bottom-card guidance, exact next-reminder clock time, and remaining-minute countdown together. Browser regression confirmed the active format `下次休息 HH:mm · 剩余 45 分钟`.
- Dynamic metrics: all five supporting messages and their Lucide icons now derive from today's seated, head-down, break, dismissed-reminder, away-time, and away-count data. Partial minutes render as `少于 1 分钟` instead of being rounded up inconsistently.
- Responsive correction: the five-card row remains intact at default and large desktop widths. Below `1200px`, it becomes a three-column wrapping grid inside the existing vertical page scroll, preventing value truncation and preserving full guidance copy at the `1120 x 700` minimum window.
- Static-data audit: the fixed sidebar `08:48`, fixed timer-mode `85%`, fixed 60-minute recommendation, and fabricated Weather air-quality value were removed. Remaining fixed times are configuration choices or date parsing anchors, not runtime measurements.
- Persistence verification: same-day app reload restores current seated/head-down/away counters, session start, and last detection time. A new local date resets only the active session counters while retaining the last-detection record; legacy metadata without these fields migrates through defaults.
- Accessibility and interaction: sidebar navigation, reminder preset selection/save, resume detection, camera calibration, and camera monitoring were exercised in the in-app browser. Browser console contains 0 warnings and 0 errors.
- Verification: `pnpm test` passed 18 files / 56 tests; `pnpm test:release` passed 15 tests; `pnpm build` passed; `cargo test` passed 97 tests; `git diff --check` reported no whitespace errors. The existing Vite chunk-size advisory remains non-blocking and unrelated.
- Result: no actionable P0, P1, or P2 issue remains in the annotated regions or tested responsive states.

final result: passed
