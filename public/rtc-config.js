'use strict';
(function (root) {
    const defaults = () => ({ iceTransportPolicy: 'all', iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ] });
    function createProvider(request = root.fetch.bind(root), now = Date.now) {
        let cached = defaults(), validUntil = 0, inFlight = null;
        async function refresh() {
            let timer;
            try {
                const controller = new AbortController();
                timer = setTimeout(() => controller.abort(), 5000);
                const response = await request('/api/ice', { cache: 'no-store', signal: controller.signal });
                if (!response.ok) throw new Error('ICE unavailable');
                const data = await response.json();
                if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error('ICE empty');
                const servers = data.iceServers.filter(server => {
                    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
                    return Array.isArray(urls) && urls.length && urls.every(url => typeof url === 'string' && /^(?:stun|turn|turns):[^\s]+$/.test(url));
                });
                if (!servers.length) throw new Error('ICE invalid');
                const expirations = servers.filter(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)))
                    .map(s => Number(String(s.username || '').split(':')[0]) * 1000);
                const expiry = expirations.length ? Math.min(...expirations) - 30000 : now() + 60000;
                if (!Number.isFinite(expiry) || expiry <= now()) throw new Error('ICE expired');
                cached = { iceTransportPolicy: 'all', iceServers: servers };
                validUntil = Math.min(expiry, now() + 540000);
            } catch (_) {
                // Do not reuse expired TURN credentials or log credentials on failure.
                cached = defaults(); validUntil = now() + 10000;
            } finally { clearTimeout(timer); }
            return cached;
        }
        return { get() {
            if (now() < validUntil) return Promise.resolve(cached);
            if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
            return inFlight;
        } };
    }
    if (typeof module === 'object' && module.exports) module.exports = { createProvider };
    else root.RandlyRTC = { createProvider };
})(globalThis);
