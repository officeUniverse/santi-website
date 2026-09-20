/* Local concave image gallery inspired by ol-ivier's WebGL Concave Gallery:
 * https://codepen.io/ol-ivier/pen/emdjmBQ
 * Canvas mesh rendering keeps local-file images usable without WebGL texture restrictions.
 * Images are sourced from the generated case-study registry. No external runtime. */
(function () {
  'use strict';
  var canvas = document.getElementById('santi-gallery');
  if (!canvas) return;
  var ctx = canvas.getContext('2d'), panel = document.getElementById('studio-websites');
  var projects = window.SANTI_CASE_STUDIES || [], images = [], x = 0, y = 0, zoom = 1, frame = 0, drag = null;
  var width = 0, height = 0, hitRegions = [];
  var imageProjects = new WeakMap();
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var links = panel.querySelector('.santi-gallery-links');
  projects.forEach(function (project) {
    var a = document.createElement('a'); a.href = project.href; a.textContent = project.title + ' ↗'; links.appendChild(a);
    project.images.forEach(function (asset) {
      var img = new Image(); images.push(img); imageProjects.set(img, project);
      img.onload = schedule; img.onerror = schedule; img.src = asset.src;
    });
  });
  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  function warp(px, py) {
    var nx = (px - width / 2) / Math.max(width, height), ny = (py - height / 2) / Math.max(width, height);
    var factor = reduced.matches ? 1 : .88 + .65 * (nx * nx + ny * ny);
    return [width / 2 + (px - width / 2) * factor, height / 2 + (py - height / 2) * factor];
  }
  // Affine texture mapping for each triangle in a subdivided image.
  function triangle(img, source, dest) {
    var u = source[1][0] - source[0][0], v = source[1][1] - source[0][1];
    var q = source[2][0] - source[0][0], r = source[2][1] - source[0][1], det = u * r - q * v;
    var dx = dest[1][0] - dest[0][0], dy = dest[1][1] - dest[0][1];
    var ex = dest[2][0] - dest[0][0], ey = dest[2][1] - dest[0][1];
    var a = (dx * r - ex * v) / det, b = (dy * r - ey * v) / det;
    var c = (ex * u - dx * q) / det, d = (ey * u - dy * q) / det;
    ctx.save(); ctx.beginPath(); ctx.moveTo(dest[0][0], dest[0][1]); ctx.lineTo(dest[1][0], dest[1][1]); ctx.lineTo(dest[2][0], dest[2][1]); ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, dest[0][0] - a * source[0][0] - c * source[0][1], dest[0][1] - b * source[0][0] - d * source[0][1]);
    ctx.drawImage(img, 0, 0); ctx.restore();
  }
  function tile(img, left, top, size) {
    if (!img.complete || !img.naturalWidth) return;
    var iw = img.naturalWidth, ih = img.naturalHeight, scale = Math.min(size / iw, size / ih);
    var w = iw * scale, h = ih * scale; left += (size - w) / 2; top += (size - h) / 2;
    var n = reduced.matches ? 1 : 5;
    for (var row = 0; row < n; row++) for (var col = 0; col < n; col++) {
      var s = [[col * iw / n, row * ih / n], [(col + 1) * iw / n, row * ih / n], [(col + 1) * iw / n, (row + 1) * ih / n], [col * iw / n, (row + 1) * ih / n]];
      var p = s.map(function (point) { return warp(left + point[0] * scale, top + point[1] * scale); });
      hitRegions.push({points:[p[0],p[1],p[2]],project:imageProjects.get(img)});
      hitRegions.push({points:[p[0],p[2],p[3]],project:imageProjects.get(img)});
      triangle(img, [s[0], s[1], s[2]], [p[0], p[1], p[2]]);
      triangle(img, [s[0], s[2], s[3]], [p[0], p[2], p[3]]);
    }
  }
  function render() {
    frame = 0; if (panel.hidden || document.hidden) return;
    width = canvas.clientWidth; height = canvas.clientHeight; if (!width || !height) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    hitRegions = [];
    if (!images.length) return;
    var size = (width < 600 ? 145 : 210) * zoom, step = size + 26 * zoom;
    for (var row = Math.floor((-y - step) / step); row <= Math.ceil((height - y + step) / step); row++) {
      for (var col = Math.floor((-x - step) / step); col <= Math.ceil((width - x + step) / step); col++) {
        var index = ((col * 7919 + row * 7307) % images.length + images.length) % images.length;
        tile(images[index], col * step + x, row * step + y, size);
      }
    }
  }
  // Hit-test the rendered triangles so curved edges and blank gaps stay accurate.
  function projectAt(event) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var px = (event.clientX - rect.left) * width / rect.width;
    var py = (event.clientY - rect.top) * height / rect.height;
    function side(a, b) { return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]); }
    for (var i = hitRegions.length - 1; i >= 0; i--) {
      var region = hitRegions[i], p = region.points;
      var a = side(p[0], p[1]), b = side(p[1], p[2]), c = side(p[2], p[0]);
      if (!((a < 0 || b < 0 || c < 0) && (a > 0 || b > 0 || c > 0))) return region.project;
    }
    return null;
  }
  function hover(event) {
    var project = projectAt(event);
    canvas.style.cursor = project ? 'pointer' : 'grab';
    canvas.title = project ? 'Open ' + project.title : 'Drag to explore';
  }
  canvas.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 || drag) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,project:projectAt(event)};
    canvas.setPointerCapture(event.pointerId); canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!drag) { hover(event); return; }
    if (event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    x += event.clientX - drag.x; y += event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY; canvas.style.cursor = 'grabbing'; canvas.title = ''; schedule();
  });
  canvas.addEventListener('pointerup', function (event) {
    if (!drag || event.pointerId !== drag.id) return;
    var gesture = drag; drag = null;
    var project = projectAt(event);
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) <= 6 && project && project === gesture.project) {
      window.location.assign(project.href);
    }
    hover(event);
  });
  ['pointercancel','lostpointercapture'].forEach(function (name) {
    canvas.addEventListener(name, function (event) { if (drag && drag.id === event.pointerId) { drag = null; canvas.style.cursor = 'grab'; canvas.title = ''; } });
  });
  function changeZoom(delta) { zoom = Math.max(.65, Math.min(1.65, zoom + delta * .15)); schedule(); }
  panel.querySelectorAll('[data-gallery-zoom]').forEach(function (button) { button.addEventListener('click', function () { changeZoom(Number(button.dataset.galleryZoom)); }); });
  panel.querySelector('[data-gallery-reset]').addEventListener('click', function () { x = y = 0; zoom = 1; schedule(); });
  canvas.addEventListener('keydown', function (event) {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key)) return;
    event.preventDefault(); if (event.key === '+' || event.key === '=') changeZoom(1); else if (event.key === '-') changeZoom(-1);
    else { x += event.key === 'ArrowLeft' ? 70 : event.key === 'ArrowRight' ? -70 : 0; y += event.key === 'ArrowUp' ? 70 : event.key === 'ArrowDown' ? -70 : 0; schedule(); }
  });
  new ResizeObserver(schedule).observe(canvas);
  new MutationObserver(schedule).observe(panel, {attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange', schedule); reduced.addEventListener('change', schedule); schedule();
}());
