import { ensureAnonymousSignIn, getCloudbaseApp } from './cloudbase';
import { dbAuthUidFromEmail } from './dbAuthUid';

export const USER_SNAPSHOTS_COLLECTION = 'user_snapshots';

export type UserSnapshotDocPayload = {
  snapshot: unknown;
  updatedAt: number | null;
  version: number;
  lastWriterDeviceId: string | null;
  lastWriterPlatform: string | null;
};

function parseDoc(raw: Record<string, unknown> | undefined | null): UserSnapshotDocPayload | null {
  if (!raw) return null;
  const verRaw = raw.version;
  const version = typeof verRaw === 'number' && Number.isFinite(verRaw) ? verRaw : 0;
  const updatedRaw = raw.updatedAt;
  const updatedAt = typeof updatedRaw === 'number' && Number.isFinite(updatedRaw) ? updatedRaw : null;
  return {
    snapshot: raw.snapshot ?? null,
    updatedAt,
    version,
    lastWriterDeviceId: typeof raw.lastWriterDeviceId === 'string' ? raw.lastWriterDeviceId : null,
    lastWriterPlatform: typeof raw.lastWriterPlatform === 'string' ? raw.lastWriterPlatform : null,
  };
}

/** 按 dbAuthUid 拉取当前用户快照文档（需已自定义登录且安全规则允许读） */
export async function getUserSnapshotDocByEmail(email: string): Promise<UserSnapshotDocPayload | null> {
  const uid = await dbAuthUidFromEmail(email);
  const db = getCloudbaseApp().database();
  const res = await db.collection(USER_SNAPSHOTS_COLLECTION).where({ dbAuthUid: uid }).limit(1).get();
  const row = res.data?.[0] as Record<string, unknown> | undefined;
  return parseDoc(row);
}

type WatchOptions = {
  onChange: (data: UserSnapshotDocPayload | null) => void;
  onError?: (err: unknown) => void;
};

export type SnapshotListener = { close: () => void };

/**
 * 监听 user_snapshots 中当前用户的单条文档。需在组件卸载时调用返回的 close。
 */
export async function watchUserSnapshotByEmail(
  email: string,
  opts: WatchOptions
): Promise<SnapshotListener> {
  await ensureAnonymousSignIn();
  const uid = await dbAuthUidFromEmail(email);
  const db = getCloudbaseApp().database();
  // 部分环境下 watch + limit(1) 会触发 INIT_WATCH 服务端 SYS_ERR，故监听不加 limit。
  const query = db.collection(USER_SNAPSHOTS_COLLECTION).where({ dbAuthUid: uid });

  const listener = query.watch({
    onChange: (snapshot) => {
      const rawDocs = snapshot.docs as unknown;
      if (!rawDocs) {
        opts.onChange(null);
        return;
      }
      if (Array.isArray(rawDocs)) {
        if (rawDocs.length === 0) {
          opts.onChange(null);
          return;
        }
        opts.onChange(parseDoc(rawDocs[0] as Record<string, unknown>));
        return;
      }
      if (typeof rawDocs === 'object') {
        opts.onChange(parseDoc(rawDocs as Record<string, unknown>));
        return;
      }
      opts.onChange(null);
    },
    onError: (err: unknown) => opts.onError?.(err),
  });

  return { close: () => listener.close() };
}
