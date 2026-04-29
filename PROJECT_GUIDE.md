# 项目说明与功能入口（v0.1.0）

这份文档给你做长期参考：帮助你快速知道“哪个文件负责什么、功能入口在哪、以后怎么加功能不混乱”。

## 1. 目录与文件职责（关键）

- `src/main.tsx`  
  前端启动入口，把 `App` 挂载到页面。

- `src/App.tsx`  
  业务总中枢。主要状态和规则都在这里：Todo、日历事件、计数、笔记、本地存储、导入导出、视图切换。

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
- 保存：`handleSaveNote(...)`
- 输入区域：`TodoSidebar.tsx`
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

### 2.7 EXE 打包入口
- 配置：`src-tauri/tauri.conf.json`
- 命令：`npx tauri build -b nsis`
- 已处理的拖拽兼容配置：`dragDropEnabled: false`


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

### 7.1 安全收口（你方在控制台需手动确认）

- **云函数代码**：与仓库 `cloudfunctions/newworld/` 保持一致并重新发布。  
- **HTTP 路由**：生产环境建议重新开启「身份认证」，并确认前端请求已带 `Authorization: Bearer <CloudBase 访问令牌>`（当前前端 `authApi.ts` 已按此方式调用）。  
- **安全域名**：继续只保留可信域名（含打包后桌面应用若走自定义协议需单独评估）。  
- **数据库权限**：`email_codes` / `user_tokens` 等集合仅允许云函数访问，勿对前端直连开放写权限。

## 8. 账号系统一期速查表（文件-函数-按钮）

| 按钮/动作 | 先看文件 | 关键函数/入口 | 最终调用 |
|---|---|---|---|
| 顶部「账号」 | `src/App.tsx` | `setShowAccountLogin(true)` | 打开 `AccountLoginModal` |
| 发送验证码 | `src/features/account/AccountLoginModal.tsx` | `handleSend()` | `useAccountAuth.sendCode()` -> `authApi.sendCode()` -> `/test` `action=send-code` |
| 验证并登录 | `src/features/account/AccountLoginModal.tsx` | `handleVerify()` | `useAccountAuth.verify()` -> `authApi.verifyCode()` -> `/test` `action=verify-code` |
| 匿名登录（自动） | `src/features/account/cloudbase.ts` | `ensureAnonymousSignIn()` | CloudBase `auth.signInAnonymously()` |
| 取访问令牌（自动） | `src/features/account/cloudbase.ts` | `getCloudbaseAccessToken()` | CloudBase `auth.getAccessToken()` |
| 推送云端 | `src/features/account/AccountLoginModal.tsx` + `src/App.tsx` | `handlePush()` + `getAccountSnapshot()` | `authApi.pushSnapshot()` -> `/test` `action=push` |
| 拉取云端 | `src/features/account/AccountLoginModal.tsx` + `src/App.tsx` | `handlePull()` + `applyAccountSnapshot()` | `authApi.pullSnapshot()` -> `/test` `action=pull` |
| 接口地址/环境切换 | `src/features/account/config.ts` | `getAccountHttpUrl()` / `CLOUDBASE_ENV_ID` | 控制请求目标 |
| 环境变量声明 | `src/vite-env.d.ts` | `VITE_CLOUDBASE_ENV_ID` / `VITE_ACCOUNT_HTTP_BASE` | 供 TS 校验与读取 |
| 接口封装总入口 | `src/features/account/authApi.ts` | `postAccountAction()` | 统一 `POST /test` + Bearer |
| 云函数（生产逻辑） | `cloudfunctions/newworld/index.js` | `exports.main` | 部署到 CloudBase 函数 `newworld` |

一句话定位法：按钮问题看 `AccountLoginModal`；接口问题看 `authApi`；`ACTION_FORBIDDEN` 先查路由身份认证；拉取/推送问题看 `App.tsx` 快照导入导出函数；云端逻辑以 `cloudfunctions/newworld/index.js` 为准。

### 7.2 开启 HTTP 身份认证后出现 403

1. 在 `.env` 中配置 **`VITE_CLOUDBASE_PUBLISHABLE_KEY`**（云开发控制台 → ApiKey / 身份令牌管理 → **客户端 Publishable Key**），并重启 `npm run dev`（`cloudbase.init` 只在首次加载时执行）。  
2. 配置 **`VITE_CLOUDBASE_REGION`**（例如 `ap-shanghai`），须与环境地域一致。  
3. 仍失败时打开浏览器开发者工具 → **网络**，查看失败的请求是否带请求头 **`Authorization: Bearer …`**；若 Bearer 为空或极短，多半是未配置 Publishable Key 或匿名登录未成功。  
4. 若只有 **OPTIONS** 预检返回 403，多为网关/CORS 策略问题，需在 CloudBase HTTP 访问服务侧确认跨域与预检是否放行。
