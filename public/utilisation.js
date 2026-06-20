// TGE Asset Snapshot — Fleet Utilisation Dashboard
// public/utilisation.js
// Status: PENDING BUILD
//
// Brief: /mnt/user-data/uploads/TGE_Utilisation_Dashboard_Brief.md
// Reference UI: /mnt/user-data/uploads/fleet_dashboard_v4.html
//
// What this page does:
//   - Shows daily KM per asset across ~5,000 vehicles
//   - Date range picker (default last 14 days)
//   - KM cutoff slider (0-600km, default 100)
//   - Cross-filtering by BU, Equip Type, Operator State, Operator Name, Legacy No, Rego
//   - Colour coded: red=below cutoff, amber=workshop, grey=offline, white=ok
//   - Static mapping modal — exclude non-vehicle records
//   - Workshop mapping modal — classify workshop statuses
//   - Sticky columns: Legacy Number left, Total KM + Avg/day right
//   - Horizontal scroll for date columns
//   - CSV and XLSX export
//
// D1 tables needed (not yet created):
//   fleet_register, telematics_km, workshop, non_functioning,
//   workshop_mapping, static_mapping
//
// Worker routes needed (not yet built):
//   POST /api/utilisation/fleet-register
//   POST /api/utilisation/telematics-km
//   POST /api/utilisation/workshop
//   POST /api/utilisation/non-functioning
//   GET  /api/utilisation/dashboard
//   GET  /api/utilisation/fleet-register
//   GET/POST /api/utilisation/workshop-mapping
//   GET/POST /api/utilisation/static-mapping
//
// Power Automate flows needed (11 flows):
//   1 x fleet register weekly
//   8 x vendor KM daily (one per vendor)
//   1 x workshop daily
//   1 x non-functioning weekly (email trigger)

(function () {
  'use strict';

  function render() {
    var view = TGE.el('view-utilisation');
    if (!view) return;

    view.innerHTML = [
      '<div class="hero">',
        '<div class="hero-kicker">Operations</div>',
        '<div class="hero-title">Fleet Utilisation Dashboard</div>',
        '<div class="hero-sub">Daily KM tracking across the full fleet — coming soon.</div>',
      '</div>',
      '<div class="card" style="text-align:center;padding:48px 20px;">',
        '<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📊</div>',
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:8px;">Fleet Utilisation — In Development</div>',
        '<p style="font-size:13px;color:var(--muted);max-width:500px;margin:0 auto;">',
          'This page will show daily KM activity per asset, flag underperforming assets, ',
          'identify assets in workshop or offline, and allow filtering by BU, asset type, ',
          'operator and more across ~5,000 active assets.',
        '</p>',
      '</div>',
    ].join('');
  }

  var _orig = TGE.onAppReady;
  TGE.onAppReady = function () {
    if (typeof _orig === 'function') _orig();
    render();
  };

  TGE.onShow['utilisation'] = function () {
    // Will load dashboard data when built
  };

})();
