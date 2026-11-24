'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const session = require('../public/session-state');

test('language pages reuse an anonymous visitor ID; unavailable storage is supported', () => {
    const storage = new Map();
    const platform = { crypto: crypto.webcrypto, localStorage: {
        getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
    } };
    const first = session.visitorId(platform);
    assert.match(first, /^[a-f0-9]{32}$/);
    assert.equal(session.visitorId(platform), first);
    storage.set('randly_online_visitor', '<invalid>');
    assert.notEqual(session.visitorId(platform), first);
    const blocked = { crypto: crypto.webcrypto, get localStorage() { throw Error('disabled'); } };
    assert.match(session.visitorId(blocked), /^[a-f0-9]{32}$/);
});

function browserHistory() {
    const events = new Map(), entries = [null, { unrelated: 'preserved' }];
    let index = 1;
    const platform = { location: { href: 'https://randly.live/fr.html' },
        addEventListener: (name, handler) => events.set(name, handler),
        history: {
            get state() { return entries[index]; },
            replaceState: state => { entries[index] = state; },
            pushState: state => { entries.splice(++index, entries.length, state); },
            back: () => { index--; },
            forward: () => { index++; }
        }
    };
    return { platform, events, entries, index: () => index };
}

test('Back exits chat to the same landing entry, then can leave the site normally', () => {
    const b = browserHistory(); let leaves = 0;
    const n = session.navigation(b.platform, { leave: () => leaves++, suspend() {}, resume() {} });
    assert.equal(n.enter(), true); n.enter();
    assert.equal(b.entries.length, 3); // no extra entries from skip/re-enter
    b.platform.history.back(); b.events.get('popstate')();
    assert.equal(leaves, 1); assert.equal(b.platform.history.state.randlyView, 'home');
    assert.equal(b.platform.history.state.unrelated, 'preserved');
    b.platform.history.back(); assert.equal(b.index(), 0);
});

test('End does not add duplicate home entries; Forward/BFCache cannot restart a call', () => {
    const b = browserHistory(); let leaves = 0, suspends = 0, resumes = 0;
    const n = session.navigation(b.platform, { leave: () => leaves++, suspend: () => suspends++, resume: () => resumes++ });
    n.enter(); n.leave();
    assert.equal(n.enter(), false); // wait for the pending Back traversal
    b.events.get('popstate')();
    assert.equal(leaves, 1); assert.equal(b.index(), 1);
    b.platform.history.forward(); b.events.get('popstate')();
    assert.equal(b.platform.history.state.randlyView, 'home');
    assert.equal(leaves, 1);
    n.enter(); b.events.get('pagehide')();
    assert.equal(leaves, 2); assert.equal(suspends, 1);
    b.events.get('pageshow')({ persisted: true });
    assert.equal(resumes, 1); assert.equal(b.platform.history.state.randlyView, 'home');
});

test('overlapping language connections count once without bypassing connection limits', { timeout: 30000 }, async t => {
    const port = 36000 + crypto.randomInt(8000), base = `http://127.0.0.1:${port}`;
    const sockets = [];
    const root = path.join(__dirname, '..');
    const srv = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true,
        env: { ...process.env, NODE_ENV: 'production', PORT: String(port), BIND_HOST: '127.0.0.1',
            MAX_CONN_PER_IP: '3', DATA_DIR: path.join(root, '.test-data', 'presence'), TRUSTED_PROXY_CIDRS: '',
            GEMINI_API_KEY: '', GROQ_API_KEY: '', GOOGLE_TRANSLATE_API_KEY: '', TURN_SHARED_SECRET: '', TURN_URLS: '' } });
    t.after(() => { sockets.forEach(s => s.close()); srv.kill(); });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Server startup timeout')), 15000);
        srv.once('error', reject);
        srv.stdout.on('data', d => { if (String(d).includes('Server is running')) { clearTimeout(timer); resolve(); } });
    });
    const online = async () => (await (await fetch(base + '/healthz')).json()).online;
    const expectOnline = async expected => {
        for (let i = 0; i < 40; i++) {
            if (await online() === expected) return;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.equal(await online(), expected);
    };
    const connect = visitorId => new Promise((resolve, reject) => {
        const s = io(base, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
            extraHeaders: { Origin: 'https://randly.live' }, auth: { visitorId }, timeout: 3000 });
        sockets.push(s);
        s.once('connect_error', reject);
        s.once('online-count', count => { s.lastCount = count; resolve(s); });
        s.connect();
    });
    const id = crypto.randomBytes(16).toString('hex');
    const oldLanguage = await connect(id), newLanguage = await connect(id);
    await expectOnline(1);
    assert.equal(newLanguage.lastCount % 10, 1); // display animation still uses multiples of ten
    assert.ok(newLanguage.lastCount >= 2010);
    const otherVisitor = await connect(crypto.randomBytes(16).toString('hex'));
    await expectOnline(2);
    await assert.rejects(connect(id)); // same ID cannot evade the per-IP connection cap
    oldLanguage.close(); await expectOnline(2);
    newLanguage.close(); await expectOnline(1);
    otherVisitor.close(); await expectOnline(0);
    const invalidA = await connect('invalid'), invalidB = await connect('invalid');
    await expectOnline(2); invalidA.close(); invalidB.close(); await expectOnline(0);
});

test('UI preferences survive blocked storage and quota failures without disabling controls', () => {
    const blocked = session.preferences({ get localStorage() { throw new Error('blocked'); } });
    assert.equal(blocked.get('randly_lang'), null);
    blocked.set('randly_lang', 'fr');
    blocked.set('randly_sound_muted', true);
    assert.equal(blocked.get('randly_lang'), 'fr');
    assert.equal(blocked.get('randly_sound_muted'), 'true');
    const values = new Map([['randly_theme', 'light']]);
    const quota = session.preferences({ localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem() { throw new Error('quota'); }
    } });
    assert.equal(quota.get('randly_theme'), 'light');
    quota.set('randly_theme', 'dark');
    assert.equal(quota.get('randly_theme'), 'dark');
    assert.equal(values.get('randly_theme'), 'light', 'fallback does not clear existing storage');
    const normal = session.preferences({localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    }});
    normal.set('randly_lang', 'ar');
    assert.equal(values.get('randly_lang'), 'ar');
});
