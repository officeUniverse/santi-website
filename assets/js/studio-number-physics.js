/* Click-to-launch circle playground. Fixed substeps, bounded projectiles, no dependencies. */
(function () {
  'use strict';
  var art = document.querySelector('.santi-number-art');
  if (!art) return;
  var root = art.closest('.santi-numbers'), panel = art.closest('[role="tabpanel"]');
  var status = root.querySelector('[role="status"]');
  var bodies = [], layer = null, frame = 0, last = 0, shots = 0, knocked = 0, total = 0, idle = 0;
  var aim = {x:.5,y:.35};
  function clear() {
    cancelAnimationFrame(frame); frame = 0; last = 0; bodies = []; shots = knocked = total = idle = 0;
    if (layer) layer.remove(); layer = null;
    art.querySelectorAll('.santi-digit').forEach(function (digit) { digit.style.visibility = ''; });
  }
  function setup() {
    if (layer) return;
    var rect = art.getBoundingClientRect();
    var cells = Array.from(art.querySelectorAll('.santi-number-cell'));
    layer = document.createElement('div'); layer.className = 'number-physics-layer'; layer.setAttribute('aria-hidden','true');
    cells.forEach(function (cell) {
      var box = cell.getBoundingClientRect(), node = cell.cloneNode(true);
      var r = Math.min(box.width, box.height) / 2;
      node.style.cssText = cell.style.cssText;
      node.style.width = node.style.height = (2*r) + 'px';
      node.classList.add('number-physics-body'); layer.appendChild(node);
      bodies.push({node:node,x:box.left-rect.left+r,y:box.top-rect.top+r,r:r,vx:0,vy:0,active:false,shot:false});
    });
    total = bodies.length; art.appendChild(layer);
    art.querySelectorAll('.santi-digit').forEach(function (digit) { digit.style.visibility = 'hidden'; });
    paint();
  }
  function wake(body) { if (!body.active) { body.active = true; if (!body.shot) knocked++; } }
  function paint() { bodies.forEach(function (b) { b.node.style.transform = 'translate('+(b.x-b.r)+'px,'+(b.y-b.r)+'px)'; }); }
  function shoot() {
    if (art.hidden || panel.hidden) return;
    setup();
    var projectiles = bodies.filter(function (b) { return b.shot; });
    if (projectiles.length >= 6) { var old = projectiles[0]; old.node.remove(); bodies.splice(bodies.indexOf(old),1); }
    var node = document.createElement('span'); node.className = 'number-projectile'; layer.appendChild(node);
    var x = art.clientWidth / 2, y = art.clientHeight - 16;
    var dx = aim.x * art.clientWidth - x, dy = Math.min(-35,aim.y * art.clientHeight - y), length = Math.hypot(dx,dy);
    bodies.push({node:node,x:x,y:y,r:8,vx:dx/length*820,vy:dy/length*820,active:true,shot:true});
    shots++; idle = 0; last = 0; if (!frame) frame = requestAnimationFrame(tick);
    status.textContent = 'Shots: '+shots+' · Circles knocked down: '+knocked+'/'+total;
  }
  function step(dt) {
    var w = art.clientWidth, h = art.clientHeight;
    bodies.forEach(function (b) {
      if (!b.active) return;
      b.vy += 760*dt; b.x += b.vx*dt; b.y += b.vy*dt;
      if (b.x < b.r || b.x > w-b.r) { b.x = Math.max(b.r,Math.min(w-b.r,b.x)); b.vx *= -.65; }
      if (b.y < b.r) { b.y=b.r; b.vy=Math.abs(b.vy)*.6; }
      if (b.y > h-b.r) { b.y=h-b.r; b.vy = Math.abs(b.vy)<35 ? 0 : -Math.abs(b.vy)*.45; b.vx *= .96; }
    });
    for (var i=0;i<bodies.length;i++) for (var j=i+1;j<bodies.length;j++) {
      var a=bodies[i],b=bodies[j]; if (!a.active && !b.active) continue;
      var dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r=a.r+b.r;
      if (d>=r) continue;
      var nx=d>0?dx/d:1,ny=d>0?dy/d:0;
      var speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if (speed < -8) { wake(a); wake(b); }
      var ia=a.active?1:0,ib=b.active?1:0,sum=ia+ib; if (!sum) continue;
      var push=(r-d+.01)/sum;
      a.x-=nx*push*ia;a.y-=ny*push*ia;b.x+=nx*push*ib;b.y+=ny*push*ib;
      if (speed<0) { var impulse=-(1.55)*speed/sum; a.vx-=impulse*nx*ia;a.vy-=impulse*ny*ia;b.vx+=impulse*nx*ib;b.vy+=impulse*ny*ib; }
    }
  }
  function tick(time) {
    frame=0;
    if (document.hidden || panel.hidden) { last=0; return; }
    var dt=last?Math.min((time-last)/1000,.032):1/60;last=time;
    for(var n=0;n<4;n++) step(dt/4);
    paint(); idle+=dt;
    status.textContent='Shots: '+shots+' · Circles knocked down: '+knocked+'/'+total+(knocked===total?' · Nice shot! Rebuild to play again.':'');
    if(idle<12) frame=requestAnimationFrame(tick);
  }
  function setAim(e) { var r=art.getBoundingClientRect();aim.x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));aim.y=Math.max(0,Math.min(.85,(e.clientY-r.top)/r.height)); }
  art.addEventListener('click',function(e){setAim(e);shoot();});
  art.addEventListener('keydown',function(e){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(e.key))return;
    e.preventDefault();if(e.key===' '||e.key==='Enter'){shoot();return;}
    aim.x=Math.max(.05,Math.min(.95,aim.x+(e.key==='ArrowLeft'?-.08:e.key==='ArrowRight'?.08:0)));
    aim.y=Math.max(.05,Math.min(.8,aim.y+(e.key==='ArrowUp'?-.08:e.key==='ArrowDown'?.08:0)));
    status.textContent='Aim: '+Math.round(aim.x*100)+'% across, '+Math.round(aim.y*100)+'% down. Press Space to shoot.';
  });
  root.addEventListener('number-rebuild',clear);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&layer&&!panel.hidden&&!frame&&idle<12)frame=requestAnimationFrame(tick);});
  new MutationObserver(function(){if(!panel.hidden&&layer&&!frame&&idle<12)frame=requestAnimationFrame(tick);}).observe(panel,{attributes:true,attributeFilter:['hidden']});
  var previousWidth=0;
  new ResizeObserver(function(){var w=art.clientWidth;if(previousWidth&&w&&w!==previousWidth){clear();status.textContent='Layout resized. Click a circle to shoot again.';}if(w)previousWidth=w;}).observe(art);
}());
