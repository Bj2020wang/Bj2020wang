/** 打包后的 Tauri WebView 会注入该对象；浏览器开发环境没有。 */
export function isTauriWebview(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const FETCH_FAIL_RE = /Failed to fetch|Load failed|NetworkError|network request failed/i;

/**
 * 桌面端跨域请求 CloudBase 时，若控制台未配置 Web 安全域名，会表现为 fetch 失败。
 * 命中时抛出带配置说明的 Error；否则不抛，由调用方继续 throw 原错误。
 */
export function throwIfTauriFetchLikelySecurityDomain(err: unknown): void {
  if (!(err instanceof Error)) return;
  if (!isTauriWebview()) return;
  if (!FETCH_FAIL_RE.test(err.message)) return;
  throw new Error(
    '网络请求失败。若您使用的是「已安装的桌面版」：请到腾讯云 CloudBase 控制台 → 环境 → 安全配置 → Web 安全域名，添加：http://tauri.localhost、https://tauri.localhost（若仍不行可再添加 tauri://localhost）。开发时使用的 http://localhost:1420 对安装包无效，需单独配置。配置保存后重新打开应用再试。'
  );
}
