# Changelog

## v0.2.8

- **Windows 打包 / 链接**：仓库新增 **`.cargo/config.toml`**，对 **`x86_64-pc-windows-msvc`** **优先使用 `rust-lld`**，减轻 **`LNK1105` / `1224`**（杀毒或索引占用链接产物）问题；说明已写入 **`PROJECT_GUIDE.md` §2.7**。仍建议 **`CARGO_TARGET_DIR=C:\tbuild\app`**、`CARGO_BUILD_JOBS=1` 与发布脚本一致；极端环境下可再配合 Defender 排除。
- **账号 / HTTP**：`getAccountHttpOrigin` 对 `VITE_ACCOUNT_HTTP_BASE` **自动补 `https://`**；未配置时默认预付网关与 **v0.2.5 安装包**一致；`authApi` 区分 **CloudBase 鉴权**与 **业务网关** 失败环节；`desktopFetchHint` 补充控制台「跨域设置 / 添加跨域域名」与文档「跨域校验」对应说明及迟到邮件现象说明。
- **云函数 `newworld`**：对 HTTP 访问返回 **CORS** 响应头并处理 **`OPTIONS`** 预检，便于手机局域网访问时浏览器读到 JSON。
- **登录 UX**：`App` 在 **`visibilitychange` / `pageshow`** 下恢复打开设置；未登录时持久化「设置曾打开 / 邮箱草稿」至 **`sessionStorage`**（见 `config.ts` 键名）；`AccountLoginModal` 回填邮箱并发码成功后清理草稿。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（**`app`** 包）均为 **0.2.8**；发布安装包与 Git 标签请使用 **`v0.2.8`**（见 `.cursorrules`）。

## v0.2.7

- **Todo 侧栏**：分类 **`Select`（Radix）** 窄幅下拉；列表行**不显示次数徽章**（`count` 逻辑仍在 **`App.tsx`**）；完成圆圈 **`border-2`**。
- **日历 Today**：无时刻任务与时间轴**共用纵向滚动**，便于任务多时拖到刻度。
- **日历 Month**：月格子区域**纵向滚动**，避免末行日期被裁切。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（**`app`** 包）均为 **0.2.7**；发布安装包与 Git 标签请使用 **`v0.2.7`**（见 `.cursorrules`）。

## v0.2.6

- **移动端待办底栏日期行**：待办 Tab 底部在 **Today / Week / Month / Year** 分段下方增加与日历顶栏一致的 **`headerLabel` + 左右切换**；月 / 年视图支持下拉；箭头与日期间距与日历顶栏一致，整组居中。详见 `PROJECT_GUIDE.md` §2.14。
- **移动端点「Today」**：分段选择 **`today`** 时同步 **`setCurrentDate(new Date())`**，日历 / 统计 / 待办三处一致回到当天。
- **PWA（最快上架移动端）**：集成 **`vite-plugin-pwa`**（`manifest.webmanifest` + **Service Worker** 预缓存）；`public/` 提供 **`apple-touch-icon.png`**（180）、**`pwa-192.png`** / **`pwa-512.png`**；`index.html` 补充 **iOS 主屏幕** meta。部署须 **HTTPS**（或本机 `localhost`）；详见 `PROJECT_GUIDE.md` §2.13。
- **统计概览联动**：`StatisticsOverviewPanel` 与顶栏 **Today / Week / Month / Year** 及 **`currentDate`** 对齐；**待办总数**、**分类分布**使用侧栏 **`filteredTodos`**；日程统计与 **`getCalendarViewRange`**（`src/lib/viewRange.ts`，与 **`App.tsx` 中 `getFilteredTodos`** 共用）区间一致；趋势图为 **单日 / 自然周七日 / 本月每日（可横向滚动）/ 本年按月**（详见 `PROJECT_GUIDE.md` §2.11）。
- **版本对齐**：该版本发布时 `package` / Tauri / Cargo 均为 **0.2.6**；Git 标签 **`v0.2.6`**。

## v0.2.5

- **Todo 时间范围与侧栏筛选**：`TodoItem` 增加可选 **`scopeYear`**，`TodoScopeType` 含 **`year`**（年度视图下新建为年度任务）。**Today / Week / Month / Year** 切换时，侧栏仅列出与当前时间段匹配的任务（日历上在该时间段内有安排的仍会显示）。每条任务标题上方展示 **`formatTodoScopeLabel`**（`src/lib/todoScope.ts`）；拖拽单日任务改期时同步更新 `date` / `month` / `scopeYear`。默认示例数据补充 `scopeType` / `scopeYear` 以便对齐月历示例年。
- **登录态与本地快照（安全）**：`useAccountAuth` 业务 token / 邮箱仅 **sessionStorage**；启动时 **purge** 可能残留在 **localStorage** 的旧凭证键。`App` 在未登录时不加载本地快照至界面、不向磁盘写日历数据；登出或失效时清空视图并回到个人工作区；登录成功后从磁盘灌入再继续云端拉取合并。新增 **`sessionAuthGate.ts`**（`hasSessionBusinessAuth`）。
- **统计概览**：顶栏在「搜索」左侧增加 **「统计」**，打开 **`StatisticsOverviewPanel`** 覆盖左侧 Todo 栏（与搜索互斥；**Esc** 关闭）。
- **全局搜索**：`GlobalSearchPanel` 支持 **`embedded`**，在 **`App`** 中覆盖左侧 **TodoSidebar**；顶栏「搜索」做开关并高亮激活态；筛选区与结果列表之间为 **可拖动分隔条**（上下调节高度；嵌入 / 弹层分别记忆至 **`global-search-filter-pane-px-v1`**），下列表区 **flex-1** 占满剩余空间；界面移除命中率四格与「按月命中」块（导出简报仍含统计字段，供后续「统计」视图复用）；结果行仅 **标题** + **日期/时间**（`formatSearchResultDateTime`）；已移除冗余的「全局搜索」标题条。
- **顶栏日历 Popover**：宽度 `min(16rem, calc(100vw-2rem))`，`--cell-size` 按容器自适应；`month_caption` **pointer-events** 与导航 **z-index**，避免遮挡翻月按钮；日按钮 **flex** 居中。
- **版本对齐**：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）均为 **0.2.5**；发布安装包与 Git 标签请使用 **`v0.2.5`**（见 `.cursorrules`）。

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
- **已知限制**：部分 Windows 环境下 `cargo clippy`/链接仍可能出现 `LNK1105`/`1224`；仓库约定将 **`CARGO_TARGET_DIR` 设为 `C:\tbuild\app`**（与 `scripts\release.ps1` 一致），并配合 `CARGO_BUILD_JOBS=1`、**优先 `rust-lld`**（见 **`.cargo/config.toml`** 与 **`PROJECT_GUIDE.md` §2.7**）、必要时的 Defender 排除后再纳入发布门禁。
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
- Windows 个人打包：`npx tauri build -b nsis` 生成 NSIS 安装包 `Todo Calendar_<tauri.conf 版本>_x64-setup.exe`。若链接报错 `LNK1105` / `1224`，须将 **`CARGO_TARGET_DIR` 固定为 `C:\tbuild\app`**（并建议 `CARGO_BUILD_JOBS=1`，与 `scripts\release.ps1` 一致）后再构建；产物在 **`C:\tbuild\app\release\bundle\nsis\`**，可拷贝到仓库 `release\v<版本号>\` 便于留存分发。详见 `PROJECT_GUIDE.md` §2.7～§2.8。
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
