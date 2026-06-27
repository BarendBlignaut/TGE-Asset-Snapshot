
// ============================================================================
// TGE Diagnostics Platform
// ============================================================================

(function () {
    "use strict";

    window.TGE = window.TGE || {};

    const _entries = [];

    function now() {
        return new Date().toISOString();
    }

    function add(type, data) {
        _entries.push({
            id: _entries.length + 1,
            timestamp: now(),
            type,
            ...data
        });
    }

    window.TGE.Diagnostics = {

        version: "1.0.0",

        logApi(data) {
            add("API", data);
        },

        logError(data) {
            add("ERROR", data);
        },

        logEvent(data) {
            add("EVENT", data);
        },

        logPerformance(data) {
            add("PERFORMANCE", data);
        },

        entries() {
            return [..._entries];
        },

        clear() {
            _entries.length = 0;
        },

        health() {
            return {
                healthy: true,
                version: this.version,
                entries: _entries.length
            };
        }

    };

})();
