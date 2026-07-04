// TGE Progress Service
// public/tge-progress.js

(function () {
  'use strict';

  window.TGE = window.TGE || {};
  TGE.Progress = TGE.Progress || {};

  TGE.Progress.run = function (options) {
    options = options || {};

    var items = Array.isArray(options.items) ? options.items : [];
    var concurrency = Number(options.concurrency || 5);
    var delayMs = Number(options.delay || 0);
    var worker = options.worker;
    var onItem = options.onItem || function () {};
    var onProgress = options.onProgress || function () {};
    var onComplete = options.onComplete || function () {};
    var onError = options.onError || function () {};

    var cancelled = false;
    var index = 0;
    var done = 0;
    var results = [];

    function delay(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    }

    async function next() {
      while (!cancelled && index < items.length) {
        var currentIndex = index++;
        var item = items[currentIndex];

        try {
          var result = await worker(item, currentIndex);
          results[currentIndex] = result;
          onItem(result, item, currentIndex);
        } catch (e) {
          var errorResult = {
            ok: false,
            error: e && e.message ? e.message : String(e),
            item: item,
            index: currentIndex
          };

          results[currentIndex] = errorResult;
          onError(errorResult, item, currentIndex);
        }

        done++;
        onProgress(done, items.length, results);

        if (delayMs && !cancelled) {
          await delay(delayMs);
        }
      }
    }

    var promise = (async function () {
      var runners = [];
      var runnerCount = Math.min(concurrency, items.length);

      for (var i = 0; i < runnerCount; i++) {
        runners.push(next());
      }

      await Promise.all(runners);

      if (!cancelled) {
        onComplete(results);
      }

      return results;
    })();

    return {
      cancel: function () {
        cancelled = true;
      },
      promise: promise,
      isCancelled: function () {
        return cancelled;
      }
    };
  };

})();
