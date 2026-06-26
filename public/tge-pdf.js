// TGE PDF Service
// public/tge-pdf.js

(function () {
  'use strict';

  window.TGE = window.TGE || {};
  TGE.PDF = TGE.PDF || {};

  function base64ToBytes(base64) {
    var bin = atob(base64 || '');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'report.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  TGE.PDF.generate = async function (opts) {
    opts = opts || {};

    var route = opts.route;
    var payload = opts.payload || {};
    var filename = opts.filename || (
      TGE.outputFileName
        ? TGE.outputFileName({ module: opts.module || 'Snapshot', type: opts.type || 'Report', extension: 'pdf' })
        : 'report.pdf'
    );

    if (!route) throw new Error('PDF route is required.');

    var result = await TGE.api('POST', route, payload);

    if (!result.ok) {
      throw new Error((result.data && result.data.error) || 'PDF generation failed.');
    }

    var base64 = result.data && result.data.base64;
    if (!base64) throw new Error('PDF response did not include base64 content.');

    return {
      fileName: filename,
      base64: base64,
      contentType: 'application/pdf',
      sizeBytes: result.data.sizeBytes || null
    };
  };

  TGE.PDF.download = async function (opts) {
    var attachment = await TGE.PDF.generate(opts);
    var bytes = base64ToBytes(attachment.base64);
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), attachment.fileName);
    return attachment;
  };

  TGE.PDF.attachment = async function (opts) {
    return TGE.PDF.generate(opts);
  };

})();
