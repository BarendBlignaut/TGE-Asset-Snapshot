// TGE Asset Snapshot — API Registry
// public/api.js

(function () {
  'use strict';

  function render() {
    var view = TGE.el('view-api');
    if (!view) return;
    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Management</div>',
        '<div class="hero-title">API Registry</div>',
        '<div class="hero-bar" style="margin-top:14px;">',
          '<div class="hero-bar-left">',
            '<button class="hero-run-btn" id="add-api-btn" type="button">+ Add API</button>',
          '</div>',
        '</div>',
      '</div>',
      '<div class="card">',
        '<div class="card-kicker">Coming Soon</div>',
        '<div class="card-title">API Registry</div>',
        '<p style="font-size:13px;color:var(--muted);">Define and manage telematics API endpoints. Each entry stores the URL, method, field definitions, and sample response used to build flows.</p>',
      '</div>',
    ].join('');
  }

  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

})();
