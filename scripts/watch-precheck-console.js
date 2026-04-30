/**
 * Watch precheck script (for Browser DevTools Console)
 *
 * Usage:
 * 1) Open app page (http://localhost:3000) and make sure you are logged in.
 * 2) Open DevTools Console.
 * 3) Copy this entire file content and run in Console.
 * 4) Replace TEST_EMAIL with your account email.
 *
 * Goal:
 * - Precheck normal get with same condition as watch: where({ email })
 * - Keep watch condition minimal: no limit/orderBy/extra filters
 */

(async () => {
  const TEST_EMAIL = 'your-email@example.com'; // TODO: replace with your account email
  const COLLECTION = 'user_snapshots';

  const g = window;
  const cloudbaseGlobal =
    g.cloudbase ||
    g.tcb ||
    g.__cloudbase__ ||
    null;

  if (!cloudbaseGlobal) {
    console.error(
      '[watch-precheck] CloudBase SDK not found on window. Please run this script on your app page after login.'
    );
    return;
  }

  let app;
  try {
    app =
      typeof cloudbaseGlobal.init === 'function'
        ? cloudbaseGlobal.init()
        : cloudbaseGlobal;
  } catch (e) {
    console.error('[watch-precheck] cloudbase.init failed:', e);
    return;
  }

  if (!app || typeof app.database !== 'function') {
    console.error('[watch-precheck] Cannot access app.database().');
    return;
  }

  const db = app.database();
  const cmd = db.command;

  console.group('[watch-precheck] start');
  console.info('collection =', COLLECTION);
  console.info('email =', TEST_EMAIL);
  console.groupEnd();

  // 1) Precheck get with the same minimal condition as watch.
  try {
    const getRes = await db.collection(COLLECTION).where({ email: TEST_EMAIL }).get();
    console.group('[watch-precheck] get result');
    console.info('ok = true');
    console.info('total docs =', Array.isArray(getRes?.data) ? getRes.data.length : 'unknown');
    if (Array.isArray(getRes?.data) && getRes.data[0]) {
      const d = getRes.data[0];
      console.info('first doc fields =', Object.keys(d));
      console.info('has email field =', Object.prototype.hasOwnProperty.call(d, 'email'));
      console.info('has snapshot field =', Object.prototype.hasOwnProperty.call(d, 'snapshot'));
    }
    console.groupEnd();
  } catch (e) {
    console.group('[watch-precheck] get failed');
    console.error(e);
    console.info(
      'Meaning: collection/field/rule may be invalid for current login state. Fix this first, then test watch.'
    );
    console.groupEnd();
    return;
  }

  // 2) Keep watch condition minimal: where({ email }) only.
  let watcher = null;
  try {
    watcher = db
      .collection(COLLECTION)
      .where({ email: TEST_EMAIL })
      .watch({
        onChange(snapshot) {
          console.group('[watch-precheck] watch onChange');
          console.info('docs length =', Array.isArray(snapshot?.docs) ? snapshot.docs.length : 'unknown');
          console.info('snapshot =', snapshot);
          console.groupEnd();
        },
        onError(err) {
          console.group('[watch-precheck] watch onError');
          console.error('err =', err);
          console.info('msgData =', err?.msgData ?? err?.original?.msgData ?? null);
          console.groupEnd();
        },
      });

    console.info('[watch-precheck] watch started. Save returned handle as window.__watchPrecheckStop');
    g.__watchPrecheckStop = () => {
      try {
        watcher && watcher.close && watcher.close();
      } catch (e) {
        console.warn('[watch-precheck] close watch failed:', e);
      }
      console.info('[watch-precheck] watch closed');
    };
  } catch (e) {
    console.group('[watch-precheck] watch start failed');
    console.error(e);
    console.info('Please keep only where({ email }) and verify login state + security rules.');
    console.groupEnd();
  }
})();

