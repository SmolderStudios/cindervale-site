/* OCTANE charts. Hand-drawn SVG, no library.
 *
 * House rules (from the dataviz skill): one y axis, solid hairline grid, 2px
 * lines, 8px dots with a 2px ring in the panel colour, bars no wider than 24px
 * with a 4px rounded end and a square base, a legend when there are two or more
 * series, a crosshair that snaps to the nearest point and a tooltip that lists
 * every series at that x. Every chart also has a Numbers table under it, so no
 * value is only reachable by hovering.
 */
'use strict';

var CH_ID = 0, TIP_T = 0;

function niceTicks(lo, hi, n) {
  n = n || 4;
  if (!isFinite(lo) || !isFinite(hi)) return { lo: 0, hi: 1, ticks: [0, 1], step: 1 };
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  var raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  var step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, ticks = [];
  for (var v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo: a, hi: b, ticks: ticks, step: step };
}

function timeTicks(x0, x1, maxN) {
  var out = [], span = x1 - x0;
  maxN = Math.max(2, maxN);
  if (span > 70 * DAY) {
    var k0 = monthKey(x0) + 1, k1 = monthKey(x1), step = Math.max(1, Math.ceil((k1 - k0 + 1) / maxN));
    for (var k = k0; k <= k1; k += step) {
      var t = monthStart(k), d = new Date(t);
      out.push({ t: t, label: F.mon(t) + (d.getMonth() === 0 ? " '" + String(d.getFullYear()).slice(2) : '') });
    }
  } else {
    var days = span / DAY, choices = [1, 2, 3, 7, 14], st = 30;
    for (var i = 0; i < choices.length; i++) if (days / choices[i] <= maxN) { st = choices[i]; break; }
    var s = new Date(x0); s.setHours(0, 0, 0, 0);
    for (var tt = s.getTime() + DAY; tt <= x1; tt += st * DAY) out.push({ t: tt, label: F.day(tt) });
  }
  return out;
}

/* -------------------------------------------------------------- tooltip --- */
function tipShow(html, cx, cy) {
  var t = document.getElementById('tip');
  if (!t) return;
  clearTimeout(TIP_T);
  t.innerHTML = html;
  t.hidden = false;
  var w = t.offsetWidth, h = t.offsetHeight;
  var L = clamp(cx - w / 2, 8, window.innerWidth - w - 8), T = cy - h - 16;
  if (T < 8) T = cy + 20;
  t.style.transform = 'translate(' + Math.round(L) + 'px,' + Math.round(T) + 'px)';
}
function tipHide(delay) {
  clearTimeout(TIP_T);
  TIP_T = setTimeout(function () { var t = document.getElementById('tip'); if (t) t.hidden = true; }, delay || 0);
}
function tipRow(color, value, label) {
  return '<div class="tr"><i style="background:' + color + '"></i><b>' + value + '</b><span>' + esc(label) + '</span></div>';
}

function legendHTML(items) {
  return '<div class="legend">' + items.map(function (it) {
    return '<span><i class="' + (it[2] === 'dot' ? 'dk' : '') + '" style="background:' + it[1] + '"></i>' + esc(it[0]) + '</span>';
  }).join('') + '</div>';
}

function tableHTML(head, rows) {
  if (!rows.length) return '';
  return '<details class="tbl"><summary>' + ic('down') + 'Numbers</summary><div class="tw"><table><thead><tr>' +
    head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
    '</tbody></table></div></details>';
}

/* Shared pointer wiring. pick(clientX) -> index, show(i), hide(). */
function wireHover(svg, n, pick, show, hide) {
  var cur = -1;
  function on(e) { cur = pick(e.clientX); show(cur); }
  svg.addEventListener('pointermove', on);
  svg.addEventListener('pointerdown', on);
  svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hide(); cur = -1; } });
  svg.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') setTimeout(function () { hide(); cur = -1; }, 2200); });
  svg.addEventListener('pointercancel', function () { hide(); cur = -1; });
  svg.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    cur = clamp((cur < 0 ? n - 1 : cur) + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1);
    show(cur);
  });
  svg.addEventListener('focus', function () { cur = n - 1; show(cur); });
  svg.addEventListener('blur', function () { hide(); cur = -1; });
}

/* ----------------------------------------------------------- line chart --- */
/* o: { series:[{name,color,pts:[{x,y,odd?}],dots,area,glow}], h, yFmt(v,step),
        tipFmt(v,s), tipHead(p), tipExtra(p), ref, refLabel, zero, label, empty } */
function lineChart(el, o) {
  if (!el) return;
  var id = 'c' + (++CH_ID);
  var W = Math.round(Math.max(260, el.clientWidth || 330)), H = o.h || 190;
  var series = o.series.filter(function (s) { return s.pts.length; });
  var all = [];
  series.forEach(function (s) { all = all.concat(s.pts); });
  if (all.length < (o.min || 2)) { el.innerHTML = '<div class="nodata">' + (o.empty || 'Not enough fill-ups yet.') + '</div>'; return; }
  /* The reference line's label lives in its own gutter on the right, like an
     axis label, so data can never run over it. */
  var P = { l: 38, r: o.ref != null ? 42 : 14, t: 12, b: 26 };
  var xs = all.map(function (p) { return p.x; }), ys = all.map(function (p) { return p.y; });
  if (o.ref != null) ys.push(o.ref);
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  if (x1 - x0 < DAY) { x0 -= 3 * DAY; x1 += 3 * DAY; }
  var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
  var pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.1 || 1;
  var Y = niceTicks(o.zero ? 0 : Math.max(0, lo - pad), hi + pad, 4);
  var iw = W - P.l - P.r, ih = H - P.t - P.b;
  function sx(x) { return P.l + (x - x0) / (x1 - x0) * iw; }
  function sy(y) { return P.t + (1 - (y - Y.lo) / (Y.hi - Y.lo)) * ih; }
  var g = [], defs = '';
  Y.ticks.forEach(function (t) {
    var y = Math.round(sy(t)) + 0.5;
    g.push('<line class="gl" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>');
    g.push('<text x="' + (P.l - 7) + '" y="' + (y + 3.5) + '" text-anchor="end">' + o.yFmt(t, Y.step) + '</text>');
  });
  timeTicks(x0, x1, Math.floor(iw / 56)).forEach(function (tk) {
    var x = sx(tk.t);
    if (x < P.l + 10 || x > W - P.r - 10) return;
    g.push('<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + tk.label + '</text>');
  });
  g.push('<line class="base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (P.t + ih + 0.5) + '" y2="' + (P.t + ih + 0.5) + '"/>');
  if (o.ref != null) {
    var ry = Math.round(sy(o.ref)) + 0.5;
    g.push('<line class="ref" x1="' + P.l + '" x2="' + (W - P.r + 3) + '" y1="' + ry + '" y2="' + ry + '"/>');
    g.push('<text x="' + (W - P.r + 6) + '" y="' + (ry - 3) + '" style="font-size:9px">' + esc(o.refTag || '') + '</text>' +
      '<text class="labv" x="' + (W - P.r + 6) + '" y="' + (ry + 10) + '">' + esc(o.refVal || '') + '</text>');
  }
  series.forEach(function (s, si) {
    var d = s.pts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1); }).join('');
    if (s.area && s.pts.length > 1) {
      var gid = id + 'a' + si;
      defs += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity=".2"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient>';
      g.push('<path d="' + d + 'L' + sx(s.pts[s.pts.length - 1].x).toFixed(1) + ' ' + (P.t + ih) + 'L' + sx(s.pts[0].x).toFixed(1) + ' ' + (P.t + ih) + 'Z" fill="url(#' + gid + ')"/>');
    }
    if (s.pts.length > 1) g.push('<path class="ln draw' + (s.glow ? ' glow' : '') + '" pathLength="1" d="' + d + '" stroke="' + s.color + '"/>');
    if (s.dots) s.pts.forEach(function (p) {
      g.push(p.odd
        ? '<circle class="dot" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="4" fill="var(--surf)" stroke="' + s.color + '" style="stroke-width:2"/>'
        : '<circle class="dot" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="4" fill="' + s.color + '"/>');
    });
  });
  /* Value at the end of the primary line only. Labelling every point is noise. */
  if (o.endLabel && series[0]) {
    var lp = series[0].pts[series[0].pts.length - 1];
    var lx = sx(lp.x), ly = sy(lp.y) - 10;
    g.push('<text class="labv" x="' + Math.min(lx, W - P.r - 2).toFixed(1) + '" y="' + Math.max(10, ly).toFixed(1) + '" text-anchor="end">' + esc(o.endLabel(lp.y)) + '</text>');
  }
  g.push('<g class="hov" style="display:none"><line class="xh" y1="' + P.t + '" y2="' + (P.t + ih) + '"/>' +
    series.map(function (s) { return '<circle class="hd" r="5.5" fill="' + s.color + '" stroke="#fff" stroke-width="2"/>'; }).join('') + '</g>');
  g.push('<rect class="hit" x="' + (P.l - 6) + '" y="0" width="' + (iw + 12) + '" height="' + H + '"/>');
  el.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" tabindex="0" role="img" aria-label="' + esc(o.label || '') + '"><defs>' + defs + '</defs>' + g.join('') + '</svg>';

  var svg = el.firstChild, hov = svg.querySelector('.hov'), xh = hov.querySelector('.xh'), hd = hov.querySelectorAll('.hd');
  var base = series[0].pts;
  function nearest(pts, x) {
    var b = null, bd = Infinity;
    pts.forEach(function (p) { var d = Math.abs(p.x - x); if (d < bd) { bd = d; b = p; } });
    return bd <= DAY / 2 ? b : null;
  }
  function pick(clientX) {
    var r = svg.getBoundingClientRect(), px = (clientX - r.left) * (W / r.width), bi = 0, bd = Infinity;
    base.forEach(function (p, i) { var d = Math.abs(sx(p.x) - px); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }
  function show(i) {
    var p = base[i];
    if (!p) return;
    hov.style.display = '';
    var x = sx(p.x);
    xh.setAttribute('x1', x); xh.setAttribute('x2', x);
    var rows = [];
    series.forEach(function (s, si) {
      var q = si === 0 ? p : nearest(s.pts, p.x), c = hd[si];
      if (q) { c.setAttribute('cx', sx(q.x)); c.setAttribute('cy', sy(q.y)); c.style.display = ''; rows.push(tipRow(s.color, o.tipFmt ? o.tipFmt(q.y, s) : q.y, s.name)); }
      else c.style.display = 'none';
    });
    var r = svg.getBoundingClientRect(), k = r.width / W;
    tipShow('<div class="th">' + (o.tipHead ? o.tipHead(p) : F.dayY(p.x)) + '</div>' + rows.join('') + (o.tipExtra ? o.tipExtra(p) : ''), r.left + x * k, r.top + sy(p.y) * k);
  }
  function hide() { hov.style.display = 'none'; tipHide(); }
  wireHover(svg, base.length, pick, show, hide);
}

/* --------------------------------------------------------- column chart --- */
/* o: { bars:[{label,v,head,rows}], color, h, yFmt, valFmt, label, empty } */
function colChart(el, o) {
  if (!el) return;
  var bars = o.bars || [];
  if (!bars.length || bars.every(function (b) { return !b.v; })) { el.innerHTML = '<div class="nodata">' + (o.empty || 'Nothing here yet.') + '</div>'; return; }
  var W = Math.round(Math.max(260, el.clientWidth || 330)), H = o.h || 176;
  var P = { l: 42, r: 8, t: 20, b: 26 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
  var max = Math.max.apply(null, bars.map(function (b) { return b.v; }));
  var Y = niceTicks(0, max * 1.04, 4);
  function sy(v) { return P.t + (1 - v / Y.hi) * ih; }
  var band = iw / bars.length, bw = Math.max(4, Math.min(24, band * 0.62)), y0 = P.t + ih;
  var labStep = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(iw / 34))));
  var g = [];
  Y.ticks.forEach(function (t) {
    var y = Math.round(sy(t)) + 0.5;
    g.push('<line class="gl" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>');
    g.push('<text x="' + (P.l - 7) + '" y="' + (y + 3.5) + '" text-anchor="end">' + o.yFmt(t) + '</text>');
  });
  var maxI = 0;
  bars.forEach(function (b, i) { if (b.v > bars[maxI].v) maxI = i; });
  bars.forEach(function (b, i) {
    var x = P.l + i * band + (band - bw) / 2, y = sy(b.v), h = y0 - y, r = Math.min(4, bw / 2, h);
    if (h > 0.5) {
      g.push('<path class="bar rise" data-i="' + i + '" style="animation-delay:' + Math.min(i * 28, 600) + 'ms" fill="' + (b.color || o.color) + '" d="M' + x.toFixed(1) + ' ' + y0 +
        'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y.toFixed(1) +
        'H' + (x + bw - r).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y + r).toFixed(1) + 'V' + y0 + 'Z"/>');
    }
    if ((bars.length - 1 - i) % labStep === 0) g.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(b.label) + '</text>');
  });
  g.push('<line class="base" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (y0 + 0.5) + '" y2="' + (y0 + 0.5) + '"/>');
  /* Label the tallest bar and the latest one, nothing else. */
  var lab = [maxI];
  if (bars.length - 1 !== maxI && Math.abs(bars.length - 1 - maxI) * band > 44) lab.push(bars.length - 1);
  lab.forEach(function (i) {
    var b = bars[i];
    if (!b.v) return;
    var x = P.l + i * band + band / 2;
    g.push('<text class="labv" x="' + clamp(x, P.l + 16, W - P.r - 16).toFixed(1) + '" y="' + (sy(b.v) - 6).toFixed(1) + '" text-anchor="middle">' + esc(o.valFmt(b.v)) + '</text>');
  });
  bars.forEach(function (b, i) { g.push('<rect class="hit" data-i="' + i + '" x="' + (P.l + i * band).toFixed(1) + '" y="0" width="' + band.toFixed(1) + '" height="' + H + '"/>'); });
  el.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" tabindex="0" role="img" aria-label="' + esc(o.label || '') + '">' + g.join('') + '</svg>';
  var svg = el.firstChild, paths = svg.querySelectorAll('path.bar');
  function pick(clientX) { var r = svg.getBoundingClientRect(), px = (clientX - r.left) * (W / r.width); return clamp(Math.floor((px - P.l) / band), 0, bars.length - 1); }
  function show(i) {
    var b = bars[i];
    Array.prototype.forEach.call(paths, function (p) { p.classList.toggle('hl', +p.getAttribute('data-i') === i); });
    var r = svg.getBoundingClientRect(), k = r.width / W;
    tipShow('<div class="th">' + esc(b.head || b.label) + '</div>' + (b.rows || tipRow(b.color || o.color, o.valFmt(b.v), o.name || '')), r.left + (P.l + i * band + band / 2) * k, r.top + sy(b.v) * k);
  }
  function hide() { Array.prototype.forEach.call(paths, function (p) { p.classList.remove('hl'); }); tipHide(); }
  wireHover(svg, bars.length, pick, show, hide);
}

/* -------------------------------------------------- horizontal bars (HTML) --- */
function hbarsHTML(rows, fmt, subFmt) {
  if (!rows.length) return '';
  var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
  return rows.map(function (r, i) {
    return '<div class="hb"><span class="hl">' + esc(r.label) + '</span><span class="ht"><i style="width:' + (r.v / max * 100).toFixed(1) + '%;animation-delay:' + i * 80 + 'ms' + (r.color ? ';background:' + r.color : '') + '"></i></span><b>' + fmt(r.v) + (subFmt ? '<small>' + subFmt(r) + '</small>' : '') + '</b></div>';
  }).join('');
}

/* ------------------------------------------------------------- sparkline --- */
function sparkSVG(vals, w, h) {
  w = w || 70; h = h || 26;
  var v = vals.filter(function (x) { return x != null && isFinite(x); });
  if (v.length < 2) return '';
  var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), sp = hi - lo || 1;
  var pts = v.map(function (x, i) { return [i / (v.length - 1) * (w - 4) + 2, h - 3 - (x - lo) / sp * (h - 6)]; });
  var last = pts[pts.length - 1];
  return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline fill="none" stroke="#3a5673" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="' +
    pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.8" fill="var(--accent)"/></svg>';
}

/* --------------------------------------------------------------- the dial --- */
/* 270 degree gauge. The bright arc fills to your average MPG (the number in the
   middle); the orange needle is the last tank. Scale is fitted to your tanks. */
function dialSVG(o) {
  var cx = 130, cy = 126, R = 98, A0 = 135, SW = 270;
  var lo = o.lo, hi = o.hi;
  function ang(v) { return A0 + SW * clamp((v - lo) / (hi - lo), 0, 1); }
  function pt(a, r) { var t = a * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }
  function arc(a1, a2, r) {
    var p1 = pt(a1, r), p2 = pt(a2, r);
    return 'M' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a2 - a1 > 180 ? 1 : 0) + ' 1 ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
  }
  var id = 'd' + (++CH_ID), s = [];
  s.push('<defs><linearGradient id="' + id + 'g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="color-mix(in srgb,var(--accent) 35%,#08111e)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient>' +
    '<filter id="' + id + 'f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>');
  var span = hi - lo, minor = span <= 24 ? 1 : 2, major = span <= 24 ? 5 : 10;
  for (var v = Math.ceil(lo / minor) * minor; v <= hi + 1e-9; v += minor) {
    var a = ang(v), isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-9;
    var p1 = pt(a, R + 11), p2 = pt(a, R + (isMaj ? 19 : 15));
    s.push('<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" stroke="' + (isMaj ? '#4d6883' : '#253a52') + '" stroke-width="' + (isMaj ? 1.6 : 1) + '"/>');
    if (isMaj) { var pl = pt(a, R + 30); s.push('<text x="' + pl[0].toFixed(1) + '" y="' + (pl[1] + 3.5).toFixed(1) + '" text-anchor="middle" style="font:600 10px var(--mono);fill:#5d7690">' + v + '</text>'); }
  }
  s.push('<path d="' + arc(A0, A0 + SW, R) + '" fill="none" stroke="rgba(120,190,255,.09)" stroke-width="14"/>');
  if (o.avg != null) {
    s.push('<path class="dialfill" pathLength="1" d="' + arc(A0, Math.max(A0 + 0.5, ang(o.avg)), R) + '" fill="none" stroke="url(#' + id + 'g)" stroke-width="14" filter="url(#' + id + 'f)"/>');
    var pa = pt(ang(o.avg), R - 12), pb = pt(ang(o.avg), R + 9);
    s.push('<line x1="' + pa[0].toFixed(1) + '" y1="' + pa[1].toFixed(1) + '" x2="' + pb[0].toFixed(1) + '" y2="' + pb[1].toFixed(1) + '" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>');
  }
  if (o.best != null && o.worst != null && o.best > o.worst) {
    s.push('<path d="' + arc(ang(o.worst), ang(o.best), R - 16) + '" fill="none" stroke="rgba(160,210,255,.28)" stroke-width="3" stroke-linecap="round"/>');
  }
  /* The last-tank pointer is short and sits on the ring so it never crosses the
     big number. No SVG filter on it: a filter on a perfectly straight line has
     a zero-height box and the line silently disappears. The glow is a wider,
     fainter copy underneath instead. */
  if (o.last != null) {
    var al = ang(o.last), a0 = o.animate ? A0 : al, x1 = cx + R - 27, x2 = cx + R + 10;
    s.push('<g class="needle" transform="rotate(' + al.toFixed(2) + ' ' + cx + ' ' + cy + ')">' +
      (o.animate ? '<animateTransform attributeName="transform" type="rotate" from="' + a0 + ' ' + cx + ' ' + cy + '" to="' + al.toFixed(2) + ' ' + cx + ' ' + cy + '" dur="1.4s" calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1" fill="freeze"/>' : '') +
      '<line x1="' + x1 + '" y1="' + cy + '" x2="' + x2 + '" y2="' + cy + '" stroke="var(--s2)" stroke-opacity=".3" stroke-width="11" stroke-linecap="round"/>' +
      '<line x1="' + x1 + '" y1="' + cy + '" x2="' + x2 + '" y2="' + cy + '" stroke="var(--s2)" stroke-width="4.5" stroke-linecap="round"/>' +
      '<circle cx="' + x1 + '" cy="' + cy + '" r="3.2" fill="#fff"/></g>');
  }
  return '<svg viewBox="0 0 260 226" role="img" aria-label="' + esc(o.label || '') + '">' + s.join('') + '</svg>';
}

function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

/* Count a number up from zero. Skipped when motion is reduced. */
function countUp(el, to, dec, ms) {
  if (!el || to == null || !isFinite(to)) return;
  if (reducedMotion() || typeof requestAnimationFrame !== 'function') { el.textContent = to.toFixed(dec); return; }
  var t0 = 0, dur = ms || 900;
  function step(t) {
    if (!t0) t0 = t;
    var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (to * e).toFixed(dec);
    if (k < 1) requestAnimationFrame(step);
  }
  el.textContent = (0).toFixed(dec);
  requestAnimationFrame(step);
}
