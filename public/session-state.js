(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RandlySession = factory();
})(typeof window === 'object' ? window : this, function () {
    'use strict';
    function visitorId(platform) {
        const key = 'randly_online_visitor';
        try {
            const saved = platform.localStorage.getItem(key);
            if (/^[a-f0-9]{32}$/.test(saved || '')) return saved;
        } catch (_) { /* Storage can be unavailable in private/restricted browsers. */ }
        const bytes = new Uint8Array(16);
        platform.crypto.getRandomValues(bytes);
        const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        try { platform.localStorage.setItem(key, value); } catch (_) {}
        // Counting hint only: never an authentication, moderation or rate-limit identity.
        return value;
    }

    function navigation(platform, callbacks) {
        const history = platform.history;
        let active = false, returning = false;
        function mark(view) {
            return Object.assign({}, history.state, { randlyView: view });
        }
        function home() { history.replaceState(mark('home'), '', platform.location.href); }
        function reset() {
            if (!active) return;
            active = false;
            callbacks.leave();
        }
        home();
        platform.addEventListener('popstate', function () {
            returning = false;
            reset();
            // Forward must not silently rejoin an old room or restart the camera.
            if (history.state && history.state.randlyView === 'chat') home();
        });
        platform.addEventListener('pagehide', function () {
            reset();
            home();
            callbacks.suspend();
        });
        platform.addEventListener('pageshow', function (event) {
            if (event.persisted) {
                returning = false;
                reset();
                home();
                callbacks.resume();
            }
        });
        return {
            enter: function () {
                if (returning) return false;
                if (!active) {
                    history.pushState(mark('chat'), '', platform.location.href);
                    active = true;
                }
                return true;
            },
            leave: function () {
                if (!active) return;
                reset();
                if (history.state && history.state.randlyView === 'chat') {
                    returning = true;
                    history.back();
                } else home();
            }
        };
    }
    return { visitorId, navigation };
});
