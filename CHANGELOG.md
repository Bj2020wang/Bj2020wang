# Changelog

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
