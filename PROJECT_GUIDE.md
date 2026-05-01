# 项目说明与功能入口（v0.2.1）

这份文档给你做长期参考：帮助你快速知道“哪个文件负责什么、功能入口在哪、以后怎么加功能不混乱”。

> **版本**：应用与安装包以 **`src-tauri/tauri.conf.json` 的 `version`** 为准（当前 **0.2.1**），并与 Git 标签 **`v0.2.1`** 对齐；详见 CHANGELOG 与 `.cursorrules` 发布约定。

## 1. 目录与文件职责（关键）

- `src/main.tsx`  
  前端启动入口：在 `BrowserRouter` 内用 **`AccountAuthProvider`** 包裹 `App`，保证全树共享同一份业务登录态与 `baseVersion`（禁止在 `App` 与 `AccountLoginModal` 各自 `useAccountAuth()`）。

- `src/features/account/AccountAuthContext.tsx`  
  `AccountAuthProvider` + `useSharedAccountAuth()`：账号 hook 的唯一挂载点。

- `src/features/account/userSnapshotDb.ts`  
  文档库 `user_snapshots` 的直连 `get` / `watch` 封装（当前环境 `watch` 常失败，以云函数 `pull` 轮询为主路径）。

- `src/features/account/dbAuthUid.ts`  
  邮箱 → `dbAuthUid`（SHA-256 十六进制前 32 位），与云函数 `newworld` 算法一致。

- `src/features/account/config.ts`  
  CloudBase 环境、HTTP 路径、账号本地键；**工作区** `WORKSPACE_MODE_KEY` / `ACTIVE_TEAM_ID_KEY`；协作版控 `teamBaseVersionStorageKey`、首次协作拉取 `teamFirstPullDoneKey`。

- `src/features/account/authApi.ts`  
  `postAccountAction` 及个人云 `pull`/`push`；**协作** `teamCreate` / `teamJoin` / `teamLeave` / `teamGet` / `teamPull` / `teamPush` / `teamSetPeerAccess`（兼容保留 `teamSetPeerReadOnly`）。

- `cloudfunctions/newworld/index.js`  
  云函数：发码、验码、个人快照、历史、**协作** `team_*`；协作集合 **`team_snapshots`**；`peerReadOnly` 时仅 `ownerEmail` 可 `team-push`；`snapshot` 为 `null` 时用 **`_.set(snapshotForStore(...))`** 写入。

- `src/App.tsx`  
  业务总中枢。主要状态和规则都在这里：Todo、日历事件、计数、笔记、本地存储、导入导出、视图切换；**工作区模式**（个人云 / 协作云）、协作版控与协作侧防抖自动 `team-push`。

- `src/components/TodoSidebar.tsx`  
  左侧 Todo 清单区域：新增/编辑/删除、分类筛选、笔记输入、导入导出入口按钮。

- `src/components/CalendarGrid.tsx`  
  月历视图（日期格、事件条展示、溢出处理、点击日期跳转）。

- `src/components/WeekView.tsx`  
  周历视图（按周展示事件、点击日期跳转）。

- `src/components/DayView.tsx`  
  日历视图（时间轴、无明确时间任务区、事件拖拽改时间）。

- `src/lib/calendar-utils.ts`  
  日历工具函数：月天数、周天数、节假日、农历、事件分配。

- `src/types/index.ts`  
  核心数据结构定义（Todo、CalendarEvent、ViewType、TodoCategory）。

- `src-tauri/tauri.conf.json`  
  桌面打包配置（窗口、构建命令、打包目标、图标等）。

- `src-tauri/src/main.rs` / `src-tauri/src/lib.rs`  
  Tauri 桌面应用 Rust 入口。


## 2. 功能入口地图

### 2.1 Todo（新增/编辑/删除/分类）
- UI 入口：`src/components/TodoSidebar.tsx`
- 业务入口：`src/App.tsx`
  - `onAddTodo(...)`
  - `handleUpdateTodo(...)`
  - `handleDeleteTodo(...)`
  - `getFilteredTodos()`

### 2.2 日历规划（拖拽到月/周/日）
- 视图文件：
  - 月历：`CalendarGrid.tsx`
  - 周历：`WeekView.tsx`
  - 日历：`DayView.tsx`
- 核心处理在 `App.tsx`：
  - `handleDrop(...)`
  - `handleMoveEvent(...)`
  - `handleToggleComplete(...)`
  - `handleDayCellClick(...)`

### 2.3 计数规则（重要）
- 在 `App.tsx` 中统一处理：
  - 拖拽到日历：`count + 1`
  - 标记完成：`count - 1`
  - 取消完成：`count + 1`
  - 新增 Todo：`count = null`（空计数，首次拖拽后开始计数）

### 2.4 笔记（按日期）
- 状态：`App.tsx` 的 `notesByDate`
- 归属：`App.tsx` 的 `noteOwnerByDate`（协作模式用于“按人分权”）
- 保存：`handleSaveNote(...)`
- 输入区域：`TodoSidebar.tsx`
- 队友笔记提醒：第一行固定显示 👍 文案；在不可改权限下自动只读
- 标记显示：
  - `CalendarGrid.tsx`
  - `WeekView.tsx`
  - `DayView.tsx`

### 2.5 本地保存、导入导出、重置
- 全在 `App.tsx`：
  - `loadPersistedData()`
  - `createPersistedPayload()`
  - 自动持久化 `useEffect(...)`
  - `handleExportData()`
  - `handleImportData()`
  - `handleResetLocalData()`

### 2.6 提醒通知（含声音）
- 提醒核心：`src/features/notifications/useEventReminders.ts`
- App 接入：`src/App.tsx` 的 `useEventReminders(events)`
- 提醒触发条件：
  - 事件有 `startDate + startTime`
  - 事件未完成（`completed !== true`）
- 当前默认提醒点（测试版）：开始前 `50/45/40/35/30/25/20/15/10/5` 分钟
- 兜底提醒：
  - 如果事件被临近拖入时间轴，已错过常规提醒点，但开始前 5 分钟内，仍会触发一次“即将开始”
- 测试入口：
  - 侧栏设置菜单的“测试通知”按钮（用于快速验证系统通知链路）

### 2.7 EXE 打包入口（个人使用与分发）
- 配置：`src-tauri/tauri.conf.json`（`productName`、`version`、图标、`beforeBuildCommand` 等）。
- **仅打安装包（常用）**：在项目根目录执行 `npx tauri build -b nsis`。会先跑 `npm run build`（前端进 `dist/`），再编译 Rust 并调用 NSIS。安装包文件名形如：`Todo Calendar_<version>_x64-setup.exe`。
- **绿色版 exe**：同次构建还会在 Cargo 输出目录的 `release\app.exe`（具体路径见下条 `CARGO_TARGET_DIR`）。分发给别人时更推荐安装包，依赖更完整。
- **链接失败 `LNK1105` / 错误代码 `1224`**（无法关闭临时目录下的 exe）：多为杀毒/索引或工具链占用临时目录。可在 PowerShell 中指定固定产物目录后再构建，例如：
  - `$env:CARGO_TARGET_DIR = "C:\Users\<你的用户名>\tauri-cargo-target\app"`
  - `npx tauri build -b nsis`
  仓库内 `scripts\release.ps1` 已使用该思路（并设 `CARGO_BUILD_JOBS=1` 等）；个人日常打包可直接照抄这两行环境变量。
- **归档位置**：可将生成的 `*_x64-setup.exe` 复制到仓库 `release\v<版本号>\`，与历史版本并列，便于自己或他人下载安装。
- **正式发布**：仍需遵守 `.cursorrules`：EXE 版本号与 Git 标签一致时，用 `scripts\release.ps1`（干净工作区 + 标签校验 + 构建 + 复制到 `release/`）。
- 已处理的拖拽兼容配置：`dragDropEnabled: false`。

### 2.8 主题切换（深 / 浅）
- **入口**：主界面顶栏「搜索」按钮左侧，太阳 / 月亮图标按钮；深色模式下显示太阳（点击切换到浅色），浅色模式下显示月亮（切回深色）。
- **实现**：`src/features/theme/useAppTheme.ts` 读写 `localStorage`；`src/index.css` 中 `:root` 为深色壳层变量，`html.theme-light` 为浅色暖底 + 橙点缀（`--shell-*`）。主布局、侧栏、月/周/日视图、账号弹窗、全局搜索等已统一使用这些变量。
- **说明**：任务/事件的分类颜色仍为数据字段中的颜色，不受主题切换覆盖。


## 3. 典型调用链（便于理解）

### 链路 A：新增 Todo
`TodoSidebar` 输入 -> `onAddTodo` -> `App.tsx` 更新 `todos` -> 本地自动持久化

### 链路 B：Todo 拖拽到日历
侧栏拖拽开始 -> `App.tsx` 记录拖拽对象 -> 月/周/日视图落点触发 `onDrop` ->  
`App.tsx handleDrop` 新建事件 + 更新计数 -> 本地自动持久化

### 链路 C：事件完成/取消
点击事件条 -> `App.tsx handleToggleComplete` -> 更新 `event.completed` + 同步 Todo 计数

### 链路 D：笔记与标志
保存笔记 -> `notesByDate` 更新 -> 月/周/日视图读取对应日期并显示标记

### 链路 E：提醒通知
事件被拖到时间刻度 -> 写入 `startDate/startTime` ->  
`useEventReminders` 定时检查 -> 命中提醒窗口后发系统通知（并可带声音）  


## 4. 后续新增功能的防混乱规则

1. 新功能优先独立文件实现，不直接把复杂逻辑塞进 `App.tsx`。  
2. 先独立验证，再接入主流程。  
3. UI 负责展示和触发，业务规则集中在中枢（当前是 `App.tsx`）。  
4. 同一规则只保留一个真实来源（比如计数规则不要在多个组件重复写）。  
5. 每次只做一个明确任务，避免大范围改动。


## 5. 建议的下一步（可选）

后续如果要继续变大，建议第一步先把“本地存储相关函数”从 `App.tsx` 抽到：  
`src/services/storage.ts`  
这一步风险低，收益高，便于长期维护。

## 6. 通知功能验证记录（2026-04-26）

- 浏览器通知权限已开启（Edge）。  
- “测试通知”按钮可正常触发通知。  
- 自动提醒逻辑已接入并可工作。  
- 说明：若系统处于静音、免打扰或浏览器策略限制，声音提醒可能被系统拦截，通知本身不受影响。  

## 7. CloudBase 接入特殊性（已踩坑记录）

1. 鉴权是双层：  
   云函数 `invoke` 权限与 HTTP 路由鉴权是两套配置。只放开其中一层，仍可能报 `MISSING_CREDENTIALS`。

2. HTTP 触发事件结构与常规接口不同：  
   CloudBase HTTP 请求体常在 `event.body`（字符串），不能直接假设 `event.action` 存在，需先 `JSON.parse(event.body)`。

3. Node SDK 写法与小程序 SDK 有差异：  
   `@cloudbase/node-sdk` 的 `add/update` 直接传字段对象，不应使用 `data: {...}` 包裹。否则会出现“写入看似成功，但 where 条件查询不到”的问题。

4. 调试模式与生产模式必须分离：  
   生产云函数源码在仓库 `cloudfunctions/newworld/index.js`（已移除 `debugCode` 与 `debug-codes`，并对 `send-code` 做频控）。部署到 CloudBase 时请用该目录打包上传或逐段同步，并在控制台「保存并安装依赖」后发布。

5. PowerShell 调用容易踩语法坑：  
   优先使用 `Invoke-RestMethod` 或 `curl.exe`（避免 `curl` 别名歧义）；不要把提示符 `>>` 粘贴进命令。

6. CloudBase 控制台函数编辑经验：  
   修改云函数逻辑时，优先进入 `函数详情 -> 函数代码 -> index.js`。  
   新增或变更依赖后，优先使用“保存并安装依赖”，再发布并立即回归测试。

7. 邮箱验证码发送方案（当前约定）：  
   当前发码走 CloudBase 身份认证内置邮件服务（`/auth/v1/verification`），不是 21cn SMTP 直发；后续若要切回自定义 SMTP，需单独评审并更新文档与规则。

### 7.1 安全收口（你方在控制台需手动确认）

- **云函数代码**：与仓库 `cloudfunctions/newworld/` 保持一致并重新发布。  
- **HTTP 路由**：生产环境建议重新开启「身份认证」，并确认前端请求已带 `Authorization: Bearer <CloudBase 访问令牌>`（当前前端 `authApi.ts` 已按此方式调用）。  
- **安全域名**：继续只保留可信域名。  
  - **重要（Tauri 桌面安装包）**：`npm run dev` 时页面来源是 `http://localhost:1420`，打包后 Windows 上多为 **`http://tauri.localhost`** 或 **`https://tauri.localhost`**（少数环境为 `tauri://localhost`）。若控制台「Web 安全域名」只配置了 localhost:1420，安装包里发码 / 匿名登录会出现 **`Failed to fetch`**。请在 CloudBase → 环境 → **安全配置** → **Web 安全域名** 中追加上述 `tauri.localhost` / `tauri://localhost` 条目（与开发用域名并存即可），保存后重开应用再试。  
- **数据库权限**：`email_codes` / `user_tokens` 等集合仅允许云函数访问，勿对前端直连开放写权限。  
- **`user_snapshots`（前端可直连时）**：建议 `read` / `write` 均为 `doc.dbAuthUid == auth.uid`；文档需带 `dbAuthUid`（云函数在验码 / 拉取 / 推送时会补齐）。自定义登录私钥见云函数环境变量 `TCB_CUSTOM_LOGIN_PRIVATE_KEY` / `TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID`。

## 8. 账号系统一期速查表（文件-函数-按钮）

| 按钮/动作 | 先看文件 | 关键函数/入口 | 最终调用 |
|---|---|---|---|
| 侧栏齿轮「账号与同步…」 | `src/TodoSidebar.tsx` → `App.tsx` | `onOpenSettings` → `setShowAccountLogin(true)` | 打开设置弹窗 `AccountLoginModal`（登录 / 同步与云 / 协作） |
| 发送验证码 | `src/features/account/AccountLoginModal.tsx` | `handleSend()` | `useSharedAccountAuth().sendCode()` -> `authApi.sendCode()` -> `/test` `action=send-code` |
| 验证并登录 | `src/features/account/AccountLoginModal.tsx` | `handleVerify()` | `verify()` 成功后 **自动拉取**：个人云 `pullSnapshot` + `onPullSnapshot` 并写 **`todo-calendar-first-pull-done`**；协作云 **`team-pull`** + `onTeamCloudPulled`；协作自动拉取失败时提示 **必须手动拉** |
| 退出业务登录 | `AccountLoginModal.tsx` | `executeLogout(clearLocal)` | 点「退出业务登录」后先选：**退出并清空本机日历数据** 或 **仅退出账号，保留本地数据**（可取消）。再 **尝试推送**（个人 `pushSnapshot` / 协作 `teamPush`）；成功 **alert 已同步** 后 `logout()`；失败 **`confirm` 是否仍退出**。若选清空，登出后 **`App.tsx` `handleAfterLogout`** 会删 `todo-calendar-local-v1`、协作/工作区相关 `localStorage` 键并重置界面为默认日历数据 |
| 匿名登录（自动） | `src/features/account/cloudbase.ts` | `ensureAnonymousSignIn()` | CloudBase `auth.signInAnonymously()` |
| 取访问令牌（自动） | `src/features/account/cloudbase.ts` | `getCloudbaseAccessToken()` | CloudBase `auth.getAccessToken()` |
| 推送云端 | `src/features/account/AccountLoginModal.tsx` + `src/App.tsx` | `handlePush()` + `getAccountSnapshot()`；**另：**`App.tsx` 在已登录且完成首次拉取后对本地数据变更 **防抖自动 push** | `authApi.pushSnapshot()` -> `/test` `action=push` |
| 拉取云端 | `AccountLoginModal.tsx` + `App.tsx` | `handlePull()` + `applyAccountSnapshot()`；**另：**个人云下 **`watch` 与 HTTP `pull` 约 15s 轮询并行** | `authApi.pullSnapshot()` -> `/test` `action=pull` |
| 接口地址/环境切换 | `src/features/account/config.ts` | `getAccountHttpUrl()` / `CLOUDBASE_ENV_ID` | 控制请求目标 |
| 环境变量声明 | `src/vite-env.d.ts` | `VITE_CLOUDBASE_ENV_ID` / `VITE_ACCOUNT_HTTP_BASE` | 供 TS 校验与读取 |
| 接口封装总入口 | `src/features/account/authApi.ts` | `postAccountAction()` | 统一 `POST /test` + Bearer |
| 云函数（生产逻辑） | `cloudfunctions/newworld/index.js` | `exports.main` | 部署到 CloudBase 函数 `newworld` |
| 创建/加入/退出协作、队友权限 | `AccountLoginModal.tsx` | 双人协作卡片、`handleTeamCreate` 等 | `authApi.team*` → `/test` `action=team-*` |
| 协作拉取/推送按钮 | `AccountLoginModal.tsx` | `handlePull` / `handlePush` 协作分支 | `team-pull` / `team-push` |
| 工作区切换与协作自动推 | `App.tsx` | `switchToTeamWorkspace`、`switchToPersonalWorkspace`、防抖 `teamPush` | 见 `config.ts` 工作区键 |

一句话定位法：按钮问题看 `AccountLoginModal`；接口问题看 `authApi`；`ACTION_FORBIDDEN` 先查路由身份认证；拉取/推送问题看 `App.tsx` 快照导入导出函数；云端逻辑以 `cloudfunctions/newworld/index.js` 为准；**登录态不一致先查是否未包在 `AccountAuthProvider` 或误用 `useAccountAuth` 双实例。** **协作问题**先确认已部署含 `team-*` 的 `newworld`，且库中存在 **`team_snapshots`**。

### 7.2 开启 HTTP 身份认证后出现 403

1. 在 `.env` 中配置 **`VITE_CLOUDBASE_PUBLISHABLE_KEY`**（云开发控制台 → ApiKey / 身份令牌管理 → **客户端 Publishable Key**），并重启 `npm run dev`（`cloudbase.init` 只在首次加载时执行）。  
2. 配置 **`VITE_CLOUDBASE_REGION`**（例如 `ap-shanghai`），须与环境地域一致。  
3. 仍失败时打开浏览器开发者工具 → **网络**，查看失败的请求是否带请求头 **`Authorization: Bearer …`**；若 Bearer 为空或极短，多半是未配置 Publishable Key 或匿名登录未成功。  
4. 若只有 **OPTIONS** 预检返回 403，多为网关/CORS 策略问题，需在 CloudBase HTTP 访问服务侧确认跨域与预检是否放行。

## 9. 多客户端同步经验（2026-04-29）

### 9.1 核心原则（先记住这 6 条）

1. 云端是最终真相来源，本地是缓存与编辑区。  
2. 冲突判定优先看 `version`，`updatedAt` 只用于展示，不作为唯一依据。  
3. 避免整包覆盖，优先按条目合并（todo/event/note 分治）。  
4. 删除必须有墓碑（删除时间），否则旧端会把已删数据“复活”。  
5. 自动同步不能无脑推拉，必须按“本地改动/云端改动/双方改动”分流。  
6. 所有自动处理都要可见（状态字、合并提示、上次拉取/推送时间）。

### 9.2 本项目当前实现要点

- 自动同步常驻运行（关闭账号弹窗后仍生效）。  
- 首次登录未拉取前禁止开启自动同步，避免空本地覆盖云端。  
- **`App.tsx` 防抖自动推送**：已登录且本地存过「至少一次拉取成功」标记（`todo-calendar-first-pull-done`）后，Todo/事件/笔记/日期等本地变更约 **1.2s** 内自动 `push`（与手动推送同接口）。  
- **云端下行（个人云）**：文档库 `watch` 与 **`pull` 定时轮询（约 15s）并行**（`watch` 仅加速）；仍按 `version` 大于本地基线才应用。协作云下行见 **`team-pull`** / 登录自动拉取。  
- 自动双向同步策略（账号弹窗内「空闲自动推送」开关）：  
  - 仅本地改动：自动推  
  - 仅云端改动：自动拉  
  - 双方都有改动：先拉后推  
- 冷却时间控制（避免短时间重复推拉）。  
- 时间语义拆分：显示“本地保存时间 / 云端写入时间 / 上次拉取时间 / 上次推送时间”。

### 9.3 细粒度合并现状

- Todo：按 `id + updatedAt` 合并，支持删除墓碑，冲突默认保留较新并提示。  
- Event：按 `id + updatedAt` 合并，字段级自动补全，冲突默认保留较新并提示。  
- Note：按日期 key 合并，使用 `noteMetaByDate` 比较新旧，较新覆盖较旧。  

### 9.4 仍需人工确认的场景

- 同一条数据同一字段被两端同时改且值不同（硬冲突）。  
- 业务上“较新不一定更对”的语义冲突（例如文本误改）。  
- 重大数据恢复前仍建议先导出本地备份，再执行拉取或强制推送。

### 9.5 建议验收清单（双浏览器最小回归）

1. A 新增 todo、B 新增 todo，最终两端均可见。  
2. A 删 todo、B 未更新该条，最终不复活。  
3. A 改 event 时间、B 改 event 标题，最终能自动合并。  
4. A/B 改同一日期备注，最终按较新版本收敛。  
5. 自动同步开启后，关闭账号弹窗仍能继续同步。  
6. 本地改一条 Todo 后，约 1～2 秒内云端 `user_snapshots.version` 递增（自动 push）；另一端在轮询周期内应看到更新。  


## 10. 云端混合同步架构（2026-04-30）

### 10.1 分层

| 层级 | 方式 | 说明 |
|------|------|------|
| 账号 / 发码 / 验码 / 快照拉推 | 云函数 HTTP `newworld` | 与数据库安全规则无关；服务端可写 `user_snapshots`、`user_tokens` 等。 |
| 下行实时（可选） | `@cloudbase/js-sdk` `watch` | 依赖自定义登录 + 库规则；当前环境易 `INIT_WATCH_FAIL`，**不作为唯一依赖**。 |
| 下行兜底（个人云） | 云函数 `pull` 轮询 | `AccountLoginModal` 内与 `watch` **并行**约 **15s** 一次，与手动拉取同路径；协作工作区不跑此个人云轮询。 |
| 上行 | 云函数 `push` + **`App` 防抖自动 push** | 本地变更后约 **1.2s** 推送；须已完成至少一次「拉取云端」。 |
| 协作上行/下行 | 云函数 **`team-pull` / `team-push`** + `App` 在协作工作区下防抖 **`teamPush`** | 与个人云 **隔离**；须完成协作侧首次拉取标记（`teamFirstPullDoneKey`）后才自动推。 |

### 10.2 数据字段

- `user_snapshots` 除原有 `email`、`snapshot`、`version`、`updatedAt` 等外，增加 **`dbAuthUid`**（与邮箱规范化后 SHA-256 前 32 位十六进制一致），供规则 `doc.dbAuthUid == auth.uid` 使用。  
- 云函数在 **验码、pull、push** 路径会 **补齐** 旧文档的 `dbAuthUid`。

- **`team_snapshots`（双人协作，v0.2.0）**：按 **`teamId`** 一条文档；字段含 `members`（最多 2 人）、`ownerEmail`、`peerAccess`（`bothPush` / `peerReadOnly` / `peerReadAllWriteOwn`）、`snapshot`、`version` 等。与个人云 **不自动同步**，切换工作区时分别 `pull` 对应数据源。**协作文档无 TTL**：只要空间未被「最后一人退出并删除」，凭 **协作 ID** 在 **邮箱验码登录** 后可长期再次 `team-join` / `team-pull` 查看。业务 **`user_tokens`** 有效期见云函数 `TOKEN_TTL_MS`（当前为 **7 天**，过期后重新收码登录即可，协作数据仍在库中）。

### 10.3 前端关键约定

- **全应用只有一份账号状态**：`main.tsx` 使用 `AccountAuthProvider`；业务代码用 **`useSharedAccountAuth()`**，不要与 `useAccountAuth()` 混用导致双实例。  
- **顶栏同步状态**：登录后展示「已登录 · 拉/推 最近时间」；个人云开启 HTTP 定时拉取时追加 **「定时拉取」**（与 `watch` 并行）。  
- **同步诊断日志**：仅在 `.env` 设置 **`VITE_SYNC_DEBUG=true`**（见 `.env.example`）并重启 `npm run dev` / 重新打包后，才会在控制台输出 **`[sync-debug]`**（watch / poll 等）；默认关闭以免刷屏。同类告警约 **30s** 内节流一次。

## 11. 双人协作速查（v0.2.0 起，同步行为在 v0.2.1 增强）

### 11.1 产品语义

- **个人云**：数据在 `user_snapshots`（按邮箱），仅本人默认语义下的私有同步。  
- **协作云**：数据在 `team_snapshots`（按 `teamId`），两人共享**同一份** `snapshot`（MVP 最多 2 人）。两套云 **互不自动合并**，切换工作区会改「当前跟哪朵云对齐」。**协作 ID / 云端内容长期有效**（无自动过期）；仅当全员退出且删除空间后 ID 才失效。  
- **队友权限**：创建者可在账号弹窗选择 **对方可读写**（`bothPush`）/ **对方只读**（`peerReadOnly`）/ **对方读全写己**（`peerReadAllWriteOwn`）。
  - `bothPush`：可跨人编辑任务/笔记（队友笔记仍显示 👍 慎改提醒）。
  - `peerReadOnly`：队友只能拉取，不能推送协作云。
  - `peerReadAllWriteOwn`：队友可读全部，但仅可修改自己名下任务/日程/笔记。

### 11.2 云函数 action 一览（协作）

| action | 说明 |
|--------|------|
| `team-create` | 创建协作空间，返回 `teamId` |
| `team-join` | 加入指定 `teamId` |
| `team-leave` | 退出；最后一人退出可删除文档 |
| `team-get` | 元数据（成员、`peerAccess`、`ownerEmail`、`version` 等） |
| `team-pull` | 拉取协作快照 |
| `team-push` | 推送协作快照（409 版本冲突同个人云） |
| `team-set-peer-access` | 仅创建者可调 |

### 11.3 运维注意

- 控制台需存在集合 **`team_snapshots`**；部署的 `newworld` 须包含上述 action。  
- 云数据库 `update` 在 **`snapshot` 为 `null`** 时禁止子路径合并；实现上已对 **`push` / `team-push`** 的 `snapshot` 使用 **`_.set(...)`**（见 `snapshotForStore`）。  
- 排查错误优先看 **云函数 `newworld` → 日志**；若仍为笼统 500，对照 `index.js` 外层 `catch` 是否已带错误摘要。
