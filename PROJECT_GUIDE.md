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

### 2.6 EXE 打包入口
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
