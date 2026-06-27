window.TGE.diagnostics = {

    version: "1.0.0",

    log(data) {
        add("LOG", data || {});
    },

    getLogs() {
        return [..._entries];
    },

    clearLogs() {
        _entries.length = 0;
    },

    health() {
        return {
            healthy: true,
            version: this.version,
            logs: _entries.length
        };
    },

    init() {},

    show() {},

    hide() {},

    toggle() {}

};
