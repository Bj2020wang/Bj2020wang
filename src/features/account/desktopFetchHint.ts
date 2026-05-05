/** 打包后的 Tauri WebView 会注入该对象；浏览器开发环境没有。 */
export function isTauriWebview(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

import { getAccountDiagnosticsSummary } from './config';

const FETCH_FAIL_RE = /Failed to fetch|Load failed|NetworkError|network request failed/i;

/**
 * 当前页面不是 localhost 时返回简短提示文案（供登录页预提醒）。
 * 手机走 http://电脑IP:端口 时 Origin 与桌面 localhost 不同，须在 CloudBase Web 安全域名单独添加。
 */
export function getLanOrRemoteOriginLoginTip(): string | null {
  if (typeof window === 'undefined') return null;
  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;
  const noScheme = origin.replace(/^https?:\/\//i, '');
  return [
    '当前访问来源不是 localhost（常见于手机用局域网 IP）。请在 CloudBase → Web 安全域名 同时添加下面两行（与手机地址栏一致）；只配过 localhost 时，桌面能登录、手机仍会失败：',
    origin,
    noScheme,
    '入口：https://tcb.cloud.tencent.com/dev?#/env/safety-source',
  ].join('\n');
}

export type AccountFetchNetworkErrorStage = 'cloudbase-auth' | 'account-http-gateway';

/** 发码 / 登录等请求失败时，把浏览器笼统文案换成可操作说明（含当前页面 origin） */
export function formatAccountFetchErrorMessage(
  err: unknown,
  opts?: { stage?: AccountFetchNetworkErrorStage }
): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '未知错误';
  if (!FETCH_FAIL_RE.test(raw)) return raw;

  const alreadyFormatted = raw.includes('【1】核对控制台环境与前端 .env 一致');
  if (alreadyFormatted) {
    if (opts?.stage && !raw.includes('【失败环节】')) {
      const prefix =
        opts.stage === 'cloudbase-auth'
          ? '【失败环节】发生在 CloudBase 鉴权（匿名登录 / 访问令牌）。请优先核对【1】【2】WEB 安全域名是否与下方 Origin 完全一致。\n\n'
          : '【失败环节】发生在请求「业务 HTTP 网关」（例如 POST 发码）。若【2】中的 Origin 已在 WEB 安全域名列表里仍报错：多半是 HTTP 访问路由未开启「跨域校验」，浏览器预检 OPTIONS 被拦（桌面 localhost 有时能通过，手机走局域网 IP 更容易触发）。请重点完成下方【3】。\n\n';
      return prefix + raw;
    }
    return raw;
  }

  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const standalonePwa =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(display-mode: standalone)')?.matches === true;

  let diagnostics = '';
  try {
    diagnostics = `\n${getAccountDiagnosticsSummary()}\n`;
  } catch {
    diagnostics = '';
  }

  const stageBlock: string[] =
    opts?.stage === 'cloudbase-auth'
      ? [
          '【失败环节】发生在 CloudBase 鉴权（匿名登录 / 访问令牌）。请优先核对【1】【2】WEB 安全域名是否与下方 Origin 完全一致。',
          '',
        ]
      : opts?.stage === 'account-http-gateway'
        ? [
            '【失败环节】发生在请求「业务 HTTP 网关」（例如 POST 发码）。若【2】中的 Origin 已在 WEB 安全域名列表里仍报错：多半是 HTTP 访问路由未开启「跨域校验」，浏览器预检 OPTIONS 被拦（桌面 localhost 有时能通过，手机走局域网 IP 更容易触发）。请重点完成下方【3】。',
            '',
          ]
        : [];

  return [
    '无法连接到云服务（常见：Web 安全域名 / 跨域校验未放行当前来源；少数：纯断网或 HTTPS 证书问题）。',
    '',
    ...stageBlock,
    '【1】核对控制台环境与前端 .env 一致：打开腾讯云控制台 Web 安全域名页：',
    '  https://tcb.cloud.tencent.com/dev?#/env/safety-source',
    '确认正在编辑的是「当前应用所用环境 ID」对应的环境（见下方诊断里的环境 ID）。',
    '',
    '【2】以下为「当前手机/本页」的真实访问来源（由浏览器提供，不是文档示例 IP；控制台白名单须与之一致，含协议与端口）：',
    origin ? `  • ${origin}` : '  • （无法读取 origin：请从地址栏手动复制「协议+主机+端口」）',
    origin
      ? `  • ${origin.replace(/^https?:\/\//i, '')}`
      : '  • 同上一条但去掉 http:// 或 https:// 前缀',
    ...(standalonePwa
      ? [
          '【PWA】当前为「添加到主屏幕」全屏打开：Origin 仍是安装前访问的网址；若电脑换了 Wi‑Fi / IP 变了，请用手机 Safari/Chrome 重新打开新的 http://电脑IP:端口 再试，必要时删掉旧图标后重新添加。',
          '',
        ]
      : []),
    '【3】控制台若只见「跨域设置 / 添加跨域域名」而无单独「跨域校验」字样：与文档中的「跨域校验」是同一套能力——把当前页的 Origin 加入列表即可；并请在「HTTP 访问服务」中确认默认域名下存在绑定云函数的路由（本项目默认 /test）。',
    '若网关仍未自动带回 CORS，请在部署云函数 newworld 时使用仓库最新代码（内含 OPTIONS 与 Access-Control-* 响应头兜底）。官方说明：https://docs.cloudbase.net/service/cors',
    '【现象对照】若页面报错但隔几分钟邮箱仍收到验证码：多为请求已到云端、邮件已发出，但浏览器因跨域读不到成功响应（前端拿不到 verification_id）。修好【3】后请重新点「发送验证码」，勿用过期邮件里的旧码。',
    '',
    '【4】用手机访问电脑 IP 时，请确保手机与电脑同一 Wi‑Fi；若用 https:// 打开本机 IP 且证书不受信任，也可能表现为 Load failed，可改用 http:// 调试。',
    '',
    '保存域名配置后等待约 1 分钟，再强制刷新本页并重试「发送验证码」。',
    diagnostics,
    `（浏览器原始提示：${raw}）`,
  ].join('\n');
}

/** HTTP 与匿名登录等路径统一抛出带白名单说明的错误（先处理 Tauri 专属文案） */
export function rethrowAccountNetworkError(
  err: unknown,
  stage?: AccountFetchNetworkErrorStage
): never {
  throwIfTauriFetchLikelySecurityDomain(err);
  throw new Error(formatAccountFetchErrorMessage(err, stage ? { stage } : undefined));
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
