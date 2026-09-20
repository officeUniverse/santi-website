/* Santi playground: original implementations inspired by the references in STUDIO-REFERENCES.md. */
(function () {
  'use strict';
  var studio=document.querySelector('.creative-studio');if(!studio)return;
  function one(s){return studio.querySelector(s);}function all(s){return Array.from(studio.querySelectorAll(s));}
  var feedback=one('#studio-feedback'), reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  var tabs=all('[role=tab]');
  function activate(tab){tabs.forEach(function(t){var yes=t===tab;t.setAttribute('aria-selected',String(yes));t.tabIndex=yes?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!yes;});}
  tabs.forEach(function(tab,i){tab.addEventListener('click',function(){activate(tab);});tab.addEventListener('keydown',function(e){var next={ArrowRight:(i+1)%3,ArrowLeft:(i+2)%3,Home:0,End:2}[e.key];if(next!==undefined){e.preventDefault();tabs[next].focus();activate(tabs[next]);}});});
  function download(canvas,name){var out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;var ctx=out.getContext('2d');ctx.fillStyle='#0c0d11';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,0,0);out.toBlob(function(blob){if(!blob){feedback.textContent='Could not save the artwork. Please try again.';return;}var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);feedback.textContent='Your artwork is ready to download.';},'image/png');}
  // Strokes are retained in logical canvas coordinates, so resizing does not erase them.
  function drawing(canvas,start,move,end){var active=null,keyDrawing=false,cursor={x:canvas.width/2,y:canvas.height/2};
    function point(e){var r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
    canvas.addEventListener('pointerdown',function(e){if(active!==null||e.button!==0)return;keyDrawing=false;active=e.pointerId;canvas.setPointerCapture(active);cursor=point(e);start(cursor);});
    canvas.addEventListener('pointermove',function(e){if(e.pointerId===active){cursor=point(e);move(cursor);}});
    function stop(e){if(e.pointerId===active){active=null;end();}}canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
    canvas.addEventListener('keydown',function(e){if(e.key===' '){e.preventDefault();keyDrawing=!keyDrawing;if(keyDrawing)start(cursor);else end();}else if(e.key==='Escape'){keyDrawing=false;end();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();var d=e.shiftKey?25:8;cursor={x:Math.max(0,Math.min(canvas.width,cursor.x+(e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0))),y:Math.max(0,Math.min(canvas.height,cursor.y+(e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0)))};if(keyDrawing)move(cursor);feedback.textContent='Brush at '+Math.round(cursor.x)+', '+Math.round(cursor.y)+(keyDrawing?' · Drawing':' · Press Space to draw');}});
    canvas.addEventListener('blur',function(){keyDrawing=false;end();});
  }
  var paint=one('#paint-canvas'), pc=paint.getContext('2d'), strokes=[],current=null,paintFrame=0;
  var liquid=document.createElement('canvas');liquid.width=paint.width;liquid.height=paint.height;var lc=liquid.getContext('2d',{willReadFrequently:true});
  function path(ctx,points,offset){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y+offset);for(var i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y+offset);if(points.length===1)ctx.lineTo(points[0].x+.1,points[0].y+offset);ctx.stroke();}
  function paintRender(){paintFrame=0;pc.clearRect(0,0,1100,600);lc.clearRect(0,0,1100,600);var hasGoo=false;
    strokes.forEach(function(s){if(!s.points.length)return;pc.save();pc.lineCap=pc.lineJoin='round';pc.strokeStyle=s.colour;
      if(s.brush==='goo'){hasGoo=true;lc.save();lc.filter='blur(5px)';lc.strokeStyle=s.colour;lc.lineWidth=s.size*2;lc.lineCap=lc.lineJoin='round';path(lc,s.points,0);lc.restore();}
      else if(s.brush==='ribbon'){pc.globalCompositeOperation='screen';for(var k=0;k<7;k++){pc.globalAlpha=.22;pc.lineWidth=Math.max(1,s.size/9);pc.shadowColor=s.colour;pc.shadowBlur=k===3?14:0;path(pc,s.points,(k-3)*s.size/5);}pc.shadowBlur=0;pc.globalAlpha=.8;pc.strokeStyle='#fff5e6';pc.lineWidth=1;path(pc,s.points,0);}
      else if(s.brush==='neon'){pc.lineWidth=s.size;pc.shadowColor=s.colour;pc.shadowBlur=s.size*1.5;path(pc,s.points,0);pc.shadowBlur=0;pc.lineWidth=Math.max(1,s.size/4);pc.strokeStyle='#fff6ed';path(pc,s.points,0);}
      else if(s.brush==='dots'){pc.lineWidth=s.size;pc.setLineDash([.1,s.size*1.8]);path(pc,s.points,0);}
      else if(s.brush==='rainbow'){pc.lineWidth=s.size;for(var r=0;r<s.points.length;r++){pc.strokeStyle='hsl('+(r*4%360)+',85%,65%)';path(pc,r?[s.points[r-1],s.points[r]]:[s.points[r]],0);}}
      else if(s.brush==='spray'||s.brush==='calligraphy'){
        pc.fillStyle=s.colour;var stamp=0;
        s.points.forEach(function(point,index){var prev=s.points[Math.max(0,index-1)],distance=Math.hypot(point.x-prev.x,point.y-prev.y),steps=Math.max(1,Math.ceil(distance/Math.max(2,s.size/5)));
          for(var step=1;step<=steps;step++){var x=prev.x+(point.x-prev.x)*step/steps,y=prev.y+(point.y-prev.y)*step/steps;stamp++;
            if(s.brush==='calligraphy'){pc.beginPath();pc.ellipse(x,y,s.size*.7,Math.max(1,s.size*.15),-Math.PI/4,0,Math.PI*2);pc.fill();}
            else {pc.globalAlpha=.3;for(var dot=0;dot<12;dot++){var hash=Math.sin(stamp*127.1+dot*311.7)*43758.5453,unit=hash-Math.floor(hash),angle=(dot/12+unit)*Math.PI*2,radius=Math.sqrt(unit)*s.size;pc.beginPath();pc.arc(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,Math.max(.7,s.size/20),0,Math.PI*2);pc.fill();}}
          }
        });
      }
      else{pc.lineWidth=s.size;path(pc,s.points,0);}pc.restore();});
    if(hasGoo){var image=lc.getImageData(0,0,1100,600),data=image.data;for(var j=3;j<data.length;j+=4)data[j]=Math.max(0,Math.min(255,(data[j]-90)*8));lc.putImageData(image,0,0);pc.drawImage(liquid,0,0);}
    one('#paint-undo').disabled=strokes.length===0;
  }
  function schedulePaint(){if(!paintFrame)paintFrame=requestAnimationFrame(paintRender);}
  function append(s,p){if(!s||s.points.length>=800)return;var last=s.points[s.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>1)s.points.push(p);}
  drawing(paint,function(p){if(strokes.length>=60){feedback.textContent='Canvas full. Save your artwork, undo a stroke or clear to start again.';return;}current={brush:one('#paint-brush').value,colour:one('#paint-colour').value,size:+one('#paint-size').value,points:[p]};strokes.push(current);schedulePaint();},function(p){append(current,p);schedulePaint();},function(){current=null;});
  one('#paint-size').addEventListener('input',function(){one('#paint-size-label').value=this.value;});
  one('#paint-undo').addEventListener('click',function(){current=null;strokes.pop();schedulePaint();});
  one('#paint-clear').addEventListener('click',function(){current=null;strokes=[];schedulePaint();feedback.textContent='Canvas cleared. Make something new.';});
  function paintExample(){current=null;strokes=[];for(var k=0;k<3;k++){var points=[];for(var i=0;i<220;i++){var t=i/219*Math.PI*2;points.push({x:550+Math.sin(t*(k===2?2:1))*(220+k*35),y:300+Math.cos(t*3+k*.7)*(95+k*10)});}strokes.push({points:points,brush:one('#paint-brush').value,colour:['#fa814d','#9ebaef','#d5b3ed'][k],size:18+k*4});}schedulePaint();}
  one('#paint-example').addEventListener('click',paintExample);one('#paint-save').addEventListener('click',function(){paintRender();download(paint,'santi-my-artwork.png');});paintExample();
})();
