# Changelog

## v0.1.6

- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 Git 标签 **`v0.1.6`** 一致；Windows 安装包文件名为 `Todo Calendar_0.1.6_x64-setup.exe`，归档目录 `release/v0.1.6/`。
- 界面：深浅主题切换（默认深色；浅色为暖灰底 + 爱马仕橙点缀）。顶栏「搜索」左侧太阳/月亮按钮切换；偏好保存在浏览器 `localStorage` 键 `todo-calendar-theme`（桌面 EXE 同样生效）。实现见 `src/index.css` 的 `--shell-*` 变量与 `src/features/theme/useAppTheme.ts`。
- Windows 个人打包：`npx tauri build -b nsis` 生成 NSIS 安装包 `Todo Calendar_<tauri.conf 版本>_x64-setup.exe`。若链接报错 `LNK1105` / `1224`，可将 `CARGO_TARGET_DIR` 指到本机固定目录（如 `C:\Users\<用户名>\tauri-cargo-target\app`）后再构建；`scripts\release.ps1` 已采用该约定。产物默认在 `%CARGO_TARGET_DIR%\release\bundle\nsis\`，可拷贝到仓库 `release\v<版本号>\` 便于留存分发。详见 `PROJECT_GUIDE.md` §2.7～§2.8。
- 同步收口：顶栏状态改为「已登录 · 拉/推 时间 ·（可选）轮询兜底」；`[sync-debug]` 日志默认关闭，仅在 `.env` 设置 `VITE_SYNC_DEBUG=true` 时输出，且同类告警约 30s 节流。

## v0.1.5

- 账号与快照：云函数 `newworld` 混合同步（`dbAuthUid`、自定义登录票据、pull/push）；前端 `AccountAuthProvider` 统一登录态；`App` 防抖自动 push；`watch` 不可用时以 `pull` 轮询兜底。
- 文档与协作规则：`PROJECT_GUIDE.md`、`.cursorrules` 同步架构说明。
- Windows 安装包：在本机已配置 VS Build Tools 的前提下执行 `scripts\release.ps1`（需当前 `HEAD` 已打并推送标签 `v0.1.5`），生成后复制到 `release/v0.1.5/`；仓库中可保留历史版本安装包目录（如 `v0.1.3`）便于分发。

## v0.1.4

- Added CloudBase backend dependencies for account-system integration experiments.
- Added duplicate-confirmation guard when adding search results into today's plan.
- Bumped app/package/Tauri versions to `0.1.4` for the next release cycle.

## v0.1.3

- Added one-click release script `scripts/release.ps1` for version check, NSIS build, and release artifact copy.
- Added `.cursorrules` release conventions to keep EXE version aligned with Git tag version.
- Fixed release script parsing issues and validated release workflow guard checks.

## v0.1.2

- 增加全局搜索：顶部「搜索」打开弹窗，按关键词搜索**全部**日历事件。
- 支持「仅看未完成」过滤；结果展示日期与时间，点击可跳转到当日日历视图。
- 弹窗固定高度，列表区域内部滚动，避免随结果数量上下跳动。
- 新增 `DateWheelPicker` 组件，预留后续按时间段筛选扩展。

## v0.1.1

- Added task reminder notifications for scheduled events.
- Added a sidebar "Test Notification" action to quickly verify the reminder pipeline.
- Tuned reminder checkpoints to 50/45/40/35/30/25/20/15/10/5 minutes before start.
- Updated desktop notification integration via Tauri notification plugin.

## v0.1.0

- Initial release of the Todo Calendar application.
- Added month/week/day calendar views with drag-and-drop scheduling.
- Added Todo count rules for schedule/complete/uncomplete flows.
- Added task editing, deletion confirmation, and category management.
- Added date-based notes with visual markers across calendar views.
- Added local persistence, import/export backup, and reset-to-default actions.
- Added Tauri desktop packaging configuration and Windows installer output.
