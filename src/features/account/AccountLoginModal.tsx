import { useState } from 'react';
import { X } from 'lucide-react';
import { useAccountAuth } from './useAccountAuth';

interface AccountLoginModalProps {
  onClose: () => void;
  onPullSnapshot: (snapshot: unknown) => void;
  onPushSnapshot: () => unknown;
}

export default function AccountLoginModal({ onClose, onPullSnapshot, onPushSnapshot }: AccountLoginModalProps) {
  const { businessToken, hint, sendCode, verify, logout, setHint, pullSnapshot, pushSnapshot } = useAccountAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const readUpdatedAt = (value: unknown): number | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = (value as { updatedAt?: unknown }).updatedAt;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };

  const formatTime = (ts: number | null): string => {
    if (!ts) return '未知';
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  };

  const handleSend = async () => {
    setError('');
    if (!email.trim()) {
      setError('请填写邮箱');
      return;
    }
    setBusy(true);
    try {
      await sendCode(email);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    if (!email.trim() || !code.trim()) {
      setError('请填写邮箱和验证码');
      return;
    }
    setBusy(true);
    try {
      await verify(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    setBusy(true);
    try {
      const localSnapshot = onPushSnapshot();
      const localUpdatedAt = readUpdatedAt(localSnapshot);
      const res = await pullSnapshot(businessToken);
      const cloudUpdatedAt = typeof res.data?.updatedAt === 'number' ? res.data.updatedAt : null;
      const confirmed = window.confirm(
        `确认用云端数据覆盖本地吗？\n云端更新时间：${formatTime(cloudUpdatedAt)}\n本地更新时间：${formatTime(localUpdatedAt)}`
      );
      if (!confirmed) {
        setHint('已取消拉取，保留本地数据');
        return;
      }
      onPullSnapshot(res.data?.snapshot ?? null);
      setHint('已从云端拉取并应用到本地');
    } catch (e) {
      setError(e instanceof Error ? e.message : '拉取失败');
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    setError('');
    if (!businessToken) {
      setError('请先完成账号登录');
      return;
    }
    setBusy(true);
    try {
      const localSnapshot = onPushSnapshot();
      await pushSnapshot(businessToken, localSnapshot);
      setHint('已将本地数据推送到云端');
    } catch (e) {
      setError(e instanceof Error ? e.message : '推送失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        className="relative w-full max-w-md rounded-xl border border-[#2E2E36] bg-[#212128] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-login-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-[#9CA3AF] hover:bg-[#2A2A32] hover:text-white"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-[#2E2E36] px-5 py-4">
          <h2 id="account-login-title" className="text-lg font-semibold text-white">
            账号（邮箱验证码）
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            首次会先匿名登录 CloudBase，再调用云端接口；业务 token 仅存本会话。
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          {businessToken ? (
            <div className="rounded-lg bg-[#2A2A32] px-3 py-2 text-sm text-emerald-300">
              当前已登录（业务会话）
            </div>
          ) : null}

          <label className="block text-xs font-medium text-[#9CA3AF]">
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#3E3E48] bg-[#1A1A1F] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A853]"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy}
            />
          </label>

          <div className="flex gap-2">
            <label className="block flex-1 text-xs font-medium text-[#9CA3AF]">
              验证码
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3E3E48] bg-[#1A1A1F] px-3 py-2 text-sm text-white outline-none focus:border-[#D4A853]"
                placeholder="6 位数字"
                disabled={busy}
              />
            </label>
          </div>

          {(error || hint) && (
            <p className={`text-sm ${error ? 'text-red-400' : 'text-[#9CA3AF]'}`}>
              {error || hint}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleSend}
              className="rounded-lg bg-[#3E3E48] px-4 py-2 text-sm font-medium text-white hover:bg-[#4B5563] disabled:opacity-50"
            >
              发送验证码
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleVerify}
              className="rounded-lg bg-[#D4A853] px-4 py-2 text-sm font-medium text-black hover:bg-[#e8c066] disabled:opacity-50"
            >
              验证并登录
            </button>
            {businessToken ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePull}
                  className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32] disabled:opacity-50"
                >
                  拉取云端
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handlePush}
                  className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32] disabled:opacity-50"
                >
                  推送云端
                </button>
              </>
            ) : null}
            {businessToken ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  logout();
                  setHint('');
                  setCode('');
                }}
                className="rounded-lg border border-[#3E3E48] px-4 py-2 text-sm text-[#9CA3AF] hover:bg-[#2A2A32]"
              >
                退出业务登录
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
