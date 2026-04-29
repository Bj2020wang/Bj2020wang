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
 *
 * 前置：控制台「身份认证 → 登录方式」中开启「邮箱验证码」，并完成内置邮件 / 代发配置。
 */
const https = require('https');
const cloudbase = require('@cloudbase/node-sdk');
const crypto = require('crypto');
const SNAPSHOT_HISTORY_LIMIT = 3;

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
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

function isCollectionMissingError(err) {
  var msg = err && err.message ? String(err.message) : '';
  return msg.includes('Db or Table not exist') || msg.includes('collection not exists');
}

exports.main = async function (event) {
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
      default:
        return fail(404, 404, 'unknown action');
    }
  } catch (err) {
    console.error('newworld error', err);
    return fail(500, 500, '服务器繁忙，请稍后重试');
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
  await removeTokensForEmail(email);
  await db.collection('user_tokens').add({
    email: email,
    token: token,
    createdAt: verifiedAt,
  });

  return ok({ token: token, email: email });
}

async function resolveEmailByToken(token) {
  var t = String(token || '').trim();
  if (!t) return null;
  var res = await db.collection('user_tokens').where({ token: t }).limit(1).get();
  var data = res.data;
  if (!data || !data[0]) return null;
  return data[0].email || null;
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

  var snap = await db.collection('user_snapshots').where({ email: email }).limit(1).get();
  if (!snap.data || !snap.data[0]) {
    return ok({ email: email, snapshot: null, updatedAt: null });
  }

  var doc = snap.data[0];
  return ok({
    email: email,
    snapshot: doc.snapshot != null ? doc.snapshot : null,
    updatedAt: doc.updatedAt != null ? doc.updatedAt : null,
  });
}

async function handlePush(payload) {
  var email = await resolveEmailByToken(payload.token);
  if (!email) {
    return fail(401, 401, '登录已失效，请重新验证');
  }

  var snapshot = payload.snapshot;
  var updatedAt = Date.now();

  var existing = await db.collection('user_snapshots').where({ email: email }).limit(1).get();
  if (existing.data && existing.data[0]) {
    var previous = existing.data[0];
    try {
      await db.collection('user_snapshot_histories').add({
        email: email,
        snapshot: previous.snapshot,
        updatedAt: typeof previous.updatedAt === 'number' ? previous.updatedAt : null,
        backupAt: updatedAt,
      });
      await trimSnapshotHistory(email);
    } catch (err) {
      // 历史集合未建时不阻断主流程，推送照常成功
      if (!isCollectionMissingError(err)) throw err;
    }
    await db.collection('user_snapshots').doc(existing.data[0]._id).update({
      snapshot: snapshot,
      updatedAt: updatedAt,
    });
  } else {
    await db.collection('user_snapshots').add({
      email: email,
      snapshot: snapshot,
      updatedAt: updatedAt,
    });
  }

  return ok({ email: email, updatedAt: updatedAt });
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
