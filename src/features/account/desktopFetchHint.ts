/** 打包后的 Tauri WebView 会注入该对象；浏览器开发环境没有。 */
export function isTauriWebview(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const FETCH_FAIL_RE = /Failed to fetch|Load failed|NetworkError|network request failed/i;

/** 发码 / 登录等请求失败时，把浏览器笼统文案换成可操作说明（含当前页面 origin） */
export function formatAccountFetchErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '未知错误';
  if (!FETCH_FAIL_RE.test(raw)) return raw;

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';

  return [
    '无法连接到云服务（请求被拦截或网络不通）。',
    '',
    '请先确认：腾讯云 CloudBase → 你的环境 → 安全配置 → Web 安全域名，',
    '已添加下面这一项（须与地址栏完全一致，含 http/https 和端口）：',
    origin ? `  ${origin}` : '  （请从浏览器地址栏复制，从协议到端口为止）',
    '',
    '用手机通过电脑局域网 IP 访问时（例如 http://192.168.1.4:3000），必须把这一条完整地址也加进去。',
    '保存域名配置后，刷新本页再点「发送验证码」。',
    '',
    `（浏览器原始提示：${raw}）`,
  ].join('\n');
}

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
