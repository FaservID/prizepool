import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
  .replaceAll('import.meta.env', '__env');
const apiUrl = 'https://script.google.com/macros/s/offline-test/exec';

async function browser({ random = () => 0.5, submitError, appendError, configured = true } = {}) {
  let now = 0;
  let timerId = 0;
  let requestId = 0;
  const timers = new Map();
  const listeners = new Set();
  const nodes = new Set();
  const submissions = [];
  const scheduled = [];
  const window = {
    location: { origin: 'https://example.test' },
    setTimeout(callback, delay) {
      const id = ++timerId;
      scheduled.push(delay);
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    addEventListener(type, listener) { assert.equal(type, 'message'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'message'); listeners.delete(listener); },
  };
  const document = {
    body: {
      append(...elements) {
        for (const element of elements) nodes.add(element);
        if (appendError) throw appendError;
      },
    },
    createElement(tag) {
      return {
        tag, style: {}, children: [], attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        appendChild(child) { this.children.push(child); },
        remove() { nodes.delete(this); },
        submit() {
          const values = Object.fromEntries(this.children.map(input => [input.name, input.value]));
          submissions.push({ ...values, payload: JSON.parse(values.payload), form: this,
            iframe: [...nodes].find(node => node.name === this.target), listener: [...listeners].at(-1) });
          if (submitError) throw submitError;
        },
      };
    },
  };
  const context = vm.createContext({ window, document, URL, Math: Object.assign(Object.create(Math), { random }),
    crypto: { randomUUID: () => `request-${++requestId}` },
    __env: { VITE_GAS_URL: configured ? apiUrl : '', BASE_URL: '/prizepool/' } });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => {});
  await module.evaluate();
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const next = async () => {
    assert.ok(timers.size, 'expected pending timer');
    const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    timers.delete(id);
    const elapsed = timer.at - now;
    now = timer.at;
    timer.callback();
    await flush();
    return elapsed;
  };
  const emit = (submission, data, origin = 'https://script.googleusercontent.com') => {
    const event = { origin, data: { type: 'NBSA_PRIZEPOOL_RESULT', requestId: submission.requestId, ...data } };
    for (const listener of [...listeners]) listener(event);
  };
  const clean = (pendingTimers = 0) => {
    assert.equal(nodes.size, 0, 'form and iframe removed');
    assert.equal(listeners.size, 0, 'message listener removed');
    assert.equal(timers.size, pendingTimers, 'only expected timers remain');
  };
  return { api: module.namespace, window, submissions, scheduled, nodes, timers, listeners,
    next, flush, emit, clean };
}

for (const action of ['verify', 'publicInfo']) {
  test(`${action}: BUSY then success, fresh requestId, cleanup and jitter`, async () => {
    const b = await browser();
    const result = b.api.prizePoolRequest(action, { checkToken: '2027001' });
    assert.equal(b.submissions.length, 0, 'first attempt waits for jitter');
    assert.equal(await b.next(), 750);
    const first = b.submissions[0];
    assert.equal(first.form.action, apiUrl);
    assert.equal(first.form.method, 'POST');
    assert.equal(first.origin, b.window.location.origin);
    assert.equal(first.payload.action, action);
    assert.equal(first.iframe.attributes['aria-hidden'], 'true');
    b.emit(first, { ok: false, error: 'BUSY', retryable: true });
    await b.flush();
    b.clean(1);
    assert.equal(await b.next(), 1500);
    const second = b.submissions[1];
    assert.notEqual(second.requestId, first.requestId);
    assert.notEqual(second.form.target, first.form.target);
    b.emit(second, { ok: true, data: { status: 'LIVE' } });
    assert.equal((await result).status, 'LIVE');
    b.clean();
    assert.deepEqual(b.scheduled, [750, 15000, 1500, 15000]);
  });

  test(`${action}: transport timeout stops after exactly four attempts`, async () => {
    const b = await browser();
    const rejection = assert.rejects(b.api.prizePoolRequest(action), /Koneksi habis waktu/);
    await b.next();
    for (let attempt = 0; attempt < 4; attempt++) {
      assert.equal(b.submissions.length, attempt + 1);
      assert.equal(await b.next(), 15000);
      b.clean(attempt < 3 ? 1 : 0);
      if (attempt < 3) assert.equal(await b.next(), [1500, 3000, 6000][attempt]);
    }
    await rejection;
    assert.equal(new Set(b.submissions.map(row => row.requestId)).size, 4);
    assert.deepEqual(b.scheduled, [750, 15000, 1500, 15000, 3000, 15000, 6000, 15000]);
    b.clean();
  });

  test(`${action}: BUSY exhaustion returns server error after four attempts`, async () => {
    const b = await browser();
    const rejection = assert.rejects(b.api.prizePoolRequest(action), /BUSY/);
    for (let attempt = 0; attempt < 4; attempt++) {
      await b.next();
      b.emit(b.submissions.at(-1), { ok: false, error: 'BUSY', retryable: true });
      await b.flush();
      b.clean(attempt < 3 ? 1 : 0);
    }
    await rejection;
    assert.equal(b.submissions.length, 4);
  });

  test(`${action}: business errors never retry`, async () => {
    for (const error of ['Token salah', 'CLOSED', 'Unauthorized', 'BUSY']) {
      const b = await browser();
      const rejection = assert.rejects(b.api.prizePoolRequest(action), err => err.message === error);
      await b.next();
      b.emit(b.submissions[0], { ok: false, error });
      await rejection;
      assert.equal(b.submissions.length, 1);
      b.clean();
    }
  });
}

test('admin: no jitter or retry, even for BUSY or timeout', async () => {
  for (const timeout of [false, true]) {
    const b = await browser();
    const rejection = assert.rejects(b.api.prizePoolRequest('adminGenerateTickets', { ticketCount: 65 }, 'secret'),
      timeout ? /Koneksi habis waktu/ : /BUSY/);
    assert.equal(b.submissions.length, 1);
    assert.deepEqual(b.scheduled, [30000]);
    assert.equal(b.submissions[0].payload.password, 'secret');
    if (timeout) assert.equal(await b.next(), 30000);
    else b.emit(b.submissions[0], { ok: false, error: 'BUSY', retryable: true });
    await rejection;
    assert.equal(b.submissions.length, 1);
    b.clean();
  }
});

test('form submit or append errors clean up and never retry', async () => {
  for (const action of ['verify', 'publicInfo', 'adminImportResults']) {
    for (const failure of ['submitError', 'appendError']) {
      const error = new Error('DOM failure');
      const b = await browser({ [failure]: error });
      const rejection = assert.rejects(b.api.prizePoolRequest(action), err => err === error);
      if (action !== 'adminImportResults') await b.next();
      await rejection;
      assert.equal(b.submissions.length, failure === 'submitError' ? 1 : 0);
      b.clean();
    }
  }
});

test('unknown, late requestId, wrong type and untrusted origin ignored', async () => {
  const b = await browser();
  const result = b.api.prizePoolRequest('verify');
  await b.next();
  const first = b.submissions[0];
  await b.next(); // First attempt timed out; listener removed before retry.
  first.listener({ origin: 'null', data: { type: 'NBSA_PRIZEPOOL_RESULT', requestId: first.requestId, ok: true } });
  b.clean(1);
  await b.next();
  const second = b.submissions[1];
  for (const data of [{ requestId: first.requestId }, { requestId: 'unknown' }, { type: 'OTHER' }]) {
    b.emit(second, { ok: true, ...data });
  }
  for (const origin of ['https://evil.test', 'https://google.com.evil.test', 'http://google.com', 'https://evilgoogle.com']) {
    b.emit(second, { ok: true }, origin);
  }
  assert.equal(b.listeners.size, 1);
  assert.equal(b.nodes.size, 2);
  assert.equal(b.timers.size, 1);
  b.emit(second, { ok: true, data: 'accepted' }, 'null');
  assert.equal(await result, 'accepted');
  b.clean();
  second.listener({ origin: 'null', data: { type: 'NBSA_PRIZEPOOL_RESULT', requestId: second.requestId, ok: false } });
  b.clean();
});

test('jitter spans initial 0–1.5s and exponential 1–2s, 2–4s, 4–8s bounds', async () => {
  for (const [random, expected] of [[0, [0, 1000, 2000, 4000]], [1 - Number.EPSILON, [1500, 2000, 4000, 8000]]]) {
    const b = await browser({ random: () => random });
    const rejection = assert.rejects(b.api.prizePoolRequest('verify'), /BUSY/);
    for (const delay of expected) {
      assert.ok(Math.abs((await b.next()) - delay) < 0.000001);
      b.emit(b.submissions.at(-1), { ok: false, error: 'BUSY', retryable: true });
      await b.flush();
    }
    await rejection;
    b.clean();
  }
});

test('payload cannot turn retryable verify into admin mutation', async () => {
  const b = await browser();
  const result = b.api.prizePoolRequest('verify', { action: 'adminGenerateTickets' });
  await b.next();
  assert.equal(b.submissions[0].payload.action, 'verify');
  b.emit(b.submissions[0], { ok: true });
  await result;
  b.clean();
});

test('missing configuration fails before scheduling or creating DOM', async () => {
  const b = await browser({ configured: false });
  assert.equal(b.api.isConfigured, false);
  await assert.rejects(b.api.prizePoolRequest('verify'), /belum dikonfigurasi/);
  assert.equal(b.submissions.length, 0);
  b.clean();
});

test('participantUrl returns base participant URL without query parameters', async () => {
  const b = await browser();
  assert.equal(b.api.participantUrl(), 'https://example.test/prizepool/');
  assert.equal(b.api.participantUrl('0123456789abcdef'.repeat(4)), 'https://example.test/prizepool/');
});
