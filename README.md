# Todo Calendar（待办日历）

**当前版本：0.3.0**（与 `package.json`、`src-tauri/tauri.conf.json` 一致）

基于 **React + TypeScript + Vite** 的日历与待办应用，可选 **Tauri** 打包 Windows 安装包；云端使用 **腾讯云 CloudBase**（云函数 HTTP `newworld` + 文档数据库）。

## 0.3.0 亮点（同步体验）

- **个人云**：登录后 **自动拉取合并**；`watch` 与约 **15s HTTP 拉取** 并行，多端更易对齐。
- **退出**：退出登录前 **尝试推送**，并提示 **已同步 / 未同步**（失败时可取消退出）。
- **协作云**：登录后自动 **team-pull**；自动拉取失败时 **必须手动拉** 的明确提示。

## 0.2.0 起：协作与个人云

- **双人协作**：与个人云隔离的 **`team_snapshots`** 共享快照（MVP 最多 2 人）；创建者可设「对方可读写 / 对方只读」。
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
