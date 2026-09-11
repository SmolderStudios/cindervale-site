/* OCTANE service worker. Makes the app open with no signal (gas stations are
 * dead zones) without ever serving a stale build when there IS signal.
 *
 * App files: network first, cache as the fallback. A slow network still gets
 * the cached copy after 3.5s and the fresh one lands in the cache for next time.
 * Fonts: cache first. The API, maps and routing: never touched.
 */
var CACHE = 'octane-v1';
var SHELL = ['./', './index.html', './js/core.js?v=1', './js/charts.js?v=1', './js/sample.js?v=1', './js/views.js?v=1',
  './js/stats.js?v=1', './js/form.js?v=1', './js/ui.js?v=1', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () { }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('octane-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var scope = new URL(self.registration.scope);
  if (url.origin === scope.origin && url.pathname.indexOf(scope.pathname) === 0) { e.respondWith(networkFirst(req)); return; }
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
});

function networkFirst(req) {
  return caches.open(CACHE).then(function (c) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) c.put(req, res.clone());
      return res;
    });
    var slow = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('slow')); }, 3500); });
    return Promise.race([net, slow]).catch(function () {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return c.match('./index.html').then(function (h) { return h || c.match('./'); }).then(function (h) { return h || net; });
        return net;
      });
    });
  });
}

function cacheFirst(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; });
    });
  });
}
