/* ============================================================
   Santi Universe v3 — particle universe (canvas, no deps)
   <canvas data-universe="interactive"> : drag to spin, click = supernova,
                                          stars reach toward the cursor.
   <canvas data-universe="ambient">     : slow drift, no input (footer).
   Optional: data-cx / data-cy (0–1 centre), data-radius (fraction of min side),
   data-shape="icon" : the dome flows into the dotted 3D Santi icon.
   Pauses offscreen and in hidden tabs; static frame under reduced motion.
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BASE = "244,247,248", GOLD = "255,209,71", TEAL = "8,190,204", FOCAL = 2.3;

  // Santi icon outline (240×200 px space): outer shape, then the 7 holes between its bands.
  var ICON = [[[194,112],[200,114],[205,119],[207,125],[206,133],[200,140],[99,185],[89,186],[80,180],[78,176],[78,166],[100,108],[40,85],[35,80],[33,74],[34,66],[42,59],[136,16],[151,13],[160,19],[162,23],[162,33],[142,82],[140,92]],
    [[135,99],[81,78],[72,77],[63,81],[63,84],[105,100],[159,121],[167,122],[178,117],[177,115]],
    [[86,49],[43,69],[43,75],[45,77],[51,77],[78,64],[117,48],[125,44],[128,39],[130,30],[128,30]],
    [[145,154],[197,130],[197,124],[195,122],[188,122],[160,135],[114,156],[110,165],[110,169],[112,169]],
    [[142,56],[153,30],[152,24],[148,22],[143,24],[134,47],[121,84],[131,87]],
    [[90,176],[96,176],[98,173],[119,119],[119,115],[109,112],[87,169],[87,173]],
    [[119,59],[120,57],[117,57],[91,70],[88,70],[89,72],[112,80]],
    [[120,140],[120,142],[123,142],[150,130],[151,127],[146,126],[129,119]]];

  function inPoly(x, y, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function inIcon(x, y) {
    if (!inPoly(x, y, ICON[0])) return false;
    for (var k = 1; k < ICON.length; k++) if (inPoly(x, y, ICON[k])) return false;
    return true;
  }

  // n points on the extruded icon: ~60% trace every edge on both faces, the rest fill the bands.
  function iconPoints(n) {
    var D = 0.06, out = [], segs = [], total = 0;
    ICON.forEach(function (poly) {
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segs.push({ a: a, b: b, len: len, at: total }); total += len;
      }
    });
    var edge = Math.round(n * 0.86), step = total / edge, si = 0;
    for (var e = 0; e < edge; e++) {
      var d = (e + 0.5) * step;
      while (si < segs.length - 1 && segs[si].at + segs[si].len < d) si++;
      var sg = segs[si], f = (d - sg.at) / sg.len;
      out.push([sg.a[0] + (sg.b[0] - sg.a[0]) * f, sg.a[1] + (sg.b[1] - sg.a[1]) * f, [D, -D, 0][e % 3]]);
    }
    while (out.length < n) {
      var x = 33 + Math.random() * 174, y = 13 + Math.random() * 173;
      if (inIcon(x, y)) out.push([x, y, Math.random() < 0.5 ? D : -D]);
    }
    for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = out[i]; out[i] = out[j]; out[j] = t; }
    return out.map(function (q) { return { x: (q[0] - 120) / 100, y: (q[1] - 100) / 100, z: q[2] }; });
  }
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  function Universe(canvas) {
    var interactive = canvas.dataset.universe === "interactive";
    var icon = canvas.dataset.shape === "icon", morph = icon && !reduce ? -0.6 : 1; // <0 = hold the dome briefly
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, cx = 0, cy = 0, R = 0, dpr = 1, pts = [], rings = [];
    var ay = 0, ax = icon ? -0.12 : -0.22, vay = icon ? 0.0008 : interactive ? 0.0016 : 0.0009, vax = 0, restY = vay;
    var tiltX = 0, tiltY = 0, px = -999, py = -999, pInside = false;
    var dragging = false, lastX = 0, lastY = 0, t = 0, visible = true, running = false;
    var rz = 0, dX = 0, dY = 0; // icon: in-plane spin + drag offsets that ease back

    function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

    function build() {
      var n = icon ? Math.max(520, Math.min(1000, Math.round(Math.min(W, H) * 1.5)))
        : Math.max(90, Math.min(200, Math.round(Math.min(W, H) / 2.6)));
      var golden = Math.PI * (3 - Math.sqrt(5)), home = icon ? iconPoints(n) : null, dome = icon ? 0.42 : 1;
      pts = [];
      for (var i = 0; i < n; i++) {
        var y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i, pick = Math.random();
        var sx0 = Math.cos(th) * r * dome, sy0 = y * dome, sz0 = Math.sin(th) * r * dome;
        pts.push({ x: sx0, y: sy0, z: sz0, dx: sx0, dy: sy0, dz: sz0, // dome position
          hx: home ? home[i].x : sx0, hy: home ? home[i].y : sy0, hz: home ? home[i].z : sz0, // icon position
          accent: pick < 0.07 ? GOLD : pick < 0.14 ? TEAL : null, // ~7% gold, ~7% turquoise
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
      if (icon) dY += (Math.random() - 0.5) * 0.5; else vay += (Math.random() - 0.5) * 0.014;
    }

    if (interactive) {
      canvas.addEventListener("pointermove", function (e) {
        var rect = canvas.getBoundingClientRect();
        px = e.clientX - rect.left; py = e.clientY - rect.top; pInside = true;
        tiltY = (px / W - 0.5) * 0.5; tiltX = (py / H - 0.5) * 0.5;
        if (dragging && icon) { dY += (e.clientX - lastX) * 0.006; dX += (e.clientY - lastY) * -0.004; lastX = e.clientX; lastY = e.clientY; }
        else if (dragging) { vay = (e.clientX - lastX) * 0.00055; vax = (e.clientY - lastY) * -0.00045; lastX = e.clientX; lastY = e.clientY; }
      });
      canvas.addEventListener("pointerleave", function () { pInside = false; px = py = -999; tiltX = tiltY = 0; });
      canvas.addEventListener("pointerdown", function (e) {
        var rect = canvas.getBoundingClientRect();
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        burst(e.clientX - rect.left, e.clientY - rect.top);
        wake();
      });
      window.addEventListener("pointerup", function () { dragging = false; dY = Math.atan2(Math.sin(dY), Math.cos(dY)); }); // unwind by the short way
    }

    function draw(f) {
      f = f || 1; // frames' worth of time since last draw (60fps = 1)
      t += 0.016 * f;
      ay += vay * f; ax += vax * f;
      vay += (restY - vay) * 0.03; vax += (0 - vax) * 0.05;
      ax = Math.max(-1.1, Math.min(1.1, ax));
      if (icon && morph < 1) {
        morph = Math.min(1, morph + 0.011 * f);
        var m = ease(Math.max(0, morph));
        for (var mi = 0; mi < pts.length; mi++) {
          var mp = pts[mi];
          mp.x = mp.dx + (mp.hx - mp.dx) * m; mp.y = mp.dy + (mp.hy - mp.dy) * m; mp.z = mp.dz + (mp.hz - mp.dz) * m;
        }
      }
      var rx = ax + tiltX, ry = ay + tiltY;
      if (icon) { // faces the viewer, turns like a slow wheel, sways just enough to show its depth
        rz += 0.0016 * f;
        if (!dragging) { dY *= Math.pow(0.985, f); dX *= Math.pow(0.985, f); }
        ry = Math.sin(t * 0.3) * 0.45 + dY + tiltY;
        rx = -0.08 + Math.sin(t * 0.21) * 0.14 + dX + tiltX;
      }
      var sX = Math.sin(rx), cX = Math.cos(rx), sY = Math.sin(ry), cY = Math.cos(ry), sZ = Math.sin(rz), cZ = Math.cos(rz);
      ctx.clearRect(0, 0, W, H);

      var proj = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var x0 = p.x * cZ - p.y * sZ, y0 = p.x * sZ + p.y * cZ;
        var x1 = x0 * cY - p.z * sY, z1 = x0 * sY + p.z * cY;
        var y1 = y0 * cX - z1 * sX, z2 = y0 * sX + z1 * cX;
        var sc = FOCAL / (FOCAL - z2);
        p.sx = cx + x1 * R * sc; p.sy = cy + y1 * R * sc;
        p.ovx += -0.05 * p.ox; p.ovx *= 0.86; p.ox += p.ovx;
        p.ovy += -0.05 * p.oy; p.ovy *= 0.86; p.oy += p.ovy;
        proj.push({ sx: p.sx + p.ox, sy: p.sy + p.oy, depth: (z2 + 1) / 2, sc: sc, p: p });
      }

      if (pInside) {
        var reach = Math.min(R * 0.9, 240); // big zoomed-in shapes: keep the web local to the cursor
        for (var j = 0; j < proj.length; j++) {
          var q = proj[j], dx = q.sx - px, dy = q.sy - py, d = Math.sqrt(dx * dx + dy * dy);
          if (d < reach) {
            ctx.strokeStyle = "rgba(" + (q.p.accent || BASE) + "," + ((1 - d / reach) * 0.45 * (0.4 + q.depth)).toFixed(3) + ")";
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
        ctx.fillStyle = "rgba(" + (s.p.accent || BASE) + "," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(s.sx, s.sy, rad, 0, 6.283); ctx.fill();
      }

      for (var ri = rings.length - 1; ri >= 0; ri--) {
        var rg = rings[ri];
        rg.r += R * 0.05; rg.a *= 0.93;
        if (rg.a < 0.03) { rings.splice(ri, 1); continue; }
        ctx.strokeStyle = "rgba(" + (rg.accent ? GOLD : BASE) + "," + rg.a.toFixed(3) + ")";
        ctx.lineWidth = rg.accent ? 1.6 : 1; ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, 6.283); ctx.stroke();
      }
    }

    var last = 0;
    function loop(now) {
      if (!visible || document.hidden || reduce) { running = false; return; }
      var f = last ? Math.min(3, Math.max(0.25, (now - last) / 16.67)) : 1; // same speed on 60/120Hz and slow frames
      last = now;
      draw(f);
      requestAnimationFrame(loop);
    }
    function wake() { if (!running && !reduce && visible && !document.hidden) { running = true; last = 0; requestAnimationFrame(loop); } }

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
