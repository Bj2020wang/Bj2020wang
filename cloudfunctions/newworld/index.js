/**
 * CloudBase 云函数 newworld（账号：发码 / 验证 / 拉取快照 / 推送快照）
 *
 * 发码：走云开发身份认证 HTTP API + 控制台已配置的「内置邮件服务 / 邮箱验证码」。
 * 验码：调用 /auth/v1/verification/verify，通过后签发业务 token（pull/push 不变）。
 *
 * 云函数环境变量（控制台配置）：
 * - CLOUDBASE_PUBLISHABLE_KEY：与前端 .env 中 VITE_CLOUDBASE_PUBLISHABLE_KEY 相同（客户端 Publishable Key）
 * - CLOUDBASE_REGION：可选，默认 ap-shanghai
 * - CLOUDBASE_AUTH_API_BASE：可选，完整 Auth API 根 URL；不设则用 https://${TCB_ENV}.${region}.tcb-api.tencentcloudapi.com
 * - TCB_CUSTOM_LOGIN_PRIVATE_KEY / TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID：可选；与控制台「自定义登录」私钥一致时，验码接口可返回 customLoginTicket，供前端 signIn 后按安全规则直连 user_snapshots。
 *
 * 前置：控制台「身份认证 → 登录方式」中开启「邮箱验证码」，并完成内置邮件 / 代发配置。
 */
const https = require('https');
const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const SNAPSHOT_HISTORY_LIMIT = 3;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildCloudbaseInitConfig() {
  var cfg = { env: cloudbase.SYMBOL_CURRENT_ENV };
  var pk = process.env.TCB_CUSTOM_LOGIN_PRIVATE_KEY;
  var pkId = process.env.TCB_CUSTOM_LOGIN_PRIVATE_KEY_ID;
  var envId = process.env.TCB_ENV || '';
  if (pk && pkId && envId) {
    cfg.credentials = {
      private_key: String(pk).replace(/\\n/g, '\n'),
      private_key_id: String(pkId).trim(),
      env_id: String(envId).trim(),
    };
  }
  return cfg;
}

var app = cloudbase.init(buildCloudbaseInitConfig());
var db = app.database();
var _ = db.command;

/** 与前端 dbAuthUid.ts 一致：用于自定义登录 uid 及 user_snapshots.dbAuthUid */
function dbAuthUidFromEmail(email) {
  var norm = normalizeEmail(email);
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 32);
}

async function ensureSnapshotDbAuthUid(email) {
  var expected = dbAuthUidFromEmail(email);
  var snap;
  try {
    snap = await db.collection('user_snapshots').where({ email: email }).limit(1).get();
  } catch (err) {
    if (isCollectionMissingError(err)) return;
    throw err;
  }
  if (!snap.data || !snap.data[0]) return;
  var doc = snap.data[0];
  if (doc.dbAuthUid === expected) return;
  try {
    await db.collection('user_snapshots').doc(doc._id).update({ dbAuthUid: expected });
  } catch (err) {
    if (isCollectionMissingError(err)) return;
    throw err;
  }
}

/** 当前 HTTP 触发事件，用于附加 CORS 响应头（若网关已注入同名头，以网关为准） */
var __corsEvent = null;

function getHttpMethod(ev) {
  if (!ev || typeof ev !== 'object') return '';
  var m =
    ev.httpMethod ||
    (ev.requestContext && ev.requestContext.http && ev.requestContext.http.method) ||
    (ev.requestContext && ev.requestContext.httpMethod) ||
    ev.method ||
    '';
  return String(m).toUpperCase();
}

function getHttpHeader(ev, name) {
  var h = ev && ev.headers;
  if (!h || typeof h !== 'object') return '';
  var want = String(name).toLowerCase();
  for (var k in h) {
    if (!Object.prototype.hasOwnProperty.call(h, k)) continue;
    if (String(k).toLowerCase() === want) return String(h[k] == null ? '' : h[k]);
  }
  return '';
}

/**
 * 浏览器 fetch 业务网关时的跨域响应头。
 * 控制台新版常见「跨域设置 / 添加跨域域名」对应文档中的跨域校验与白名单；若网关仍未带回 CORS，则由函数兜底。
 * @see https://docs.cloudbase.net/service/cors
 */
function corsHeadersFor(ev) {
  var origin = getHttpHeader(ev, 'origin');
  var h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '3600',
  };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
  } else {
    h['Access-Control-Allow-Origin'] = '*';
  }
  return h;
}

function httpOptionsResponse(ev) {
  return {
    statusCode: 204,
    headers: corsHeadersFor(ev),
    body: '',
  };
}

function jsonResponse(statusCode, bodyObj) {
  var cors = corsHeadersFor(__corsEvent);
  return {
    statusCode,
    headers: Object.assign({}, cors, { 'Content-Type': 'application/json; charset=utf-8' }),
    body: JSON.stringify(bodyObj),
  };
}

function ok(data, message) {
  return jsonResponse(200, { code: 0, message: message || 'ok', data: data });
}

function fail(statusCode, code, message) {
  return jsonResponse(statusCode, { code: code, message: message });
}

function parseRequest(event) {
  if (event == null) return {};
  if (typeof event.body === 'string' && event.body.length > 0) {
    try {
      return JSON.parse(event.body);
    } catch (e) {
      return null;
    }
  }
  if (typeof event.body === 'object' && event.body !== null) return event.body;
  if (typeof event === 'object' && event.action) return event;
  return {};
}

function normalizeEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isEmailLike(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getPublishableKey() {
  const k = process.env.CLOUDBASE_PUBLISHABLE_KEY;
  return typeof k === 'string' ? k.trim() : '';
}

function getAuthApiBase() {
  const custom = process.env.CLOUDBASE_AUTH_API_BASE;
  if (custom && String(custom).trim()) {
    return String(custom).trim().replace(/\/$/, '');
  }
  const envId = process.env.TCB_ENV || 'cloudbase-prepaid-2ewaac0459784f';
  const region = process.env.CLOUDBASE_REGION || 'ap-shanghai';
  return 'https://' + envId + '.' + region + '.tcb-api.tencentcloudapi.com';
}

function httpsPostJson(urlString, body, headers) {
  const u = new URL(urlString);
  const data = JSON.stringify(body);
  const merged = Object.assign(
    {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
    headers || {}
  );

  return new Promise(function (resolve, reject) {
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: merged,
    };
    const req = https.request(opts, function (res) {
      var raw = '';
      res.on('data', function (chunk) {
        raw += chunk;
      });
      res.on('end', function () {
        var parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (e) {
          parsed = { _parseError: true, _raw: raw };
        }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function removeTokensForEmail(email) {
  await db.collection('user_tokens').where({ email }).remove();
}

async function cleanupExpiredTokensForEmail(email) {
  var now = Date.now();
  await db
    .collection('user_tokens')
    .where({
      email: email,
      expiresAt: _.lt(now),
    })
    .remove();
}

function isCollectionMissingError(err) {
  var msg = err && err.message ? String(err.message) : '';
  return msg.includes('Db or Table not exist') || msg.includes('collection not exists');
}

function errorHintForResponse(err) {
  var detail = err && err.message ? String(err.message).trim().slice(0, 240) : '';
  return detail || '';
}

function toNumberOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 云数据库对字段为 null 的 object 做局部合并时会报 Cannot create field ... in element {snapshot: null}，需用 _.set 整体替换 */
function snapshotForStore(raw) {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

exports.main = async function (event) {
  __corsEvent = event;
  try {
    var httpMethod = getHttpMethod(event);
    if (httpMethod === 'OPTIONS') {
      return httpOptionsResponse(event);
    }

    const req = parseRequest(event);
    if (req === null) {
      return fail(400, 400, '请求体不是合法 JSON');
    }

    const action = req.action;
    const payload = req.payload || {};

    if (!action) {
      return fail(400, 400, 'action is required');
    }

    try {
      switch (action) {
      case 'send-code':
        return await handleSendCode(payload);
      case 'verify-code':
        return await handleVerifyCode(payload);
      case 'pull':
        return await handlePull(payload);
      case 'push':
        return await handlePush(payload);
      case 'list-history':
        return await handleListHistory(payload);
      case 'restore-history':
        return await handleRestoreHistory(payload);
      case 'team-create':
        return await handleTeamCreate(payload);
      case 'team-join':
        return await handleTeamJoin(payload);
      case 'team-leave':
        return await handleTeamLeave(payload);
      case 'team-get':
        return await handleTeamGet(payload);
      case 'team-pull':
        return await handleTeamPull(payload);
      case 'team-push':
        return await handleTeamPush(payload);
      case 'team-set-peer-read-only':
        return await handleTeamSetPeerReadOnly(payload);
      case 'team-set-peer-access':
        return await handleTeamSetPeerAccess(payload);
      default:
        return fail(404, 404, 'unknown action');
    }
  } catch (err) {
    console.error('newworld error', action, err && err.stack ? err.stack : err);
    if (isCollectionMissingError(err)) {
      return fail(
        503,
        503,
        '数据库集合不存在或未创建（常见于 user_snapshots），请在云开发控制台创建集合后重试'
      );
    }
    var hint = errorHintForResponse(err);
    return fail(
      500,
      500,
      hint ? '服务异常：' + hint + '（亦可查看云函数 newworld 运行日志）' : '服务器繁忙，请稍后重试'
    );
  }
  } finally {
    __corsEvent = null;
  }
};

async function handleSendCode(payload) {
  const email = normalizeEmail(payload.email);
  if (!email || !isEmailLike(email)) {
    return fail(400, 400, '邮箱格式不正确');
  }

  const publishable = getPublishableKey();
  if (!publishable) {
    return fail(500, 500, '云函数未配置 CLOUDBASE_PUBLISHABLE_KEY');
  }

  const sendUrl = getAuthApiBase() + '/auth/v1/verification';
  var result = await httpsPostJson(
    sendUrl,
    { email: email, target: 'ANY' },
    { Authorization: 'Bearer ' + publishable }
  );

  var sc = result.statusCode;
  var body = result.body || {};

  if (body.error || (sc && sc >= 400)) {
    if (body.error === 'rate_limit_exceeded' || body.error_code === 4029) {
      return fail(429, 429, '发送过于频繁，请稍后再试');
    }
    var msg = body.error_description || body.error || '发送验证码失败';
    return fail(400, 400, String(msg));
  }

  var verificationId = body.verification_id;
  if (!verificationId) {
    return fail(
      502,
      502,
      '邮件服务未返回 verification_id，请确认控制台已开启「邮箱验证码」并完成发件配置'
    );
  }

  return ok({
    email: email,
    verification_id: verificationId,
    expires_in: body.expires_in,
    is_user: body.is_user,
  });
}

async function handleVerifyCode(payload) {
  const email = normalizeEmail(payload.email);
  const verificationId = String(payload.verificationId || '').trim();
  const inputCode = String(payload.code || '').trim();

  if (!email || !isEmailLike(email) || !/^\d{6}$/.test(inputCode) || !verificationId) {
    return fail(400, 400, '验证码错误或已过期');
  }

  const publishable = getPublishableKey();
  if (!publishable) {
    return fail(500, 500, '云函数未配置 CLOUDBASE_PUBLISHABLE_KEY');
  }

  const verifyUrl = getAuthApiBase() + '/auth/v1/verification/verify';
  var result = await httpsPostJson(
    verifyUrl,
    { verification_id: verificationId, verification_code: inputCode },
    { Authorization: 'Bearer ' + publishable }
  );

  var sc = result.statusCode;
  var body = result.body || {};

  if (body.error || (sc && sc >= 400) || !body.verification_token) {
    var msg = body.error_description || body.error || '验证码错误或已过期';
    return fail(400, 400, String(msg));
  }

  var verifiedAt = Date.now();
  var userSnap = await db.collection('auth_users').where({ email: email }).limit(1).get();
  if (userSnap.data && userSnap.data[0]) {
    await db.collection('auth_users').doc(userSnap.data[0]._id).update({ lastVerifiedAt: verifiedAt });
  } else {
    await db.collection('auth_users').add({
      email: email,
      createdAt: verifiedAt,
      lastVerifiedAt: verifiedAt,
    });
  }

  var token = randomToken();
  var deviceId = String(payload.deviceId || '').trim() || 'unknown-device';
  var platform = String(payload.platform || '').trim() || 'web';
  var expiresAt = Date.now() + TOKEN_TTL_MS;
  await db.collection('user_tokens').add({
    email: email,
    token: token,
    createdAt: verifiedAt,
    expiresAt: expiresAt,
    deviceId: deviceId,
    platform: platform,
  });

  await ensureSnapshotDbAuthUid(email);

  var customLoginTicket = null;
  try {
    var cred = app.config && app.config.credentials;
    if (cred && cred.private_key && cred.private_key_id && cred.env_id) {
      var uid = dbAuthUidFromEmail(email);
      customLoginTicket = app.auth().createTicket(uid, {
        refresh: 7 * 24 * 3600 * 1000,
        expire: Date.now() + 7 * 24 * 3600 * 1000,
      });
    }
  } catch (ticketErr) {
    console.warn(
      'newworld createTicket skipped',
      ticketErr && ticketErr.message ? ticketErr.message : ticketErr
    );
  }

  return ok({ token: token, email: email, customLoginTicket: customLoginTicket });
}

async function resolveEmailByToken(token) {
  var t = String(token || '').trim();
  if (!t) return null;
  var res = await db.collection('user_tokens').where({ token: t }).limit(1).get();
  var data = res.data;
  if (!data || !data[0]) return null;
  var item = data[0];
  var expiresAt = toNumberOrNull(item.expiresAt);
  var now = Date.now();
  // 最小安全策略：旧 token（无 expiresAt）按失效处理，防止长期有效。
  if (expiresAt == null || expiresAt < now) {
    await db.collection('user_tokens').doc(item._id).remove();
    return null;
  }
  await cleanupExpiredTokensForEmail(item.email);
  return item.email || null;
}

async function trimSnapshotHistory(email) {
  var historyRes;
  try {
    historyRes = await db
      .collection('user_snapshot_histories')
      .where({ email: email })
      .orderBy('backupAt', 'desc')
      .limit(100)
      .get();
  } catch (err) {
    if (isCollectionMissingError(err)) return;
    throw err;
  }
  var list = historyRes.data || [];
  if (list.length <= SNAPSHOT_HISTORY_LIMIT) return;
  var stale = list.slice(SNAPSHOT_HISTORY_LIMIT);
  await Promise.all(
    stale.map(function (item) {
      return db.collection('user_snapshot_histories').doc(item._id).remove();
    })
  );
}

async function handlePull(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }

  await ensureSnapshotDbAuthUid(email);

  var snap;
  try {
    snap = await db.collection('user_snapshots').where({ email: email }).limit(1).get();
  } catch (err) {
    if (isCollectionMissingError(err)) {
      return ok({
        email: email,
        snapshot: null,
        updatedAt: null,
        version: 0,
      });
    }
    throw err;
  }
  if (!snap.data || !snap.data[0]) {
    return ok({ email: email, snapshot: null, updatedAt: null, version: 0 });
  }

  var doc = snap.data[0];
  return ok({
    email: email,
    snapshot: doc.snapshot != null ? doc.snapshot : null,
    updatedAt: doc.updatedAt != null ? doc.updatedAt : null,
    version: toNumberOrNull(doc.version) != null ? doc.version : 0,
    lastWriterDeviceId: typeof doc.lastWriterDeviceId === 'string' ? doc.lastWriterDeviceId : null,
    lastWriterPlatform: typeof doc.lastWriterPlatform === 'string' ? doc.lastWriterPlatform : null,
  });
}

async function handlePush(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }

  var dbUid = dbAuthUidFromEmail(email);
  var snapshot = payload.snapshot;
  var updatedAt = Date.now();
  var baseVersionRaw = payload.baseVersion;
  var baseVersion = typeof baseVersionRaw === 'number' && Number.isFinite(baseVersionRaw) ? baseVersionRaw : 0;
  var forcePush = payload.force === true;
  var deviceId = String(payload.deviceId || '').trim() || 'unknown-device';
  var platform = String(payload.platform || '').trim() || 'web';

  var existing = await db.collection('user_snapshots').where({ email: email }).limit(1).get();
  if (existing.data && existing.data[0]) {
    var previous = existing.data[0];
    var currentVersion = toNumberOrNull(previous.version);
    if (currentVersion == null) currentVersion = 0;

    if (!forcePush && baseVersion !== currentVersion) {
      return jsonResponse(409, {
        code: 409,
        message: '云端数据已更新，请先拉取或确认覆盖',
        data: {
          currentVersion: currentVersion,
          incomingBaseVersion: baseVersion,
          lastWriterDeviceId:
            typeof previous.lastWriterDeviceId === 'string' ? previous.lastWriterDeviceId : null,
          lastWriterPlatform:
            typeof previous.lastWriterPlatform === 'string' ? previous.lastWriterPlatform : null,
          updatedAt: typeof previous.updatedAt === 'number' ? previous.updatedAt : null,
        },
      });
    }

    try {
      await db.collection('user_snapshot_histories').add({
        email: email,
        snapshot: previous.snapshot,
        updatedAt: typeof previous.updatedAt === 'number' ? previous.updatedAt : null,
        version: currentVersion,
        lastWriterDeviceId:
          typeof previous.lastWriterDeviceId === 'string' ? previous.lastWriterDeviceId : null,
        lastWriterPlatform:
          typeof previous.lastWriterPlatform === 'string' ? previous.lastWriterPlatform : null,
        backupAt: updatedAt,
      });
      await trimSnapshotHistory(email);
    } catch (err) {
      // 历史集合未建时不阻断主流程，推送照常成功
      if (!isCollectionMissingError(err)) throw err;
    }
    await db.collection('user_snapshots').doc(existing.data[0]._id).update({
      snapshot: _.set(snapshotForStore(snapshot)),
      updatedAt: updatedAt,
      version: currentVersion + 1,
      lastWriterDeviceId: deviceId,
      lastWriterPlatform: platform,
      dbAuthUid: dbUid,
    });
    return ok({
      email: email,
      updatedAt: updatedAt,
      version: currentVersion + 1,
      forceApplied: forcePush,
    });
  } else {
    await db.collection('user_snapshots').add({
      email: email,
      snapshot: snapshotForStore(snapshot),
      updatedAt: updatedAt,
      version: 1,
      lastWriterDeviceId: deviceId,
      lastWriterPlatform: platform,
      dbAuthUid: dbUid,
    });
    return ok({
      email: email,
      updatedAt: updatedAt,
      version: 1,
      forceApplied: forcePush,
    });
  }
}

async function handleListHistory(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }

  var res;
  try {
    res = await db
      .collection('user_snapshot_histories')
      .where({ email: email })
      .orderBy('backupAt', 'desc')
      .limit(SNAPSHOT_HISTORY_LIMIT)
      .get();
  } catch (err) {
    if (isCollectionMissingError(err)) {
      return ok({ email: email, items: [] });
    }
    throw err;
  }
  var items = (res.data || []).map(function (item) {
    return {
      id: item._id,
      backupAt: typeof item.backupAt === 'number' ? item.backupAt : null,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : null,
    };
  });

  return ok({ email: email, items: items });
}

async function handleRestoreHistory(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }

  var historyId = String(payload.historyId || '').trim();
  if (!historyId) {
    return fail(400, 400, 'historyId is required');
  }

  var res;
  try {
    res = await db.collection('user_snapshot_histories').doc(historyId).get();
  } catch (err) {
    if (isCollectionMissingError(err)) {
      return fail(404, 404, '历史快照集合不存在，请先推送一次创建历史');
    }
    throw err;
  }
  var item = res.data;
  if (!item || item.email !== email) {
    return fail(404, 404, '历史快照不存在');
  }

  return ok({
    email: email,
    snapshot: item.snapshot != null ? item.snapshot : null,
    backupAt: typeof item.backupAt === 'number' ? item.backupAt : null,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : null,
  });
}

/** ---------- 双人协作空间（MVP：最多 2 人，共享一份 snapshot / version；文档无自动过期，凭 teamId 在验码登录后可长期加入/拉取） ---------- */

function generateTeamId() {
  return randomToken().slice(0, 16);
}

async function getTeamDocByTeamId(teamId) {
  var tid = String(teamId || '').trim();
  if (!tid) return null;
  var res = await db.collection('team_snapshots').where({ teamId: tid }).limit(1).get();
  if (!res.data || !res.data[0]) return null;
  return res.data[0];
}

function normalizeMemberList(members) {
  if (!Array.isArray(members)) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < members.length; i++) {
    var e = normalizeEmail(members[i]);
    if (e && isEmailLike(e) && !seen[e]) {
      seen[e] = true;
      out.push(e);
    }
  }
  return out;
}

function assertTeamMember(email, doc) {
  var members = normalizeMemberList(doc.members);
  var norm = normalizeEmail(email);
  if (!members.includes(norm)) {
    return fail(403, 403, '无权访问该协作空间');
  }
  return null;
}

/** @typedef {'bothPush'|'peerReadOnly'|'peerReadAllWriteOwn'} PeerAccess */

/** @param {Record<string, any>} doc */
function normalizePeerAccess(doc) {
  var p = String(doc.peerAccess || '').trim();
  if (p === 'bothPush' || p === 'peerReadOnly' || p === 'peerReadAllWriteOwn') return p;
  if (doc.peerReadOnly === true) return 'peerReadOnly';
  return 'bothPush';
}

/** @param {any} todo @param {string} ownerNorm */
function effectiveTodoOwnerEmail(todo, ownerNorm) {
  if (todo && typeof todo === 'object' && typeof todo.collabOwnerEmail === 'string') {
    var o = normalizeEmail(todo.collabOwnerEmail);
    if (o) return o;
  }
  return normalizeEmail(ownerNorm);
}

/**
 * 校验队友在 peerReadAllWriteOwn 下的快照：非本人 Todo/事件（含墓碑）须与当前云端一致。
 * @returns {string|null} 错误信息或 null
 */
function validateTeammateWriteOwnSnapshot(serverSnap, clientSnap, writerNorm, ownerNorm) {
  if (!serverSnap || typeof serverSnap !== 'object') serverSnap = {};
  if (!clientSnap || typeof clientSnap !== 'object') clientSnap = {};

  var sTodos = Array.isArray(serverSnap.todos) ? serverSnap.todos : [];
  var cTodos = Array.isArray(clientSnap.todos) ? clientSnap.todos : [];
  var sTodoMap = {};
  sTodos.forEach(function (t) {
    if (t && t.id) sTodoMap[t.id] = t;
  });
  var cTodoMap = {};
  cTodos.forEach(function (t) {
    if (t && t.id) cTodoMap[t.id] = t;
  });
  var sTT = serverSnap.todoTombstones && typeof serverSnap.todoTombstones === 'object' ? serverSnap.todoTombstones : {};
  var cTT = clientSnap.todoTombstones && typeof clientSnap.todoTombstones === 'object' ? clientSnap.todoTombstones : {};

  var todoIds = {};
  Object.keys(sTodoMap).forEach(function (id) {
    todoIds[id] = true;
  });
  Object.keys(cTodoMap).forEach(function (id) {
    todoIds[id] = true;
  });
  Object.keys(sTT).forEach(function (id) {
    todoIds[id] = true;
  });
  Object.keys(cTT).forEach(function (id) {
    todoIds[id] = true;
  });

  function todoOwnerForId(id) {
    var st = sTodoMap[id];
    var ct = cTodoMap[id];
    var t = st || ct;
    if (!t) return normalizeEmail(ownerNorm);
    return effectiveTodoOwnerEmail(t, ownerNorm);
  }

  for (var tid in todoIds) {
    if (!Object.prototype.hasOwnProperty.call(todoIds, tid)) continue;
    var own = todoOwnerForId(tid);
    if (own === writerNorm) continue;
    if (JSON.stringify(cTodoMap[tid] || null) !== JSON.stringify(sTodoMap[tid] || null)) {
      return '不能修改队友的任务';
    }
    var stomb = sTT[tid];
    var ctomb = cTT[tid];
    if (JSON.stringify(ctomb != null ? ctomb : null) !== JSON.stringify(stomb != null ? stomb : null)) {
      return '不能修改队友任务的删除状态';
    }
  }

  var resolveTodo = function (id) {
    return sTodoMap[id] || cTodoMap[id];
  };

  function eventOwner(ev) {
    if (!ev || typeof ev !== 'object') return normalizeEmail(ownerNorm);
    if (ev.sourceTodoId) {
      var t = resolveTodo(String(ev.sourceTodoId));
      if (t) return effectiveTodoOwnerEmail(t, ownerNorm);
    }
    if (typeof ev.collabOwnerEmail === 'string') {
      var co = normalizeEmail(ev.collabOwnerEmail);
      if (co) return co;
    }
    return normalizeEmail(ownerNorm);
  }

  var sEv = Array.isArray(serverSnap.events) ? serverSnap.events : [];
  var cEv = Array.isArray(clientSnap.events) ? clientSnap.events : [];
  var sEvMap = {};
  sEv.forEach(function (e) {
    if (e && e.id) sEvMap[e.id] = e;
  });
  var cEvMap = {};
  cEv.forEach(function (e) {
    if (e && e.id) cEvMap[e.id] = e;
  });
  var sET = serverSnap.eventTombstones && typeof serverSnap.eventTombstones === 'object' ? serverSnap.eventTombstones : {};
  var cET = clientSnap.eventTombstones && typeof clientSnap.eventTombstones === 'object' ? clientSnap.eventTombstones : {};

  var evIds = {};
  Object.keys(sEvMap).forEach(function (id) {
    evIds[id] = true;
  });
  Object.keys(cEvMap).forEach(function (id) {
    evIds[id] = true;
  });
  Object.keys(sET).forEach(function (id) {
    evIds[id] = true;
  });
  Object.keys(cET).forEach(function (id) {
    evIds[id] = true;
  });

  for (var eid in evIds) {
    if (!Object.prototype.hasOwnProperty.call(evIds, eid)) continue;
    var se = sEvMap[eid];
    var ce = cEvMap[eid];
    var ev = ce || se;
    if (!ev) continue;
    var eo = eventOwner(ev);
    if (eo === writerNorm) continue;
    if (JSON.stringify(cEvMap[eid] || null) !== JSON.stringify(sEvMap[eid] || null)) {
      return '不能修改挂在队友任务下或归属队友的日程事件';
    }
    var setomb = sET[eid];
    var cetomb = cET[eid];
    if (JSON.stringify(cetomb != null ? cetomb : null) !== JSON.stringify(setomb != null ? setomb : null)) {
      return '不能修改队友日程事件的删除状态';
    }
  }

  return null;
}

async function handleTeamCreate(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var name = String(payload.name || '协作空间').trim().slice(0, 40) || '协作空间';
  var teamId = generateTeamId();
  var norm = normalizeEmail(email);
  await db.collection('team_snapshots').add({
    teamId: teamId,
    name: name,
    ownerEmail: norm,
    members: [norm],
    /** false：双方可推送；true：除创建者外成员仅可拉取（只读） */
    peerReadOnly: false,
    peerAccess: 'bothPush',
    snapshot: null,
    version: 0,
    updatedAt: Date.now(),
  });
  return ok({
    teamId: teamId,
    name: name,
    members: [norm],
    peerReadOnly: false,
    peerAccess: 'bothPush',
  });
}

async function handleTeamJoin(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var doc = await getTeamDocByTeamId(teamId);
  if (!doc) {
    return fail(404, 404, '协作空间不存在');
  }
  var members = normalizeMemberList(doc.members);
  var norm = normalizeEmail(email);
  if (members.includes(norm)) {
    var paJoin1 = normalizePeerAccess(doc);
    return ok({
      teamId: teamId,
      name: typeof doc.name === 'string' ? doc.name : '协作空间',
      members: members,
      alreadyMember: true,
      peerReadOnly: paJoin1 === 'peerReadOnly',
      peerAccess: paJoin1,
      ownerEmail: typeof doc.ownerEmail === 'string' ? doc.ownerEmail : null,
    });
  }
  if (members.length >= 2) {
    return fail(400, 400, '协作空间已满（当前 MVP 最多 2 人）');
  }
  members.push(norm);
  await db.collection('team_snapshots').doc(doc._id).update({ members: members });
  var paJoin2 = normalizePeerAccess(doc);
  return ok({
    teamId: teamId,
    name: typeof doc.name === 'string' ? doc.name : '协作空间',
    members: members,
    alreadyMember: false,
    peerReadOnly: paJoin2 === 'peerReadOnly',
    peerAccess: paJoin2,
    ownerEmail: typeof doc.ownerEmail === 'string' ? doc.ownerEmail : null,
  });
}

async function handleTeamLeave(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var doc = await getTeamDocByTeamId(teamId);
  if (!doc) {
    return fail(404, 404, '协作空间不存在');
  }
  var err = assertTeamMember(email, doc);
  if (err) return err;
  var members = normalizeMemberList(doc.members);
  var norm = normalizeEmail(email);
  members = members.filter(function (m) {
    return m !== norm;
  });
  var ownerEmail = typeof doc.ownerEmail === 'string' ? normalizeEmail(doc.ownerEmail) : norm;
  if (ownerEmail === norm && members.length > 0) {
    ownerEmail = members[0];
  }
  if (members.length === 0) {
    await db.collection('team_snapshots').doc(doc._id).remove();
    return ok({ left: true, teamDeleted: true, members: [] });
  }
  await db.collection('team_snapshots').doc(doc._id).update({
    members: members,
    ownerEmail: ownerEmail,
  });
  return ok({ left: true, teamDeleted: false, members: members, ownerEmail: ownerEmail });
}

async function handleTeamGet(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var doc = await getTeamDocByTeamId(teamId);
  if (!doc) {
    return fail(404, 404, '协作空间不存在');
  }
  var err = assertTeamMember(email, doc);
  if (err) return err;
  var members = normalizeMemberList(doc.members);
  var paGet = normalizePeerAccess(doc);
  return ok({
    teamId: teamId,
    name: typeof doc.name === 'string' ? doc.name : '协作空间',
    members: members,
    ownerEmail: typeof doc.ownerEmail === 'string' ? doc.ownerEmail : null,
    peerReadOnly: paGet === 'peerReadOnly',
    peerAccess: paGet,
    version: toNumberOrNull(doc.version) != null ? doc.version : 0,
    updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : null,
  });
}

async function handleTeamSetPeerReadOnly(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var peerReadOnly = payload.peerReadOnly === true;
  var doc = await getTeamDocByTeamId(teamId);
  if (!doc) {
    return fail(404, 404, '协作空间不存在');
  }
  var err = assertTeamMember(email, doc);
  if (err) return err;
  var ownerNorm = typeof doc.ownerEmail === 'string' ? normalizeEmail(doc.ownerEmail) : '';
  if (!ownerNorm || ownerNorm !== normalizeEmail(email)) {
    return fail(403, 403, '仅创建者可修改该选项');
  }
  var paOld = peerReadOnly ? 'peerReadOnly' : 'bothPush';
  await db.collection('team_snapshots').doc(doc._id).update({
    peerReadOnly: peerReadOnly,
    peerAccess: paOld,
  });
  return ok({ teamId: teamId, peerReadOnly: peerReadOnly, peerAccess: paOld });
}

async function handleTeamSetPeerAccess(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var pa = String(payload.peerAccess || '').trim();
  if (pa !== 'bothPush' && pa !== 'peerReadOnly' && pa !== 'peerReadAllWriteOwn') {
    return fail(400, 400, 'peerAccess 无效');
  }
  var doc = await getTeamDocByTeamId(teamId);
  if (!doc) {
    return fail(404, 404, '协作空间不存在');
  }
  var err = assertTeamMember(email, doc);
  if (err) return err;
  var ownerNorm = typeof doc.ownerEmail === 'string' ? normalizeEmail(doc.ownerEmail) : '';
  if (!ownerNorm || ownerNorm !== normalizeEmail(email)) {
    return fail(403, 403, '仅创建者可修改该选项');
  }
  var pr = pa === 'peerReadOnly';
  await db.collection('team_snapshots').doc(doc._id).update({
    peerAccess: pa,
    peerReadOnly: pr,
  });
  return ok({ teamId: teamId, peerAccess: pa, peerReadOnly: pr });
}

async function handleTeamPull(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var doc = await getTeamDocByTeamId(teamId);
  if (!doc) {
    return fail(404, 404, '协作空间不存在');
  }
  var err = assertTeamMember(email, doc);
  if (err) return err;
  var members = normalizeMemberList(doc.members);
  var paPull = normalizePeerAccess(doc);
  return ok({
    teamId: teamId,
    name: typeof doc.name === 'string' ? doc.name : '协作空间',
    members: members,
    ownerEmail: typeof doc.ownerEmail === 'string' ? doc.ownerEmail : null,
    peerReadOnly: paPull === 'peerReadOnly',
    peerAccess: paPull,
    snapshot: doc.snapshot != null ? doc.snapshot : null,
    updatedAt: doc.updatedAt != null ? doc.updatedAt : null,
    version: toNumberOrNull(doc.version) != null ? doc.version : 0,
    lastWriterDeviceId: typeof doc.lastWriterDeviceId === 'string' ? doc.lastWriterDeviceId : null,
    lastWriterPlatform: typeof doc.lastWriterPlatform === 'string' ? doc.lastWriterPlatform : null,
  });
}

async function handleTeamPush(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }
  var teamId = String(payload.teamId || '').trim();
  if (!teamId) {
    return fail(400, 400, 'teamId 必填');
  }
  var docRow = await getTeamDocByTeamId(teamId);
  if (!docRow) {
    return fail(404, 404, '协作空间不存在');
  }
  var err = assertTeamMember(email, docRow);
  if (err) return err;
  var accessPush = normalizePeerAccess(docRow);
  if (accessPush === 'peerReadOnly') {
    var ownerNormRo = typeof docRow.ownerEmail === 'string' ? normalizeEmail(docRow.ownerEmail) : '';
    if (ownerNormRo && normalizeEmail(email) !== ownerNormRo) {
      return fail(403, 403, '当前为「对方只读」模式，仅创建者可推送到协作云端');
    }
  }
  var ownerNormPush = typeof docRow.ownerEmail === 'string' ? normalizeEmail(docRow.ownerEmail) : '';
  var writerNormPush = normalizeEmail(email);
  if (accessPush === 'peerReadAllWriteOwn' && ownerNormPush && writerNormPush !== ownerNormPush) {
    var vfMsg = validateTeammateWriteOwnSnapshot(docRow.snapshot, payload.snapshot, writerNormPush, ownerNormPush);
    if (vfMsg) {
      return fail(403, 403, vfMsg);
    }
  }
  var snapshot = payload.snapshot;
  var updatedAt = Date.now();
  var baseVersionRaw = payload.baseVersion;
  var baseVersion = typeof baseVersionRaw === 'number' && Number.isFinite(baseVersionRaw) ? baseVersionRaw : 0;
  var forcePush = payload.force === true;
  var deviceId = String(payload.deviceId || '').trim() || 'unknown-device';
  var platform = String(payload.platform || '').trim() || 'web';

  var currentVersion = toNumberOrNull(docRow.version);
  if (currentVersion == null) currentVersion = 0;

  if (!forcePush && baseVersion !== currentVersion) {
    return jsonResponse(409, {
      code: 409,
      message: '协作空间数据已被队友更新，请先拉取或确认覆盖',
      data: {
        currentVersion: currentVersion,
        incomingBaseVersion: baseVersion,
        lastWriterDeviceId:
          typeof docRow.lastWriterDeviceId === 'string' ? docRow.lastWriterDeviceId : null,
        lastWriterPlatform:
          typeof docRow.lastWriterPlatform === 'string' ? docRow.lastWriterPlatform : null,
        updatedAt: typeof docRow.updatedAt === 'number' ? docRow.updatedAt : null,
      },
    });
  }

  await db.collection('team_snapshots').doc(docRow._id).update({
    snapshot: _.set(snapshotForStore(snapshot)),
    updatedAt: updatedAt,
    version: currentVersion + 1,
    lastWriterDeviceId: deviceId,
    lastWriterPlatform: platform,
    lastWriterEmail: normalizeEmail(email),
  });
  return ok({
    teamId: teamId,
    updatedAt: updatedAt,
    version: currentVersion + 1,
    forceApplied: forcePush,
  });
}
