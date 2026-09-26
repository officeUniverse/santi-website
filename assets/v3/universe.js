/* ============================================================
   Santi Universe v3 — particle universe (canvas, no deps)
   <canvas data-universe="interactive"> : drag to spin, click = supernova,
                                          stars reach toward the cursor.
   <canvas data-universe="ambient">     : slow drift, no input (footer).
   Optional: data-cx / data-cy (0–1 centre), data-radius (fraction of min side).
   Pauses offscreen and in hidden tabs; static frame under reduced motion.
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BASE = "242,240,235", ACCENT = "251,117,21", FOCAL = 2.3;

  function Universe(canvas) {
    var interactive = canvas.dataset.universe === "interactive";
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, cx = 0, cy = 0, R = 0, dpr = 1, pts = [], rings = [];
    var ay = 0, ax = -0.22, vay = interactive ? 0.0016 : 0.0009, vax = 0, restY = vay;
    var tiltX = 0, tiltY = 0, px = -999, py = -999, pInside = false;
    var dragging = false, lastX = 0, lastY = 0, t = 0, visible = true, running = false;

    function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

    function build() {
      var n = Math.max(90, Math.min(200, Math.round(Math.min(W, H) / 2.6)));
      var golden = Math.PI * (3 - Math.sqrt(5));
      pts = [];
      for (var i = 0; i < n; i++) {
        var y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
        pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, accent: Math.random() < 0.12,
          tw: Math.random() * 6.283, ox: 0, oy: 0, ovx: 0, ovy: 0, sx: 0, sy: 0 });
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var narrow = W < 760;
      cx = W * num(narrow ? canvas.dataset.cxMobile : canvas.dataset.cx, 0.5);
      cy = H * num(narrow ? canvas.dataset.cyMobile : canvas.dataset.cy, 0.5);
      R = Math.min(W, H) * num(canvas.dataset.radius, 0.42);
      if (!pts.length) build();
      if (reduce) draw();
    }

    function burst(x, y) {
      var power = R * 0.17;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], dx = p.sx - x, dy = p.sy - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var imp = power * Math.max(0.2, 1 - d / (R * 1.8));
        p.ovx += (dx / d) * imp; p.ovy += (dy / d) * imp;
      }
      rings.push({ x: x, y: y, r: 0, a: 0.9, accent: true }, { x: x, y: y, r: 0, a: 0.55, accent: false });
      vay += (Math.random() - 0.5) * 0.014;
    }

    if (interactive) {
      canvas.addEventListener("pointermove", function (e) {
        var rect = canvas.getBoundingClientRect();
        px = e.clientX - rect.left; py = e.clientY - rect.top; pInside = true;
        tiltY = (px / W - 0.5) * 0.5; tiltX = (py / H - 0.5) * 0.5;
        if (dragging) { vay = (e.clientX - lastX) * 0.00055; vax = (e.clientY - lastY) * -0.00045; lastX = e.clientX; lastY = e.clientY; }
      });
      canvas.addEventListener("pointerleave", function () { pInside = false; px = py = -999; tiltX = tiltY = 0; });
      canvas.addEventListener("pointerdown", function (e) {
        var rect = canvas.getBoundingClientRect();
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        burst(e.clientX - rect.left, e.clientY - rect.top);
        wake();
      });
      window.addEventListener("pointerup", function () { dragging = false; });
    }

    function draw() {
      t += 0.016;
      ay += vay; ax += vax;
      vay += (restY - vay) * 0.03; vax += (0 - vax) * 0.05;
      ax = Math.max(-1.1, Math.min(1.1, ax));
      var rx = ax + tiltX, ry = ay + tiltY;
      var sX = Math.sin(rx), cX = Math.cos(rx), sY = Math.sin(ry), cY = Math.cos(ry);
      ctx.clearRect(0, 0, W, H);

      var proj = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var x1 = p.x * cY - p.z * sY, z1 = p.x * sY + p.z * cY;
        var y1 = p.y * cX - z1 * sX, z2 = p.y * sX + z1 * cX;
        var sc = FOCAL / (FOCAL - z2);
        p.sx = cx + x1 * R * sc; p.sy = cy + y1 * R * sc;
        p.ovx += -0.05 * p.ox; p.ovx *= 0.86; p.ox += p.ovx;
        p.ovy += -0.05 * p.oy; p.ovy *= 0.86; p.oy += p.ovy;
        proj.push({ sx: p.sx + p.ox, sy: p.sy + p.oy, depth: (z2 + 1) / 2, sc: sc, p: p });
      }

      if (pInside) {
        for (var j = 0; j < proj.length; j++) {
          var q = proj[j], dx = q.sx - px, dy = q.sy - py, d = Math.sqrt(dx * dx + dy * dy);
          if (d < R * 0.9) {
            ctx.strokeStyle = "rgba(" + (q.p.accent ? ACCENT : BASE) + "," + ((1 - d / (R * 0.9)) * 0.45 * (0.4 + q.depth)).toFixed(3) + ")";
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(q.sx, q.sy); ctx.stroke();
          }
        }
      }

      proj.sort(function (a, b) { return a.depth - b.depth; });
      for (var k = 0; k < proj.length; k++) {
        var s = proj[k], a = (0.18 + s.depth * 0.82) * (0.75 + 0.25 * Math.sin(t * 1.5 + s.p.tw));
        var rad = (0.6 + s.depth * 1.9) * s.sc;
        if (pInside) {
          var ex = s.sx - px, ey = s.sy - py, dd = Math.sqrt(ex * ex + ey * ey);
          if (dd < 70) { a = Math.min(1, a + (1 - dd / 70) * 0.6); rad += (1 - dd / 70) * 1.6; }
        }
        ctx.fillStyle = "rgba(" + (s.p.accent ? ACCENT : BASE) + "," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(s.sx, s.sy, rad, 0, 6.283); ctx.fill();
      }

      for (var ri = rings.length - 1; ri >= 0; ri--) {
        var rg = rings[ri];
        rg.r += R * 0.05; rg.a *= 0.93;
        if (rg.a < 0.03) { rings.splice(ri, 1); continue; }
        ctx.strokeStyle = "rgba(" + (rg.accent ? ACCENT : BASE) + "," + rg.a.toFixed(3) + ")";
        ctx.lineWidth = rg.accent ? 1.6 : 1; ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, 6.283); ctx.stroke();
      }
    }

    function loop() {
      if (!visible || document.hidden || reduce) { running = false; return; }
      draw();
      requestAnimationFrame(loop);
    }
    function wake() { if (!running && !reduce && visible && !document.hidden) { running = true; requestAnimationFrame(loop); } }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) wake(); }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener("visibilitychange", wake);
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);

    resize();
    if (reduce) draw(); else wake();
  }

  function start() {
    document.querySelectorAll("canvas[data-universe]").forEach(function (c) {
      if (c.dataset.universeReady) return;
      c.dataset.universeReady = "1";
      Universe(c);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
