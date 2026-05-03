# Changelog

## v0.2.4

- **年度视图**：顶栏在 Month 旁增加 **Year**，`ViewType` 含 `'year'`（`src/types/index.ts`）；`YearView.tsx` 按自然月汇总与日历区间相交的日程数与完成数，点击某月切换到当月 **Month** 视图（`App.tsx` 联动年份下拉与按年翻页）。
- **全局搜索增强**：`GlobalSearchPanel.tsx` 支持任务 / 日程 / 笔记统一检索；协作模式下可按 **含队友 / 只看我的** 过滤；快捷键打开面板；笔记片段高亮；可按周 / 月 / 年滚动筛选（列表平铺展示）。
- **开发体验**：`vite.config.ts` 中 `server.host: true`，便于局域网设备访问终端输出的 Network 地址调试前端。
- **侧栏文案**：年视图下 `TodoSidebar` 副标题与空列表提示与月 / 周 / 日区分。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）均为 **0.2.4**；发布安装包与 Git 标签请使用 **`v0.2.4`**（见 `.cursorrules`）。

## v0.2.3

- **前端质量门禁**：`npm run lint` 无 error；修复 `react-hooks/set-state-in-effect`（`App.tsx`、`TodoSidebar.tsx` 中对需在 effect 内更新的状态使用 `queueMicrotask`，语义基本不变）。
- **账号 Context 拆分**：`AccountAuthProvider` 与 `useSharedAccountAuth` 分文件（`sharedAccountAuthContext.ts`、`useSharedAccountAuth.ts`），消除 Fast Refresh 规则告警，与单一登录态约定一致。
- **同步健壮性**：`AccountLoginModal` 个人云定时同步与协作空闲双向路径对 `pullSnapshot` / `pushSnapshot` / `onPullSnapshot` / `onPushSnapshot` 使用 ref；`checkSyncStatus` 结合 `baseVersionRef` 与稳定 `useCallback`；快照比对辅助函数提升至模块级——降低定时同步读到过期闭包、版本判断不准等偶现问题概率。
- **协作删笔记**：协作区删除本人笔记时保留归属（`App.tsx`），避免切回个人云时删除墓碑无法合并导致旧笔记复活（见较早提交说明）。
- **依赖审计**：温和 `npm audit fix` 后剩余告警集中于 `@cloudbase/node-sdk` 传递链；不建议未经回归使用 `npm audit fix --force`。
- **已知限制**：部分 Windows 环境下 `cargo clippy`/链接仍可能出现 `LNK1105`/`1224`，需在构建机配置 Defender 排除、`CARGO_BUILD_JOBS=1` 或独立 `CARGO_TARGET_DIR` 等后再纳入发布门禁。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）均为 **0.2.3**；发布安装包与 Git 标签请使用 **`v0.2.3`**（见 `.cursorrules`）。

## v0.2.2

- **协作切回个人云**：从协作工作区切到个人云时，先拉取个人快照，再仅合并协作内存中**归属当前用户**的待办、日程与笔记（`effectiveTodoOwnerEmail` / `effectiveEventOwnerEmail`；笔记须 `noteOwnerByDate` 明确为本人，无归属键的日期不合并，避免历史脏数据）。**不合并**协作侧的待办/日程删除墓碑，优先保护个人云已有数据（保守策略）。实现见 `App.tsx` 的 `buildMyCollaborationSliceForPersonalMerge` 与 `switchToPersonalWorkspace`。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）均为 **0.2.2**；发布安装包与 Git 标签请使用 **`v0.2.2`**（见 `.cursorrules`）。

## v0.2.1

- **个人云下行**：`watch` 与约 **15s** 一次云函数 **`pull` 并行**（`watch` 仅作加速）；协作工作区行为不变。顶栏提示由「轮询兜底」改为 **「定时拉取」**；`watch` 初始化失败增加 **`.catch`** 兜底。
- **登录自动拉取**：验码成功后立即 **个人云 `pull` 合并** 并写入 **`todo-calendar-first-pull-done`**（解锁自动推 / 弹窗内定时同步）；若在 **协作工作区** 登录则 **自动 `team-pull`**；协作自动拉取失败时提示 **「登录时自动拉取失败，必须手动拉」**。
- **退出前同步**：点「退出业务登录」先选 **退出并清空本机日历数据** 或 **仅退出账号，保留本地数据**；再尝试 **推送**（个人 `push` / 协作 `team-push`，只读成员跳过）；成功则提示 **已同步** 后登出；失败则 **确认是否仍要退出**（取消则保留登录）。选清空时由 `App.tsx` 清理本地快照与工作区键并恢复默认示例数据。
- **协作权限细化**：队友权限升级为 `bothPush` / `peerReadOnly` / `peerReadAllWriteOwn` 三档；“读全写己”下任务、日程、笔记统一按人分权。
- **协作笔记提醒**：队友笔记首行显示 👍 慎改提示；仅 `bothPush` 允许编辑队友笔记，其余两档对队友笔记只读。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）均为 **0.2.1**；发布安装包与 Git 标签请使用 **`v0.2.1`**（见 `.cursorrules`）。

## v0.2.0

- **双人协作（重大功能）**：在账号弹窗「双人协作」中创建/加入协作空间（`team_snapshots`，MVP 最多 2 人），与个人云 `user_snapshots` **数据隔离**；工作区可在「个人云」与「协作云」之间切换（`App.tsx` + `config.ts` 本地键）。
- **云函数 `newworld`**：新增 `team-create`、`team-join`、`team-leave`、`team-get`、`team-pull`、`team-push`、`team-set-peer-read-only`；协作快照使用与个人云相同的 `version` / `baseVersion` 409 冲突语义；字段 **`peerReadOnly`** 为 true 时仅 **`ownerEmail`（创建者）** 可推送，队友仅可拉取。
- **前端**：`authApi.ts` 协作接口；`AccountLoginModal.tsx` 协作 UI、协作模式下拉推与权限选项；协作模式下关闭 `user_snapshots` 的 watch/空闲双向同步；`App.tsx` 协作防抖自动推送（需协作侧首次拉取标记 `team-first-pull-*`）。
- **云数据库写入**：当文档中 **`snapshot` 为 `null`** 时，`update` 合并会触发 Mongo 报错 `Cannot create field ... in element {snapshot: null}`，已在 **`push` / `team-push`** 中对 `snapshot` 使用 **`db.command.set`（`_.set`）** 整体替换；并统一经 **`snapshotForStore`** 规范化。
- **运维与排错**：全局 `catch` 对集合缺失返回更可读提示；`handlePull` / `ensureSnapshotDbAuthUid` 对集合不存在做降级；便于云函数日志对照。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）均为 **0.2.0**；发布安装包与 Git 标签请使用 **`v0.2.0`**（见 `.cursorrules`）。

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
