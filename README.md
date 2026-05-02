# Todo Calendar（待办日历）

**当前版本：0.2.3**（与 `package.json`、`src-tauri/tauri.conf.json` 一致）

基于 **React + TypeScript + Vite** 的日历与待办应用，可选 **Tauri** 打包 Windows 安装包；云端使用 **腾讯云 CloudBase**（云函数 HTTP `newworld` + 文档数据库）。

## 0.2.3 维护（质量门禁与同步健壮性）

- **ESLint** 无 error；账号 Context 拆分便于维护。
- **定时同步**：登录弹窗内个人云/协作空闲同步路径使用 ref，降低偶现状态不准概率。
- **说明**：温和 `npm audit fix` 后仍有 CloudBase 传递依赖告警；Windows 下 `cargo clippy` 若遇链接占用见 `CHANGELOG`。

## 0.2.2 亮点（协作切回个人云）

- **数据边界**：切回个人云时只合并**本人**在协作区的改动，队友数据不会进入个人云 `user_snapshots`。
- **笔记与删除策略**：笔记仅当 `noteOwnerByDate` 明确为自己时才合并；待办/日程不合并协作侧删除墓碑（保守，减少误删个人侧数据）。

## 0.2.1 亮点（同步体验）

- **个人云**：登录后 **自动拉取合并**；`watch` 与约 **15s HTTP 拉取** 并行，多端更易对齐。
- **退出**：先选 **清空本机日历** 或 **仅退出、保留本地数据**；再 **尝试推送**，并提示 **已同步 / 未同步**（推送失败时可取消退出）。
- **协作云**：登录后自动 **team-pull**；自动拉取失败时 **必须手动拉** 的明确提示。

## 0.2.0 起：协作与个人云

- **双人协作**：与个人云隔离的 **`team_snapshots`** 共享快照（MVP 最多 2 人）；创建者可设「对方可读写 / 对方只读 / 对方读全写己」。
- **协作笔记分权**：队友笔记首行显示 👍 慎改提示；`bothPush` 可编辑队友笔记，其余两档仅可编辑自己名下笔记。
- **个人云**：按邮箱的 **`user_snapshots`** 同步（与协作数据互不自动合并）。

详细架构、文件职责、功能入口与运维说明见 **[PROJECT_GUIDE.md](./PROJECT_GUIDE.md)**；版本变更见 **[CHANGELOG.md](./CHANGELOG.md)**。

## 本地开发

```bash
npm install
npm run dev
```

需按 `.env.example` 配置 `VITE_CLOUDBASE_*` 等环境变量（勿提交真实密钥）。

## 桌面打包

```bash
npx tauri build -b nsis
```

正式发布与 Git 标签对齐见 `.cursorrules` 与 `scripts/release.ps1`。

---

以下为创建项目时的 Vite 模板说明（可忽略，以 PROJECT_GUIDE 为准）。

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also add [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
