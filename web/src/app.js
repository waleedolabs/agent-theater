(()=>{
const TOKEN='__PAGE_TOKEN__';
const OFFLINE=TOKEN.startsWith('__');
const EMBED=(()=>{try{return window.self!==window.top}catch(e){return true}})();
const $=id=>document.getElementById(id);
const stage=$('stage'), plan=$('plan');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const base=p=>String(p||'').split(/[\\/]/).pop();
const clip=(s,n)=>{s=String(s??'');return s.length>n?s.slice(0,n)+'…':s};
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

/* ---------- language ---------- */
const qs=new URLSearchParams(location.search);
let LANG=qs.get('lang')||store.get('at.lang')||((navigator.language||'').toLowerCase().startsWith('ar')?'ar':'en');
if(!I18N[LANG])LANG='en';
const L=()=>I18N[LANG];
const t=(k,v)=>{let s=L()[k];if(s==null)s=I18N.en[k]??k;if(v&&typeof s==='string')s=s.replace(/\{(\w+)\}/g,(_,x)=>v[x]??'');return s};
const dirSign=()=>L().dir==='rtl'?-1:1;

/* ---------- state ---------- */
let userSpeed=1, soundOn=true, panels=[];
const band={top:0,bot:0,h:400,yc:0};
let stats={files:new Set(),add:0,del:0}, t0=0, timer=null;
const queue=[]; let busy=false, sessionOn=false, lastEv=0, aliveK=0;
let replayMode=false;
const speed=()=>userSpeed*Math.min(2.5,1+queue.length*.5);
const wait=ms=>new Promise(r=>setTimeout(r,document.hidden?0:reduce?Math.min(ms,80):ms/speed()));

/* ---------- audio: synth + generated reverb ---------- */
let vdest=null, vol=+(store.get('at.vol')||1), ac=null, master=null, wet=null, drone=null, lpf=null, nbuf=null;
function initAudio(){
  if(ac) return;
  try{
    ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createGain(); master.gain.value=.55*vol;
    const comp=ac.createDynamicsCompressor(); comp.threshold.value=-20; comp.knee.value=20; comp.ratio.value=3.5; comp.attack.value=.006; comp.release.value=.25;
    master.connect(comp); comp.connect(ac.destination);
    if(ac.createMediaStreamDestination){vdest=ac.createMediaStreamDestination();comp.connect(vdest)}
    const conv=ac.createConvolver(),len=ac.sampleRate*2.4,ir=ac.createBuffer(2,len,ac.sampleRate);
    for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}
    conv.buffer=ir; wet=ac.createGain(); wet.gain.value=.32; wet.connect(conv); conv.connect(master);
    // soft tape-style echo on the wet bus: gives every note a tail
    const dl=ac.createDelay(1),fb=ac.createGain(),df=ac.createBiquadFilter(),eo=ac.createGain();dl.delayTime.value=.37;fb.gain.value=.34;df.type='lowpass';df.frequency.value=2200;eo.gain.value=.42;
    wet.connect(dl);dl.connect(df);df.connect(fb);fb.connect(dl);df.connect(eo);eo.connect(master);
    nbuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);{const ch=nbuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1}
    lpf=ac.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=420;
    drone=ac.createGain(); drone.gain.value=0; lpf.connect(drone); drone.connect(master); drone.connect(wet);
    [55,55.3,82.4,110.3,164.8,220,329.6].forEach((f,i)=>{const o=ac.createOscillator();o.type=i%3===0?'triangle':'sine';o.frequency.value=f;o.detune.value=(Math.random()-.5)*10;const g=ac.createGain();g.gain.value=[.42,.3,.4,.25,.12,.06,.035][i];o.connect(g);g.connect(lpf);o.start()});
    const lfo=ac.createOscillator(); lfo.frequency.value=.11; const lg=ac.createGain(); lg.gain.value=160; lfo.connect(lg); lg.connect(lpf.frequency); lfo.start();
  }catch(e){ac=null}
}
/* generative score for the thinking scenes: sparse plucks from a modal scale, a slow swell every few bars */
let thinkT=null,thinkStep=0;
function pluck(f,pan){tone(f,2.4,'triangle',.032,0,null,true,pan);tone(f*2.004,1.4,'sine',.011,.01,null,true,-pan)}
function swell(f,d=4.5){if(!ac||!soundOn)return;const tt=ac.currentTime;[f,f*1.5,f*2.01].forEach((x,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=x;o.detune.value=(i-1)*5;g.gain.setValueAtTime(0,tt);g.gain.linearRampToValueAtTime(.022/(i+1),tt+d*.45);g.gain.linearRampToValueAtTime(0,tt+d);o.connect(g);out(g,true);o.start(tt);o.stop(tt+d+.1)})}
function thinkMusic(on){
  clearInterval(thinkT);thinkT=null;if(!on)return;thinkStep=0;
  const root=theme==='noir'?110:146.83,sc=theme==='noir'?[0,1,3,5,7,8,12,13]:[0,2,3,7,9,10,12,14];
  thinkT=setInterval(()=>{if(!ac||!soundOn||document.hidden)return;thinkStep++;
    if(thinkStep%10===1)swell(root*(thinkStep%20===1?1:1.335));
    if(Math.random()<.72){const k=sc[Math.floor(Math.random()*sc.length)],f=root*2*Math.pow(2,k/12);pluck(f,(Math.random()-.5)*.9)}},620);
}
function droneOn(v){if(ac&&drone)drone.gain.setTargetAtTime(soundOn?v:0,ac.currentTime,.8)}
function out(g,rev){g.connect(master);if(rev&&wet)g.connect(wet)}
function tone(f,d=.15,type='sine',v=.12,delay=0,f2=null,rev=true,pan=0){
  if(!ac||!soundOn) return;
  const tt=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain();
  o.type=type;o.frequency.setValueAtTime(f,tt);if(f2)o.frequency.exponentialRampToValueAtTime(f2,tt+d);
  g.gain.setValueAtTime(0,tt);g.gain.linearRampToValueAtTime(v,tt+.01);g.gain.exponentialRampToValueAtTime(.0001,tt+d);
  let nd=g;if(pan&&ac.createStereoPanner){const p=ac.createStereoPanner();p.pan.value=pan;g.connect(p);nd=p}o.connect(g);out(nd,rev);o.start(tt);o.stop(tt+d+.05);
}
function noise(d=.6,from=300,to=2400,v=.18,type='bandpass',delay=0){
  if(!ac||!soundOn||!nbuf) return;
  d=Math.min(d,1.9);const tt=ac.currentTime+delay;
  const s=ac.createBufferSource();s.buffer=nbuf;const f=ac.createBiquadFilter();f.type=type;f.Q.value=2.5;
  f.frequency.setValueAtTime(from,tt);f.frequency.exponentialRampToValueAtTime(to,tt+d);
  const g=ac.createGain();g.gain.setValueAtTime(0,tt);g.gain.linearRampToValueAtTime(v,tt+d*.3);g.gain.exponentialRampToValueAtTime(.0001,tt+d);
  s.connect(f);f.connect(g);out(g,true);s.start(tt,Math.random(),d+.05);
}
let lastTick=0;
const sfx={
  tick:()=>{const n=performance.now();if(n-lastTick<38)return;lastTick=n;const f=1500+Math.random()*700;tone(f,.045,'triangle',.014,0,f*.6,false,(Math.random()-.5)*.5);if(Math.random()<.25)tone(180,.06,'sine',.02,0,90,false)},
  whoosh:()=>noise(.7,250,2600,.13),
  scan:()=>tone(180,1.1,'sawtooth',.025,0,520),
  node:()=>tone(1046,.25,'sine',.06),
  chime:()=>{tone(880,.6,'sine',.07);tone(1318,.7,'sine',.05,.09)},
  dissolve:()=>noise(.8,3000,200,.12,'highpass'),
  bell:()=>{tone(660,1.6,'sine',.13);tone(990,1.4,'sine',.07,.02);tone(660,1.6,'sine',.11,.5);tone(990,1.4,'sine',.06,.52)},
  alarm:()=>{for(let i=0;i<3;i++)tone(320,.22,'sawtooth',.06,i*.32,220)},
  pass:()=>tone(1568,.12,'triangle',.05),
  boot:()=>{noise(1.8,80,5000,.1,'lowpass');tone(55,2.4,'sine',.22,0,110);tone(110,1.6,'triangle',.08,1.1,55);[392,523,784].forEach((f,i)=>tone(f,2.2,'sine',.05,1.2+i*.05))},
  impact:()=>{tone(95,1.5,'sine',.3,0,32);tone(48,2,'sine',.2,.02);noise(.6,2400,160,.14,'lowpass')},
  win:()=>{[523.25,659.25,783.99,1046.5,1318.5,1568].forEach((f,i)=>{tone(f,1.8,'triangle',.06,i*.11,null,true,(i%2?.35:-.35));tone(f*2,1.2,'sine',.015,i*.11+.02)});noise(1.8,400,7000,.05);tone(65.4,2.6,'sine',.16,.4);tone(130.8,2.2,'sine',.06,.45)}
};

/* ---------- canvas engine: floor, particles, AI core, beams, shards ---------- */
const cv=$('bg'),cx=cv.getContext('2d');
const THEMES={neon:{cyan:[111,227,255],alt:[111,227,255],violet:[176,140,255],amber:[255,181,71],red:[255,84,104],green:[93,255,176]},
  noir:{cyan:[205,198,232],alt:[255,84,98],violet:[150,104,255],amber:[255,170,60],red:[255,58,78],green:[120,255,190]}};
let theme=qs.get('theme')||store.get('at.theme')||'neon';if(!THEMES[theme])theme='neon';
const TINTS=Object.assign({},THEMES[theme]);
let W=0,H=0,parts=[],bursts=[],comets=[],shards=[],shocks=[],absorbs=[];
let tint=TINTS.cyan.slice(),tgt=TINTS.cyan,gt=0,fr=0;
let Q=2,qMode='auto',lastTs=0,govN=0,govSum=0,govBad=0;
const core={bx:0,by:0,x:0,y:0,R:100,e:.3,te:.3,kick:0,a:0,boot:1,beam:null};

const MOOD={violet:340,cyan:420,amber:260,red:150,green:720};
function resize(){
  const d=Math.min(devicePixelRatio||1,Q===2?2:1);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0);
  core.bx=innerWidth/2;core.by=band&&band.yc||innerHeight*.46;core.x=core.bx;core.y=core.by;core.R=Math.max(70,Math.min(innerWidth,innerHeight)*.3);
}
addEventListener('resize',()=>{resize();metrics();camTo({},0)});
for(let i=0;i<110;i++)parts.push({x:Math.random(),y:Math.random(),z:Math.random()*.8+.2,s:Math.random()*.0006+.0002});
const setTint=n=>{tgt=TINTS[n];if(ac&&lpf)lpf.frequency.setTargetAtTime(MOOD[n]||420,ac.currentTime,.6)};
const energy=v=>{core.te=v};
const kick=v=>{core.kick=Math.min(1.5,core.kick+v)};
function setTheme(x){theme=x;Object.assign(TINTS,THEMES[x]);document.body.dataset.theme=x;store.set('at.theme',x);
  tgt=TINTS.cyan;if(!sessionOn&&!mind.on)tint=tgt.slice();document.documentElement.style.setProperty('--t',tint.map(Math.round).join(' '));glowKey='';
  if(ac&&lpf)lpf.frequency.setTargetAtTime(x==='noir'?300:420,ac.currentTime,.6);const b=$('bTheme');if(b)b.textContent=t('cTheme',{m:t(x==='noir'?'thNoir':'thNeon')})}
function setQ(q){Q=q;document.body.dataset.q=q;resize()}
const fxOk=()=>Q>0&&!document.hidden&&!reduce;
function burst(n=180,x,y,spd=8){
  if(x==null){x=core.x;y=core.y}
  n=Math.round(n*(Q===2?1:Q===1?.5:.2));
  for(let i=0;i<n&&bursts.length<360;i++){const a=Math.random()*Math.PI*2,v=1.2+Math.random()*spd;bursts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,l:1})}
}
function shock(x,y,max=160,w=2){if(!fxOk())return;shocks.push({x:x??core.x,y:y??core.y,r:4,max,w,l:1})}
function sparks(el,n=6){if(!el||!fxOk())return;const r=el.getBoundingClientRect();if(r.width)burst(n,r.left+Math.min(r.width,160)*Math.random(),r.top+r.height/2,4)}
function beamTo(el,ms=1200){if(!el||!fxOk())return;const r=el.getBoundingClientRect();core.beam={x:r.left+Math.min(r.width*.3,140),y:r.top+r.height/2,until:performance.now()+ms}}
function comet(fromEl){
  if(!fxOk())return;
  const o=(fromEl||document.querySelector('.orb')).getBoundingClientRect();
  comets.push({x0:o.left+o.width/2,y0:o.top+o.height/2,x1:core.x,y1:core.y,t:0,tr:[]});
}
function absorb(el,n=14){
  if(!el||!fxOk())return;const r=el.getBoundingClientRect();
  for(let i=0;i<n;i++)absorbs.push({x:r.left+Math.random()*r.width,y:r.top+30+Math.random()*(r.height-30),t:-Math.random()*.5});
}
function shatter(lineEls){
  if(!fxOk())return;
  for(const l of lineEls){const r=l.getBoundingClientRect(),txt=l.textContent.replace(/\s+/g,''),sc=r.width/(l.offsetWidth||r.width);if(!r.width||!txt)continue;
    const n=Math.min(26,txt.length);for(let i=0;i<n&&shards.length<320;i++){const ch=txt[Math.floor(i*txt.length/n)];
      shards.push({ch,sz:13*sc,x:r.left+56*sc+i*(Math.min(r.width-70*sc,txt.length*7.8*sc)/n),y:r.top+r.height/2,vx:(2+Math.random()*5)*sc,vy:(-3+Math.random()*3.5)*sc,rot:0,vr:(Math.random()-.5)*.3,l:1})}}
}
let glowSprite=null,glowKey='';
function glowFor(r,g,b){
  const key=(r>>3)+','+(g>>3)+','+(b>>3);if(key===glowKey&&glowSprite)return glowSprite;
  const c=glowSprite||document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.clearRect(0,0,256,256);
  const gr=x.createRadialGradient(128,128,0,128,128,128);gr.addColorStop(0,`rgba(255,255,255,.9)`);gr.addColorStop(.08,`rgba(${r},${g},${b},.75)`);gr.addColorStop(.35,`rgba(${r},${g},${b},.18)`);gr.addColorStop(1,`rgba(${r},${g},${b},0)`);
  x.fillStyle=gr;x.fillRect(0,0,256,256);glowSprite=c;glowKey=key;return c;
}
function drawCore(r,g,b,ts){
  core.e+=(core.te-core.e)*.04;core.kick*=.93;core.boot+=(1-core.boot)*.035;
  const E=core.e+core.kick*.6, R=core.R*(.55+.45*core.boot)*(.78+.22*Math.min(1.6,cam.zoom)), x=core.x, y=core.y;
  core.a+=(.004+E*.012)*(reduce?0:1)*speed();
  if(Q>0){const s=glowFor(r,g,b),sz=R*(1.5+E*.9);cx.globalAlpha=Math.min(1,.35+E*.45)*core.boot;cx.drawImage(s,x-sz,y-sz,sz*2,sz*2);cx.globalAlpha=1}
  cx.lineWidth=1.2;
  const rings=Q===2?4:Q===1?3:1;
  for(let i=0;i<rings;i++){
    const k=[1,.78,1.18,.6][i],tilt=[.32,.5,.22,.7][i],rot=core.a*[1,-1.6,.7,2.2][i]+i;
    cx.strokeStyle=`rgba(${r},${g},${b},${(.18+E*.32)*core.boot})`;
    cx.setLineDash(i%2?[2,9]:[R*.9,R*.5]);cx.lineDashOffset=-core.a*60*(i+1);
    cx.beginPath();cx.ellipse(x,y,R*k,R*k*tilt,rot*.2+i*.6,0,Math.PI*2);cx.stroke();
  }
  cx.setLineDash([]);
  // hexagon frame
  if(Q===2){cx.strokeStyle=`rgba(${r},${g},${b},${.12+E*.15})`;cx.beginPath();for(let i=0;i<=6;i++){const a=i/6*Math.PI*2+core.a*.5,rr=R*.42;i?cx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.9):cx.moveTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.9)}cx.stroke()}
  const cr=R*(.07+.03*Math.sin(ts/300)*E+core.kick*.05);
  cx.fillStyle=`rgba(255,255,255,${.75*core.boot})`;cx.beginPath();cx.arc(x,y,Math.max(1,cr*.55),0,6.3);cx.fill();
  cx.strokeStyle=`rgba(${r},${g},${b},${.8*core.boot})`;cx.lineWidth=2;cx.beginPath();cx.arc(x,y,cr*1.6,0,6.3);cx.stroke();
  // beam to the line being written
  const bm=core.beam;
  if(bm&&ts<bm.until){
    const mx=(x+bm.x)/2,my=Math.min(y,bm.y)-60;
    cx.strokeStyle=`rgba(${r},${g},${b},.45)`;cx.lineWidth=1.5;cx.beginPath();cx.moveTo(x,y);cx.quadraticCurveTo(mx,my,bm.x,bm.y);cx.stroke();
    cx.fillStyle=`rgba(255,255,255,.9)`;
    for(let k=0;k<3;k++){const p=((ts/600)+k/3)%1,q=1-p,px=q*q*x+2*q*p*mx+p*p*bm.x,py=q*q*y+2*q*p*my+p*p*bm.y;cx.beginPath();cx.arc(px,py,2.2,0,6.3);cx.fill()}
  }
}
/* ---------- the mind: what waiting looks like ----------
   While the agent thinks (after a request, or in a silent gap) the core grows a slowly turning neural sphere.
   The words of the request and the files it touched orbit it, signals fire between them, and every
   signal plays a soft note. When the next real step arrives everything collapses into the core with a bang. */
const mind={on:false,lv:0,kind:'',words:[],fires:[],t0:0,col:0,nextFire:0,font:''};
const NPTS=72, sph=[], pairs=[];
(()=>{for(let i=0;i<NPTS;i++){const y=1-2*(i+.5)/NPTS,r=Math.sqrt(1-y*y),a=i*2.39996;sph.push([Math.cos(a)*r,y,Math.sin(a)*r,0])}
  for(let i=0;i<NPTS;i++)for(let j=i+1;j<NPTS;j++){const p=sph[i],q=sph[j],d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;if(d<.16)pairs.push([i,j])}})();
const PENTA=[523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.5];
function neuron(){if(!ac||!soundOn)return;const f=PENTA[Math.floor(Math.random()*PENTA.length)]*(Math.random()<.3?.5:1);tone(f,1.4,'sine',.022);tone(f*2.005,.9,'sine',.006,.01)}
function mindStart(words,kind){
  const now=performance.now();
  if(mind.on&&mind.kind===kind){const have=new Set(mind.words.map(w=>w.w));words.filter(w=>!have.has(w)).slice(0,12-mind.words.length).forEach(w=>mind.words.push(mkWord(w,now+300*mind.words.length,mind.words.length)));return}
  mind.on=true;mind.kind=kind;mind.t0=now;mind.col=0;mind.fires=[];mind.nextFire=now+700;
  mind.font=getComputedStyle(document.documentElement).getPropertyValue('--f-display')||'sans-serif';
  mind.words=words.slice(0,12).map((w,i)=>mkWord(w,now+450+i*320,i));
  droneOn(.1);thinkMusic(true);$('idle').style.opacity=0;$('idle').classList.add('off');
  if(kind==='gap'){mind.zoom=cam.want;world.classList.add('dim');camTo({zoom:Math.max(.5,cam.zoom*.72)},5)}
}
function mkWord(w,born,i){const ring=1.45+(i%3)*.28;return{w,born,a:i*2.39996+Math.random()*.3,ring,sp:(.0011+Math.random()*.0011)*(i%2?-1:1),tl:(Math.random()-.5)*.55,lit:0,ph:Math.random()}}
function mindStop(bang){
  if(!mind.on)return Promise.resolve();
  const kind=mind.kind;mind.on=false;thinkMusic(false);world.classList.remove('dim');tgt=TINTS.cyan;droneOn(.06);
  if(kind==='gap'&&mind.zoom)camTo({zoom:mind.zoom},.7);
  if(!bang||!fxOk()){mind.words=[];return Promise.resolve()}
  mind.col=performance.now();const ms=kind==='plan'?900:520;
  return new Promise(r=>setTimeout(()=>{mind.words=[];mind.col=0;flash();burst(kind==='plan'?160:70);shock(core.x,core.y,core.R*2.2,3);shock(core.x,core.y,core.R*1.2,2);kick(1.2);sfx.impact();r()},ms));
}
function mindDraw(r,g,b,ts,front){
  const target=mind.on?1:0;mind.lv+=(target-mind.lv)*(mind.on?.025:.06);
  if(mind.lv<.01&&!mind.col){return}
  const R=core.R,x0=core.x,y0=core.y,lv=mind.lv,spd=reduce?0:speed();
  let C=1;if(mind.col){const k=Math.min(1,(ts-mind.col)/(mind.kind==='plan'?900:520));C=1-k*k*k}
  if(!front){
    if(mind.on)tgt=((ts/4200|0)%2)?TINTS.violet:TINTS.alt;
    if(Q===0)return;
    // neural sphere
    const rot=ts*.00011*spd+(mind.col?(ts-mind.col)*.004:0),cr=Math.cos(rot),sr=Math.sin(rot),tx=.42,ct=Math.cos(tx),st=Math.sin(tx);
    const Rs=R*(.95+.25*lv)*C*(Q===2?1:.9),P=[];
    for(const p of sph){const xx=p[0]*cr-p[2]*sr,zz=p[0]*sr+p[2]*cr,yy=p[1]*ct-zz*st,z2=p[1]*st+zz*ct;P.push([x0+xx*Rs,y0+yy*Rs*.92,z2])}
    cx.lineWidth=1;cx.strokeStyle=`rgba(${r},${g},${b},${.09*lv})`;cx.beginPath();
    const step=Q===2?1:2;for(let k=0;k<pairs.length;k+=step){const[i,j]=pairs[k];cx.moveTo(P[i][0],P[i][1]);cx.lineTo(P[j][0],P[j][1])}cx.stroke();
    cx.fillStyle=`rgba(${r},${g},${b},${.55*lv})`;cx.beginPath();
    for(let i=0;i<P.length;i++){const p=P[i],s=sph[i];s[3]*=.94;const rr=(1.1+.9*(p[2]+1)/2)+s[3]*3;cx.moveTo(p[0]+rr,p[1]);cx.arc(p[0],p[1],rr,0,6.3)}cx.fill();
    // signals travelling along the sphere
    if(mind.on&&ts>mind.nextFire){mind.nextFire=ts+(Q===2?260:520)+Math.random()*320;const pr=pairs[Math.floor(Math.random()*pairs.length)];mind.fires.push({a:pr[0],b:pr[1],t:ts,kind:'s'})}
    cx.lineWidth=2;
    for(let i=mind.fires.length-1;i>=0;i--){const f=mind.fires[i];if(f.kind!=='s')continue;const k=(ts-f.t)/420;if(k>=1){sph[f.b][3]=1;mind.fires.splice(i,1);continue}
      const A=P[f.a],B=P[f.b],px=A[0]+(B[0]-A[0])*k,py=A[1]+(B[1]-A[1])*k;
      cx.strokeStyle=`rgba(255,255,255,${.75*lv})`;cx.beginPath();cx.moveTo(A[0]+(B[0]-A[0])*Math.max(0,k-.35),A[1]+(B[1]-A[1])*Math.max(0,k-.35));cx.lineTo(px,py);cx.stroke()}
    return;
  }
  // words orbiting the core, tethered to it, with signals jumping between them
  const pos=[];
  cx.textAlign='center';cx.textBaseline='middle';
  for(const w of mind.words){
    const age=(ts-w.born)/900;if(age<0){pos.push(null);continue}
    w.a+=w.sp*spd;w.lit*=.95;
    const a=w.a,ring=R*w.ring*C*(.85+.15*Math.min(1,age)),dz=Math.sin(a);
    const x=x0+Math.cos(a)*ring,y=y0+dz*ring*.3+Math.cos(a)*w.tl*R*.5;
    const sc=.72+.38*(dz+1)/2,al=Math.min(1,age)*lv*(.35+.65*(dz+1)/2)*(mind.col?1:1);
    pos.push([x,y,al]);
    // tether + a packet flowing into the core
    cx.strokeStyle=`rgba(${r},${g},${b},${.14*al})`;cx.lineWidth=1;cx.beginPath();cx.moveTo(x,y);cx.lineTo(x0,y0);cx.stroke();
    const ph=((ts/1400)+w.ph)%1,e=ph*ph;cx.fillStyle=`rgba(255,255,255,${.8*al*(1-ph)})`;cx.beginPath();cx.arc(x+(x0-x)*e,y+(y0-y)*e,1.8,0,6.3);cx.fill();
    const sz=Math.max(13,R*.13)*sc*(1+w.lit*.3);
    cx.font=`700 ${sz}px ${mind.font}`;
    if(Q===2){cx.shadowColor=`rgba(${r},${g},${b},${.9*al})`;cx.shadowBlur=14+w.lit*24}
    cx.fillStyle=w.lit>.1?`rgba(255,255,255,${al})`:`rgba(${Math.min(255,r+90)},${Math.min(255,g+40)},255,${al})`;
    cx.fillText(w.w,x,y);
    cx.shadowBlur=0;
  }
  if(mind.on&&mind.words.length>1&&Math.random()<(Q===2?.035:.018)){const i=Math.floor(Math.random()*mind.words.length);let j=Math.floor(Math.random()*mind.words.length);if(j===i)j=(j+1)%mind.words.length;if(pos[i]&&pos[j])mind.fires.push({a:i,b:j,t:ts,kind:'w'})}
  for(let i=mind.fires.length-1;i>=0;i--){const f=mind.fires[i];if(f.kind!=='w')continue;const A=pos[f.a],B=pos[f.b];const k=(ts-f.t)/750;
    if(!A||!B||k>=1){if(k>=1&&mind.words[f.b]){mind.words[f.b].lit=1;neuron();kick(.06)}mind.fires.splice(i,1);continue}
    const mx=(A[0]+B[0])/2+(y0-(A[1]+B[1])/2)*.25,my=(A[1]+B[1])/2-(R*.45);
    cx.strokeStyle=`rgba(${r},${g},${b},${.3*lv})`;cx.lineWidth=1.2;cx.beginPath();cx.moveTo(A[0],A[1]);cx.quadraticCurveTo(mx,my,B[0],B[1]);cx.stroke();
    const q=1-k,px=q*q*A[0]+2*q*k*mx+k*k*B[0],py=q*q*A[1]+2*q*k*my+k*k*B[1];
    if(Q>0){const s=glowFor(r,g,b);cx.drawImage(s,px-18,py-18,36,36)}cx.fillStyle='#fff';cx.beginPath();cx.arc(px,py,2.6,0,6.3);cx.fill()}
}
function frame(ts){
  requestAnimationFrame(frame);
  if(document.hidden)return;
  const dt=ts-lastTs;
  if(Q<2&&dt<(Q===1?32:48))return;
  lastTs=ts;
  if(qMode==='auto'&&dt<250&&fr>120){govSum+=dt;if(++govN>=120){const avg=govSum/govN;govN=0;govSum=0;if(avg>30&&++govBad>=2&&Q>0){govBad=0;setQ(Q-1)}else if(avg<=30)govBad=0}}
  fr++;
  if((fr&1)===0){let ch=false;for(let i=0;i<3;i++){const d=tgt[i]-tint[i];if(Math.abs(d)>.5){tint[i]+=d*.1;ch=true}}
    if(ch)document.documentElement.style.setProperty('--t',tint.map(Math.round).join(' '))}
  const [r,g,b]=tint.map(Math.round);
  cx.clearRect(0,0,W,H);
  // floor grid
  const hz=H*.66;gt=(gt+(reduce?0:.004*speed()))%1;
  cx.strokeStyle=`rgba(${r},${g},${b},${.1*core.boot})`;cx.lineWidth=1;cx.beginPath();
  for(let i=-14;i<=14;i++){cx.moveTo(W/2+i*18,hz);cx.lineTo(W/2+i*W*.16,H)}
  for(let i=0;i<12;i++){const p=(i+gt)/12,y=hz+(H-hz)*p*p;cx.moveTo(0,y);cx.lineTo(W,y)}
  cx.stroke();
  // dust
  const pn=Math.round(parts.length*(Q===2?1:Q===1?.55:.25));
  cx.fillStyle=`rgba(${r},${g},${b},.5)`;cx.beginPath();
  for(let i=0;i<pn;i++){const p=parts[i];if(!reduce)p.y-=p.s*p.z*speed()*3;if(p.y<0){p.y=1;p.x=Math.random()}const x=p.x*W,y=p.y*H,rr=p.z*1.6;cx.moveTo(x+rr,y);cx.arc(x,y,rr,0,6.3)}
  cx.fill();
  core.x+=(core.bx-cam.x*.06-cam.ry*5-core.x)*.06;core.y+=(core.by-cam.y*.06-core.y)*.06;
  if(warp>.03&&Q>0){cx.lineWidth=1.2;for(let i=0;i<(Q===2?44:22);i++){const a=(i*2.399)%6.283,r0=Math.max(W,H)*(.12+((i*37)%10)/40*(1-warp*.5)),r1=r0+Math.max(W,H)*.25*warp;cx.strokeStyle=`rgba(${r},${g},${b},${warp*.4})`;cx.beginPath();cx.moveTo(core.x+Math.cos(a)*r0,core.y+Math.sin(a)*r0);cx.lineTo(core.x+Math.cos(a)*r1,core.y+Math.sin(a)*r1);cx.stroke()}warp*=.95}
  if(fr%24===0&&cam.want<2.5&&!busyCam){const f=Math.min(cam.want,fitFor());if(Math.abs(f-cam.zoom)/cam.zoom>.05)camTo({},.9)}
  mindDraw(r,g,b,ts,false);
  drawCore(r,g,b,ts);
  mindDraw(r,g,b,ts,true);
  // shockwaves
  for(let i=shocks.length-1;i>=0;i--){const s=shocks[i];s.r+=(s.max-s.r)*.08+1;s.l-=.022;if(s.l<=0){shocks.splice(i,1);continue}cx.strokeStyle=`rgba(${r},${g},${b},${s.l*.8})`;cx.lineWidth=s.w*s.l+.5;cx.beginPath();cx.arc(s.x,s.y,s.r,0,6.3);cx.stroke()}
  // sparks
  if(bursts.length){cx.beginPath();cx.fillStyle=`rgba(${r},${g},${b},.9)`;
    for(let i=bursts.length-1;i>=0;i--){const q=bursts[i];q.x+=q.vx;q.y+=q.vy;q.vx*=.97;q.vy*=.97;q.vy+=.04;q.l-=.015;if(q.l<=0){bursts.splice(i,1);continue}cx.moveTo(q.x+2,q.y);cx.arc(q.x,q.y,2*q.l+.4,0,6.3)}
    cx.fill()}
  // knowledge flowing into the core while reading
  if(absorbs.length){cx.fillStyle=`rgba(${r},${g},${b},.85)`;cx.beginPath();
    for(let i=absorbs.length-1;i>=0;i--){const a=absorbs[i];a.t+=.02;if(a.t<0)continue;if(a.t>=1){absorbs.splice(i,1);kick(.02);continue}
      const e=a.t*a.t,x=a.x+(core.x-a.x)*e,y=a.y+(core.y-a.y)*e;cx.moveTo(x+1.8,y);cx.arc(x,y,1.8,0,6.3)}
    cx.fill()}
  // shattered characters of deleted lines
  if(shards.length){cx.textAlign='center';cx.textBaseline='middle';
    for(let i=shards.length-1;i>=0;i--){const s=shards[i];cx.font=`600 ${s.sz}px "JetBrains Mono",monospace`;s.x+=s.vx;s.y+=s.vy;s.vy+=.12;s.vx*=.985;s.rot+=s.vr;s.l-=.016;if(s.l<=0){shards.splice(i,1);continue}
      cx.save();cx.translate(s.x,s.y);cx.rotate(s.rot);cx.fillStyle=`rgba(255,${120+Math.round(80*s.l)},${130+Math.round(60*s.l)},${s.l})`;cx.fillText(s.ch,0,0);cx.restore()}}
  // comets: request flies into the core
  for(let i=comets.length-1;i>=0;i--){const c=comets[i];c.t+=.03;if(c.t>=1){burst(30,c.x1,c.y1,5);shock(c.x1,c.y1,core.R*.9);kick(.5);comets.splice(i,1);continue}
    const e=1-Math.pow(1-c.t,3),x=c.x0+(c.x1-c.x0)*e,y=c.y0+(c.y1-c.y0)*e-Math.sin(e*Math.PI)*90;
    c.tr.push([x,y]);if(c.tr.length>16)c.tr.shift();
    for(let k=0;k<c.tr.length;k++){cx.fillStyle=`rgba(${r},${g},${b},${k/c.tr.length*.85})`;cx.beginPath();cx.arc(c.tr[k][0],c.tr[k][1],1+k*.38,0,6.3);cx.fill()}}
}
resize();requestAnimationFrame(frame);

addEventListener('pointermove',()=>{document.body.classList.add('ui');clearTimeout(uiT);uiT=setTimeout(()=>document.body.classList.remove('ui'),3200)});let uiT=0;

/* ---------- HUD ---------- */
function bump(id){const e=$(id);e.classList.add('bump');setTimeout(()=>e.classList.remove('bump'),180)}
let prevStats='';
function upd(){$('sFiles').textContent=stats.files.size;$('sAdd').textContent='+'+stats.add;$('sDel').textContent='−'+stats.del;
  const k=stats.files.size+'/'+stats.add+'/'+stats.del;if(k!==prevStats){const[pf,pa,pd]=prevStats.split('/').map(Number);if(stats.files.size!==pf)bump('sFiles');if(stats.del!==pd)bump('sDel');prevStats=k}}
const fmtT=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
function clock(){$('sTime').textContent=fmtT(Math.floor((performance.now()-t0)/1000))}
function startClock(){t0=performance.now();clearInterval(timer);timer=setInterval(clock,250)}

/* ---------- narration bar ---------- */
let thinkId=0;
async function think(text,label=t('lAgent'),speak=false){
  const my=++thinkId;$('tLabel').textContent=label;const p=$('tText');p.textContent='';
  const s=clip(text,240);
  if(s.length>120||queue.length>2){p.textContent=s;await wait(250);return}
  for(let i=0;i<s.length;i++){if(my!==thinkId)return;p.textContent=s.slice(0,i+1);await wait(16)}
  await wait(200);
}

/* ---------- plan constellation ---------- */
let nodes=[], planMode='activity', curCat=null, prevDone=new Set();
function nodeScreen(x,y){try{const m=plan.getScreenCTM(),pt=plan.createSVGPoint();pt.x=x;pt.y=y;const r=pt.matrixTransform(m);return[r.x,r.y]}catch(e){return[core.x,core.y]}}
function updProg(){const el=$('prog');if(!el)return;const tot=nodes.length,done=nodes.filter(n=>n.state==='done').length;
  if(planMode!=='tasks'||!tot){if(!el.hidden){el.hidden=true;metrics()}return}
  const pct=Math.round(done/tot*100);if(el.hidden){el.hidden=false;metrics()}el.style.setProperty('--p',pct+'%');el.querySelector('b').textContent=pct+'%';el.querySelector('span').textContent=t('progOf',{d:done,n:tot});el.classList.toggle('full',pct===100)}
function renderPlan(){
  updProg();const shown=nodes.slice(-6), n=shown.length; if(!n){plan.innerHTML='';updProg();return}
  const gap=n>1?Math.min(200,800/(n-1)):0, s0=500-dirSign()*gap*(n-1)/2;
  const xs=shown.map((_,i)=>s0+dirSign()*i*gap);
  let h='';
  for(let i=0;i<n-1;i++){const a=xs[i]+dirSign()*24,b=xs[i+1]-dirSign()*24;h+=`<path class="link${shown[i].state==='done'?' lit':''}" d="M${a} 40 L${b} 40"/>`}
  const off=nodes.length-n;
  shown.forEach((nd,i)=>{const lab=clip(nd.label,n>4?18:24).replace(/[<&>]/g,'');h+=`<g class="node ${nd.state}" ${nd.fresh?'':'style="animation:none"'}><circle class="ring" cx="${xs[i]}" cy="40" r="20"/><circle class="core" cx="${xs[i]}" cy="40" r="20"/><text class="num" x="${xs[i]}" y="41">${off+i+1}</text><path class="tick" d="M${xs[i]-8} 40 l6 6 l11 -12"/><text x="${xs[i]}" y="94" style="font-size:${n>4?17:21}px">${lab}</text></g>`;nd.fresh=false});
  plan.innerHTML=h;
  shown.forEach((nd,i)=>{const id=off+i;if(nd.state==='done'&&!prevDone.has(id)){prevDone.add(id);const[sx,sy]=nodeScreen(xs[i],40);shock(sx,sy,60,2);burst(18,sx,sy,3)}if(nd.state!=='done')prevDone.delete(id)});
}
function activity(cat){
  if(planMode!=='activity'||cat===curCat)return;
  const last=nodes[nodes.length-1]; if(last&&last.state==='active'){last.state='done';sfx.chime()}
  nodes.push({label:cat,state:'active',fresh:true}); curCat=cat; sfx.node(); renderPlan();
}
function setTasks(list){
  planMode='tasks';
  nodes=list.map(x=>({label:x.label,state:x.status==='completed'?'done':x.status==='in_progress'?'active':'pending',fresh:false}));
  renderPlan();
}
function markActiveFail(){const a=nodes.find(n=>n.state==='active');if(a){a.state='fail';renderPlan();setTimeout(()=>{if(a.state==='fail'){a.state='active';renderPlan()}},2500)}}
function finishPlan(){if(planMode==='activity')nodes.forEach(n=>{if(n.state==='active')n.state='done'});renderPlan()}

/* ---------- camera & panels: a 3D world the camera flies through ---------- */
const world=$('world'), drift=$('drift'), flashEl=$('flash');
const PERSP=1400, GAP=560;
let slot=0, warp=0, V=1, S=1, busyCam=false;
// V: how big the whole composition is on this screen (1 at 1440×860). S: panels are laid out S× larger and scaled down, so text stays sharp up close

function measureBand(){const pr=plan.getBoundingClientRect(),hd=document.querySelector('.hud').getBoundingClientRect(),tx=document.querySelector('.thought .txt').getBoundingClientRect();
  band.top=Math.max(pr.bottom,hd.bottom)+10;band.bot=(tx.top||innerHeight*.86)-26;band.h=Math.max(160,band.bot-band.top);band.yc=(band.top+band.bot)/2;
  world.style.top=band.yc+'px';stage.style.perspectiveOrigin=`50% ${band.yc}px`;core.by=band.yc}
function fitFor(){if(allVisible)return 99;const p=panels.find(e=>e._pos.k===cam.k);if(!p)return 99;const h=Math.max(120,p.offsetHeight/S),w=p.offsetWidth/S;return Math.min(band.h*.9/(h*V),innerWidth*.94/(w*V))}
function metrics(){measureBand();V=Math.max(.3,Math.min(innerWidth/1440,innerHeight/860));const d=devicePixelRatio||1;S=Math.max(1,Math.min(2.5,Math.round(V*2.2/d*2)/2));world.style.setProperty('--S',S);panels.forEach(placeT)}
function placeT(el){const q=el._pos;el.style.transform=`translate3d(${q.x}px,${q.y}px,${q.z}px) rotateY(${q.ry}deg) scale(${1/S}) translate(-50%,-50%)`}
const cam={x:0,y:0,z:0,zoom:.55,want:.55,ry:0,rx:0,k:0};
metrics();
function camTo(o,dur=1.6){
  const free=o.free;delete o.free;if('zoom' in o){cam.want=o.zoom;delete o.zoom}
  Object.assign(cam,o);cam.zoom=(free||cam.want>=2.5)?cam.want:Math.min(cam.want,fitFor());
  world.style.setProperty('--cam',dur+'s');
  const Z=cam.zoom*V;world.style.transform=`translate3d(0,0,${PERSP*(1-1/Z)}px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) translate3d(${-cam.x}px,${-cam.y}px,${-cam.z}px)`;
  applyFade();
}
function fly(p,zoom=1.45,dur=1.7,extra){
  const q=p._pos;sfx.whoosh();warp=Math.min(1,dur*.55);
  camTo({x:q.x,y:q.y,z:q.z,zoom,ry:-q.ry,rx:0,...(extra||{})},dur);
  fade(q.k);
}
function overview(p,dur=2.1){
  const q=p._pos;camTo({x:q.x*.4,y:q.y*.4,z:q.z+GAP*1.1,zoom:.62,ry:-q.ry*.6,rx:5},dur);fade(q.k);
}
let allVisible=false;
function fade(k){cam.k=k;applyFade()}
// panels between the camera and its subject would fill the screen while we fly past: hide them when zoomed in
function applyFade(){panels.forEach(el=>{
  if(allVisible){el.style.opacity=.92;el.style.visibility='visible';return}
  const d=el._pos.k-cam.k;let o=d===0?1:d>0?Math.max(0,.85-d*.3):(cam.zoom>1.1?0:Math.max(0,.8+d*.3));
  if(Math.abs(d)>3)o=0;el.style.opacity=o;el.style.visibility=o<.02?'hidden':'visible'})}
function punch(v=.06){const z=cam.zoom,w=cam.want;camTo({zoom:z*(1+v),free:true},.1);setTimeout(()=>{camTo({zoom:w},.35)},130)}
function flash(){flashEl.classList.remove('go');void flashEl.offsetWidth;flashEl.classList.add('go')}
function layout(){}
function place(el){
  const k=slot++,side=k%2?1:-1,x=k===0?0:side*(150+(k%3)*70),y=((k%3)-1)*55,z=-k*GAP,ry=k===0?0:-side*11;
  el._pos={x,y,z,ry,k};placeT(el);
}
function addPanel(name,chip,cls='',zoom=1.45){
  $('idle').style.opacity=0;$('idle').classList.add('off');comet();
  const el=document.createElement('section');el.className='panel'+(Q?' boot':'');
  el.innerHTML='<header><span class="dot"></span><b></b><em class="chip"></em></header><div class="body"></div><div class="beam"></div><div class="sheen"></div>';
  el.querySelector('b').textContent=name;setChip(el,chip,cls);
  place(el);el.style.opacity=0;
  world.appendChild(el);panels.push(el);
  while(panels.length>9){const old=panels.shift();old.remove();for(const[k,v]of filePanels)if(v===old)filePanels.delete(k)}
  void el.offsetWidth;fly(el,zoom);kick(.35);shock(core.x,core.y,core.R*1.3,1.5);return el;
}
function setChip(p,txt,c){const e=p.querySelector('.chip');e.textContent=txt;e.className='chip '+(c||'')}
const body=p=>p.querySelector('.body');
function freshCode(p,startNum=0){const b=body(p);b.innerHTML='';const c=document.createElement('div');c.className='code';c.style.counterReset='ln '+startNum;b.appendChild(c);return c}
const lines=p=>[...p.querySelectorAll('.code .line:not(.gap)')];
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const KW=/(\/\/.*$|#.*$)|('[^']*'|"[^"]*"|`[^`]*`)|(&lt;\/?[a-zA-Z0-9-]+)|\b(import|from|export|default|async|function|const|let|var|if|else|for|while|return|await|throw|new|class|def|self|null|true|false|None|True|False|try|catch|except)\b/g;
const hl=s=>esc(s).replace(KW,(m,c,st,tg,kw)=>c?`<i class="c">${c}</i>`:st?`<i class="s">${st}</i>`:tg?`<i class="t">${tg}</i>`:kw?`<i class="k">${kw}</i>`:m);
function mkLine(text,cls=''){const d=document.createElement('div');d.className='line '+cls;d.innerHTML='<span class="tx"></span>';if(text!=null)d.querySelector('.tx').innerHTML=hl(clip(text,220));return d}
function gapLine(n){const d=document.createElement('div');d.className='line gap';d.textContent=t('gapLines',{n});return d}
function scrollTo(p,ln){const b=body(p);b.scrollTop=Math.max(0,ln.offsetTop-b.clientHeight*.45)}
/* chase camera: while code is typed the camera rides along with the cursor (down the file and across the line),
   the page glides upward under it, and every time the text has to scroll the code snaps with a small jolt */
function smoothScroll(b,target,ms){cancelAnimationFrame(b._sr);const from=b.scrollTop,d=target-from;if(Math.abs(d)<2){return}
  const t0=performance.now(),f=now=>{const k=Math.min(1,(now-t0)/ms),e=1-Math.pow(1-k,3);b.scrollTop=from+d*e;if(k<1)b._sr=requestAnimationFrame(f)};b._sr=requestAnimationFrame(f)}
function jolt(p){const c=p.querySelector('.code');if(!c||!fxOk())return;c.classList.remove('jolt');void c.offsetWidth;c.classList.add('jolt')}
function chase(p,ln,dur=.6,fast=false){
  const q=p._pos,b=body(p),tx=ln.querySelector('.tx');
  const need=Math.max(0,ln.offsetTop-b.clientHeight*.45),delta=need-b.scrollTop;
  if(delta>ln.offsetHeight*.8){smoothScroll(b,need,fast?160:320);jolt(p);kick(fast?.05:.1);if(fast)warp=Math.max(warp,.35)}
  const dy=lineDy(p,ln),right=(tx.offsetLeft+tx.offsetWidth)/S-p.offsetWidth/S/2;
  const dx=Math.max(-200,Math.min(200,right*.5));
  camTo({x:q.x+dx*.5,y:q.y+Math.max(-55,Math.min(55,dy*.35)),zoom:p._zt||cam.want,rx:fast?4:1.5},dur);
}
// vertical offset (in the panel's own pixels) of a line from the panel centre, for macro shots
function lineDy(p,ln){const b=body(p);return (b.offsetTop+ln.offsetTop-b.scrollTop+ln.offsetHeight/2-p.offsetHeight/2)/S}
async function typeLine(p,ln,text){
  text=clip(text,220);ln.classList.add('typing');const tx=ln.querySelector('.tx');chase(p,ln,Math.min(1.1,.35+text.length*.012));beamTo(ln,900+text.length*16);sparks(ln,4);
  const step=Q===2?1:2;
  for(let i=0;i<text.length;i+=step){const c=text.slice(i,i+step);tx.textContent+=c;if(c.trim())sfx.tick();if(i&&i%12===0&&text.length>26)chase(p,ln,.5);await wait(c===' '?7:14)}
  ln.classList.remove('typing');tx.innerHTML=hl(text);stats.add++;upd();kick(.05);await wait(40);
}
async function showLines(p,arr,start=0,stagger=40){const c=freshCode(p,start);for(const x of arr){c.appendChild(mkLine(x,'fadein'));if(stagger)await wait(stagger)}return c}
async function scan(p,ms=1300){p.classList.add('scanning');sfx.scan();absorb(p,16);await wait(ms);p.classList.remove('scanning')}
const filePanels=new Map();
function panelFor(path,chip,cls){let p=filePanels.get(path);if(p&&panels.includes(p)){fly(p,1.45);setChip(p,chip,cls);return p}p=addPanel(base(path),chip,cls);filePanels.set(path,p);return p}

/* ---------- tool scenes ---------- */
async function doRead(e){
  const fp=e.tool_input.file_path;const p=panelFor(fp,t('chRead'));
  activity(t('aExplore'));energy(.5);think(t('nRead',{f:base(fp)}));
  const ls=(e._before??'').split('\n');const off=Math.max(0,(e.tool_input.offset||1)-1);
  await showLines(p,ls.slice(off,off+40),off,ls.length>20?20:40);camTo({zoom:1.85},2.2);await scan(p);camTo({zoom:1.45},.9);
}
const termPanels=new Map();
async function doSearch(e){
  const ti=e.tool_input,pat=ti.pattern||ti.query||'';
  activity(t('aExplore'));energy(.5);think(e.tool_name==='Glob'?t('nGlob',{p:pat}):t('nGrep',{p:clip(pat,50)}));
  const p=addPanel(e.tool_name==='Glob'?t('pGlob'):t('pSearch'),t('chSearch'),'',1.7);
  const tm=document.createElement('div');tm.className='term';tm.innerHTML='<div class="cmd"></div>';tm.firstChild.textContent='⌕ '+pat+(ti.path?'  in '+ti.path:'');body(p).appendChild(tm);
  if(e.tool_use_id)termPanels.set(e.tool_use_id,{p,t:tm,test:false,search:true});await scan(p,1000);
}
async function doWrite(e){
  const fp=e.tool_input.file_path,content=String(e.tool_input.content??'');
  const existed=e._before!=null;const p=panelFor(fp,existed?t('chRewrite'):t('chNew'),existed?'edit':'new');
  stats.files.add(fp);upd();activity(t('aBuild'));energy(.85);think(existed?t('nWriteRe',{f:base(fp)}):t('nWriteNew',{f:base(fp)}));
  const c=freshCode(p);const ls=content.split('\n');const typed=queue.length>2?6:28;
  const nT=Math.max(6,Math.min(ls.length,typed));camTo({zoom:1.7},1);
  for(let i=0;i<ls.length;i++){
    if(i>=260){stats.add+=ls.length-i;if(i===260)c.appendChild(gapLine(ls.length-260));break}
    const ln=mkLine(null,i<typed+40?'fadein':'');c.appendChild(ln);
    p._zt=Math.min(2.25,1.7+.55*(i/nT));
    if(i<typed)await typeLine(p,ln,ls[i]);else{ln.querySelector('.tx').innerHTML=hl(clip(ls[i],220));stats.add++;if(i%4===0){chase(p,ln,.3,true);beamTo(ln,300);await wait(16)}}
  }
  p._zt=0;upd();energy(.6);flash();await wait(500);overview(p);
}
async function applyEdit(p,before,oldS,newS){
  const idx=oldS?before.indexOf(oldS):-1;const all=before.split('\n');
  const startLine=idx>=0?before.slice(0,idx).split('\n').length-1:all.length;
  const oldCount=idx>=0?oldS.split('\n').length:0;
  const from=Math.max(0,startLine-8),to=Math.min(all.length,startLine+oldCount+8);
  const c=freshCode(p,from);
  if(from>0)c.appendChild(gapLine(from));
  for(const x of all.slice(from,to))c.appendChild(mkLine(x,'fadein'));
  if(to<all.length)c.appendChild(gapLine(all.length-to));
  await wait(450);
  const Ls=lines(p),rel=startLine-from;
  const dels=Ls.slice(rel,rel+oldCount);
  if(dels.length){scrollTo(p,dels[0]);dels.forEach(l=>l.classList.add('del'));sfx.dissolve();const q=p._pos;camTo({y:q.y+lineDy(p,dels[0]),zoom:2.7},.8);await wait(900);shatter(dels);dels.forEach(l=>l.classList.add('dissolve'));await wait(700);dels.forEach(l=>l.remove());stats.del+=dels.length;upd();camTo({y:q.y,zoom:2.0},1.1)}
  const ref=lines(p)[rel]||c.querySelector('.gap:last-child')||null;
  const nl=String(newS??'').split('\n');const typed=queue.length>2?4:16;
  for(let i=0;i<nl.length;i++){const ln=mkLine(null,'add fadein');c.insertBefore(ln,ref);
    if(i<typed)await typeLine(p,ln,nl[i]);else{ln.querySelector('.tx').innerHTML=hl(clip(nl[i],220));stats.add++}}
  upd();
  return idx>=0?before.slice(0,idx)+newS+before.slice(idx+oldS.length):before;
}
async function doEdit(e){
  const ti=e.tool_input,fp=ti.file_path;const p=panelFor(fp,t('chEdit'),'edit');
  stats.files.add(fp);upd();activity(t('aBuild'));energy(.85);think(t('nEdit',{f:base(fp)}));
  let before=e._before??'';
  const edits=Array.isArray(ti.edits)?ti.edits:[{old_string:ti.old_string,new_string:ti.new_string}];
  camTo({zoom:1.9},1.2);
  for(const ed of edits.slice(0,6))before=await applyEdit(p,before,ed.old_string,ed.new_string);
  energy(.6);flash();await wait(400);overview(p);
}
const TEST_RE=/\b(test|tests|jest|vitest|pytest|mocha|spec|cargo test|go test|npm t\b|phpunit|rspec)\b/i;
async function doBash(e){
  const cmd=String(e.tool_input.command||'');const test=TEST_RE.test(cmd);
  activity(test?t('aTest'):t('aRun'));energy(.75);think(test?t('nTests'):(e.tool_input.description||t('nCmd')));
  const p=addPanel(test?t('pTests'):t('pTerminal'),test?t('chTest'):t('chRun'),'',test?1.9:1.7);
  const tm=document.createElement('div');tm.className='term';tm.innerHTML='<div class="cmd"></div><div class="spin"></div><div class="out"></div>';body(p).appendChild(tm);
  const cEl=tm.querySelector('.cmd');let s='$ ';for(const ch of clip(cmd,300)){s+=ch;cEl.textContent=s;sfx.tick();await wait(10)}
  if(e.tool_use_id)termPanels.set(e.tool_use_id,{p,t:tm,test});
}
function outText(r){
  if(r==null)return'';if(typeof r==='string')return r;
  const ps=[r.stdout,r.stderr,r.output,r.content,r.result].filter(x=>typeof x==='string'&&x.trim());
  if(ps.length)return ps.join('\n');
  if(Array.isArray(r.content))return r.content.map(c=>c&&c.text||'').join('\n');
  try{return JSON.stringify(r).slice(0,600)}catch(_){return''}
}
function glitch(){stage.classList.remove('glitch');void stage.offsetWidth;stage.classList.add('glitch')}
async function doBashDone(e,failed){
  const rec=termPanels.get(e.tool_use_id);if(!rec)return;termPanels.delete(e.tool_use_id);
  const{p,t:tm,test,search}=rec;const sp=tm.querySelector('.spin');sp&&sp.remove();
  if(search)return;
  const o_=outText(failed?(e.error??e.tool_response):e.tool_response);
  const o=tm.querySelector('.out');if(o)o.textContent=o_.split('\n').filter(Boolean).slice(-9).join('\n');
  if(test){
    const rows=o_.split('\n').map(l=>l.trim()).filter(l=>/^(PASS|FAIL|✓|✔|✗|✕|×|ok\b|not ok\b)/i.test(l));
    if(rows.length){
      const box=document.createElement('div');box.className='tests';if(o)o.hidden=true;tm.appendChild(box);let okN=0;const N=Math.min(rows.length,9);
      for(const l of rows.slice(0,9)){const good=/^(PASS|✓|✔|ok\b)/i.test(l);const d=document.createElement('div');d.className='trow'+(good?'':' bad');
        d.innerHTML='<b>'+(good?'✓':'✗')+'</b><span></span>';d.querySelector('span').textContent=clip(l.replace(/^(PASS|FAIL|✓|✔|✗|✕|×|not ok|ok)\s*[-:]?\s*/i,''),60);
        box.appendChild(d);if(good){okN++;sfx.pass();sparks(d,6);punch(.05)}else{sfx.alarm();glitch();punch(.18)}await wait(260)}
      const m=document.createElement('div');m.className='meter'+(okN===N?'':' bad');m.innerHTML='<i></i>';tm.appendChild(m);
      const sc=document.createElement('div');sc.className='score'+(okN===N?'':' bad');sc.textContent=okN+' / '+N;tm.appendChild(sc);
      await wait(60);m.firstChild.style.transform='scaleX('+(okN/Math.max(1,N))+')';await wait(900);
    }
  }
  const r=e.tool_response||{};
  const bad=failed||r.interrupted||(r.exit_code??r.exitCode??0)!==0||(test&&/(\b[1-9]\d* (failed|failing)\b|FAIL\b|✗|AssertionError|Tests?:.*failed)/i.test(o_));
  if(bad){if(o)o.classList.add('bad');setChip(p,t('chFail'),'bad');overview(p,1.4);await failure(test?t('nTestFail'):t('nCmdFail'))}
  else{setChip(p,t('chOk'),'new');if(test){sfx.chime();setTint('green');burst(110);shock(core.x,core.y,core.R*2,3);kick(1);flash();overview(p,1.8);await wait(900);setTint('cyan')}else{sfx.pass();overview(p,1.5)}}
}
async function failure(msg){setTint('red');sfx.alarm();glitch();energy(1);kick(.8);markActiveFail();await think(msg,t('lAlert'),true);await wait(1000);setTint('cyan');energy(.6)}

/* ---------- planning phase: from the moment the request is sent ---------- */
let planPh=null, reqWords=[];
function keywords(prompt){const stop=new Set(L().stopW);return [...new Set(String(prompt).replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>2&&!stop.has(w.toLowerCase())))].slice(0,9)}
function startPlanning(prompt){
  endPlanning(true);reqWords=keywords(prompt);
  activity(t('aPlan'));energy(.7);sfx.scan();$('tLabel').textContent=t('lAgent');
  camTo({x:0,y:0,z:0,zoom:.7,ry:0,rx:0},3);
  mindStart(reqWords.length?reqWords:[t('chThinking')],'plan');
  const ts0=performance.now();
  const tick=()=>{thinkId++;const sec=Math.round((performance.now()-ts0)/1000);$('tText').textContent=t('nPlanning',{s:sec})};tick();
  planPh={tmr:setInterval(tick,1000)};
}
let revealT=null;
async function revealPlan(list){
  const el=$('reveal');if(!el||list.length<2)return;
  el.innerHTML='<h3></h3><ol></ol>';el.querySelector('h3').textContent=t('planTitle');
  const ol=el.querySelector('ol');list.slice(0,8).forEach((x,i)=>{const li=document.createElement('li');li.style.animationDelay=(.5+i*.2)+'s';li.innerHTML='<b></b><span></span>';li.firstChild.textContent=i+1;li.lastChild.textContent=clip(x.label,70);ol.appendChild(li);setTimeout(()=>sfx.node(),(500+i*200)/speed())});
  el.hidden=false;el.classList.remove('out');void el.offsetWidth;el.classList.add('show');kick(.6);shock(core.x,core.y,core.R*1.6,2);sfx.chime();
  await wait(1700+Math.min(8,list.length)*260);
  el.classList.remove('show');el.classList.add('out');await wait(500);el.hidden=true;el.classList.remove('out');
}
async function endPlanning(quiet){
  if(!planPh)return;const ph=planPh;planPh=null;clearInterval(ph.tmr);
  await mindStop(!quiet);
}
function gapWords(){const w=[...reqWords];[...stats.files].slice(-4).forEach(f=>w.push(base(f)));const a=nodes.find(n=>n.state==='active');if(a)w.unshift(clip(a.label,22));return [...new Set(w)].slice(0,10)}

/* ---------- title cards & finale ---------- */
let tcTimer=null;
async function card(kicker,text,sub='',ms=2600,nums=null){
  const el=$('tcard');clearTimeout(tcTimer);el.hidden=false;el.classList.remove('show');
  $('tcK').textContent=kicker;$('tcS').textContent=sub;
  const T=$('tcT');T.textContent='';
  clip(text,90).split(/\s+/).forEach((w,i)=>{const sp=document.createElement('span');sp.textContent=w;sp.style.animationDelay=(i*.09)+'s';T.appendChild(sp)});
  const N=$('tcN');N.hidden=!nums;N.innerHTML='';
  if(nums){nums.forEach(([v,lab,fmt])=>{const d=document.createElement('div');d.innerHTML='<b>0</b><small></small>';d.lastChild.textContent=lab;N.appendChild(d);countUp(d.firstChild,v,fmt)})}
  el.style.setProperty('--d',(reduce?.4:ms/1000)+'s');void el.offsetWidth;el.classList.add('show');
  tcTimer=setTimeout(()=>{el.hidden=true},ms+200);
  await wait(ms*.55);
}
function countUp(el,v,fmt=x=>x){const s=performance.now(),d=1300;(function f(){const k=Math.min(1,(performance.now()-s)/d),e=1-Math.pow(1-k,3);el.textContent=fmt(Math.round(v*e));if(k<1)requestAnimationFrame(f)})()}
async function finale(msg){
  const secs=Math.floor((performance.now()-t0)/1000);
  finishPlan();setTint('green');energy(1);kick(1.5);sfx.impact();setTimeout(()=>sfx.win(),250);droneOn(.03);clearInterval(timer);clock();flash();
  // the camera pulls way back and shows the whole constellation of files it touched
  allVisible=true;
  if(panels.length){const last=panels[panels.length-1]._pos;camTo({x:0,y:-30,z:last.z/2,zoom:.46,ry:-16,rx:10},3.4);drift.classList.add('fast');sfx.whoosh();warp=1}
  [[.5,.42,0],[.3,.35,450],[.7,.38,800],[.42,.55,1200],[.6,.52,1500]].forEach(([fx,fy,d])=>setTimeout(()=>{const x=W*fx,y=H*fy;burst(110,x,y,7);shock(x,y,140,2)},d));
  card(t('kDone'),'','',4200,[[stats.files.size,t('fFiles')],[stats.add,t('fAdd'),x=>'+'+x],[stats.del,t('fDel'),x=>'−'+x],[secs,t('fTime'),fmtT]]);
  await think(msg,t('lDone'),true);
  await wait(3600);
  drift.classList.remove('fast');allVisible=false;setTint('cyan');energy(.3);vidEnd();
}

/* ---------- optional video capture ----------
   Click "Record video": the browser asks which tab to capture once, then recording arms itself. It starts with the
   next request (or the demo), carries the sound of the stage, and stops by itself a moment after the finale. Esc cancels. */
const vid={state:'off',rec:null,chunks:[],stream:null,full:null,mime:'',ext:'webm'};
const vidOk=()=>!EMBED&&!!(navigator.mediaDevices&&navigator.mediaDevices.getDisplayMedia&&window.MediaRecorder);
function vidLabel(){const b=$('bRec');if(!b)return;b.textContent=t(vid.state==='armed'?'recArmed':vid.state==='rec'?'recOn':'cRec');b.classList.toggle('on',vid.state!=='off')}
function vidPick(){for(const m of ['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'])if(MediaRecorder.isTypeSupported(m))return m;return ''}
async function vidArm(){
  if(vid.state!=='off'){vidCancel();return}
  if(!vidOk()){toast(t('recNo'));return}
  try{
    initAudio();if(ac&&ac.state==='suspended')ac.resume();
    const s=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:60,width:{ideal:1920},height:{ideal:1080}},audio:false,preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude'});
    const tracks=[...s.getVideoTracks()];if(vdest)tracks.push(...vdest.stream.getAudioTracks());
    vid.stream=s;vid.full=new MediaStream(tracks);vid.mime=vidPick();vid.ext=/mp4/.test(vid.mime)?'mp4':'webm';
    s.getVideoTracks()[0].addEventListener('ended',()=>{if(vid.state==='rec')vidEnd(true);else vidCancel()});
    vid.state='armed';document.body.classList.add('rec');vidLabel();
    if(sessionOn)vidBegin();
  }catch(err){vid.state='off';vidLabel();if(err&&err.name!=='NotAllowedError')toast(t('recErr'))}
}
function vidBegin(){
  if(vid.state!=='armed'||!vid.full)return;
  try{vid.chunks=[];vid.rec=new MediaRecorder(vid.full,{mimeType:vid.mime||undefined,videoBitsPerSecond:9e6,audioBitsPerSecond:192e3});
    vid.rec.ondataavailable=e=>{if(e.data&&e.data.size)vid.chunks.push(e.data)};
    vid.rec.onstop=vidSave;vid.rec.start(1000);vid.state='rec';vidLabel()}catch(err){vidCancel();toast(t('recErr'))}
}
function vidEnd(now){
  if(vid.state!=='rec')return;
  setTimeout(()=>{try{vid.rec.stop()}catch(e){vidSave()}},now?0:1600);
}
function vidRelease(){try{vid.stream&&vid.stream.getTracks().forEach(x=>x.stop())}catch(e){}vid.stream=vid.full=vid.rec=null;vid.state='off';document.body.classList.remove('rec');vidLabel()}
function vidCancel(){if(vid.state==='rec'){vidEnd(true);return}vid.chunks=[];vidRelease()}
function vidSave(){
  const blob=new Blob(vid.chunks,{type:vid.mime||'video/webm'});vid.chunks=[];vidRelease();
  if(!blob.size)return toast(t('recErr'));
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`agent-theater-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.${vid.ext}`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),20000);toast(t('recSaved'));
}
addEventListener('keydown',e=>{if(e.key==='Escape'&&vid.state!=='off')vidCancel()});

/* ---------- client-side recording (for Save show) ---------- */
let rec=null, lastTake=null;
function recEvent(e){
  if(replayMode)return;
  if(e.hook_event_name==='UserPromptSubmit')rec={v:1,app:'agent-theater',lang:LANG,title:String(e.prompt||'').slice(0,140),created:new Date().toISOString(),t0:performance.now(),events:[]};
  if(!rec)return;
  const {transcript_path,permission_mode,...clean}=e;
  rec.events.push({t:Math.round(performance.now()-rec.t0),e:clean});
  if(e.hook_event_name==='Stop'){const {t0:_,...d}=rec;d.duration=Math.round(performance.now()-rec.t0);lastTake=d;rec=null;$('bSave').hidden=EMBED}
}
function recDecision(choice){if(rec&&!replayMode)rec.events.push({t:Math.round(performance.now()-rec.t0),decision:choice})}

/* ---------- event router ---------- */
function newScene(prompt){
  vidBegin();
  panels.forEach(p=>p.remove());panels=[];slot=0;allVisible=false;filePanels.clear();termPanels.clear();drift.classList.remove('fast');camTo({x:0,y:0,z:0,zoom:.55,ry:0,rx:0},.05);
  stats={files:new Set(),add:0,del:0};prevStats='';upd();nodes=[];prevDone=new Set();planMode='activity';curCat=null;renderPlan();
  $('idle').style.opacity=1;$('idle').classList.remove('off');setTint('cyan');startClock();droneOn(.06);energy(.5);
  const r=$('req');r.innerHTML=t('reqLabel')+': <b></b>';r.querySelector('b').textContent=clip(prompt,160);r.title=prompt;
}
async function handle(e){
  const n=e.hook_event_name,tn=e.tool_name||'',ti=e.tool_input||{};
  if(n==='SessionStart'){await think(t('nSession',{p:base(e.cwd)}),t('lSession'));return}
  if(n==='UserPromptSubmit'){newScene(String(e.prompt||''));comet();sfx.whoosh();await card(t('kNew'),String(e.prompt||'')||'…');startPlanning(String(e.prompt||''));return}
  if(n==='Stop'){await endPlanning(true);await finale(e.last_assistant_message?clip(e.last_assistant_message.replace(/[#*`_>]/g,''),240):t('nDone'));return}
  if(n==='Notification'){if(e.notification_type!=='permission_prompt'&&!/permission/i.test(e.message||''))await think(e.message||t('nWaiting'),t('lAlert'),true);return}
  if(n==='PostToolUseFailure'){if(termPanels.has(e.tool_use_id))return doBashDone(e,true);return failure(t('nToolFail',{t:tn}))}
  if(n==='PostToolUse'){if(termPanels.has(e.tool_use_id))return doBashDone(e,false);return}
  if(n!=='PreToolUse')return;
  if(planPh)await endPlanning();
  if(tn==='TodoWrite'&&Array.isArray(ti.todos)){if(planMode!=='tasks')await revealPlan(ti.todos.map(x=>({label:x.content||x.activeForm||''})));setTasks(ti.todos.map(x=>({label:x.content||x.activeForm||'',status:x.status})));sfx.node();kick(.4);await think(t('nTasks'),t('lPlan'));return}
  if(tn==='TaskCreate'){const first=planMode!=='tasks';if(first){planMode='tasks';nodes=[]}nodes.push({label:ti.subject||ti.description||'·',state:'pending',fresh:true});renderPlan();sfx.node();
    if(first){clearTimeout(revealT);revealT=setTimeout(()=>{if(nodes.length>1&&planMode==='tasks')revealPlan(nodes.map(n=>({label:n.label})))},2200)}return}
  if(tn==='TaskUpdate'){const i=Number(ti.taskId)-1;if(nodes[i]&&ti.status){nodes[i].state=ti.status==='completed'?'done':ti.status==='in_progress'?'active':nodes[i].state;renderPlan();if(ti.status==='completed')sfx.chime()}return}
  if(tn==='Read')return doRead(e);
  if(tn==='Grep'||tn==='Glob'||tn==='LS')return doSearch(e);
  if(tn==='Write')return doWrite(e);
  if(tn==='Edit'||tn==='MultiEdit')return doEdit(e);
  if(tn==='Bash'||tn==='PowerShell')return doBash(e);
  if(tn==='WebSearch'||tn==='WebFetch'){activity(t('aWeb'));energy(.6);return think(tn==='WebSearch'?t('nWeb',{q:clip(ti.query,60)}):t('nFetch'))}
  if(tn==='Task'||tn==='Agent'){activity(t('aHelper'));comet();return think(t('nSub',{d:clip(ti.description||ti.prompt,80)}),t('lAgent'),true)}
  return think(t('nUses',{t:tn}));
}
async function pump(){
  if(busy)return;busy=true;
  while(queue.length){const e=queue.shift();const nm=e.hook_event_name;if(nm==='UserPromptSubmit')sessionOn=true;if(nm==='Stop')sessionOn=false;
    try{if(mind.on&&mind.kind==='gap')await mindStop(true);await handle(e)}catch(err){console.error(err)}lastEv=performance.now()}
  busy=false;
}
function push(e){recEvent(e);queue.push(e);pump()}

/* alive pulse: while Claude writes a long file ("Creating") no event arrives until it finishes */
setInterval(()=>{
  if(!sessionOn||busy||queue.length||gateId!=null||planPh||document.hidden)return;
  const idle=performance.now()-lastEv;if(idle<2500)return;
  aliveK++;thinkId++;$('tLabel').textContent=t('lAgent');$('tText').textContent=t('nAlive',{s:Math.round(idle/1000)});
  energy(.6);if(idle>3500&&!mind.on)mindStart(gapWords(),'gap');
},1000);

/* ---------- approval gate ---------- */
let gateId=null,cdT=null;
function describe(e){
  const tn=e.tool_name||'',ti=e.tool_input||{};
  if(tn==='Bash'||tn==='PowerShell')return[t('qBash'),ti.command||''];
  if(ti.file_path)return[tn==='Write'?t('qWrite'):t('qEdit'),ti.file_path];
  if(tn==='WebFetch')return[t('qFetch'),ti.url||''];
  return[t('qTool',{t:tn}),JSON.stringify(ti).slice(0,300)];
}
function openGate(id,e,waitSec){
  gateId=id;clearInterval(cdT);const g=$('gCd');g.textContent='';
  ['gYes','gNo','gTerm'].forEach(b=>{$(b).classList.remove('picked');$(b).disabled=id==='replay'});
  if(waitSec){let left=waitSec;const f=()=>{g.textContent=t('gCountdown',{n:Math.max(0,left)})};f();cdT=setInterval(()=>{left--;f();if(left<=0)clearInterval(cdT)},1000)}
  const[q,c]=describe(e);$('gQ').textContent=q;$('gCmd').textContent=c;
  drift.classList.add('hold');$('gate').hidden=false;document.body.classList.add('halt');setTint('amber');energy(1);kick(1);sfx.bell();if(id!=='replay')$('gYes').focus();
}
function closeGate(){drift.classList.remove('hold');clearInterval(cdT);$('gate').hidden=true;document.body.classList.remove('halt');setTint('cyan');energy(.6);gateId=null}
let demoDecision=null;
async function decide(choice){
  if(gateId==null)return;const id=gateId;closeGate();recDecision(choice);
  if(id==='demo'){demoDecision&&demoDecision(choice)}
  else if(id!=='replay')try{await fetch('/decision',{method:'POST',headers:{'content-type':'application/json','x-theater-token':TOKEN},body:JSON.stringify({id,choice})})}catch(e){}
  if(choice==='allow'){sfx.chime();shock();think(t('nAllowed'),t('lApproval'))}
  else if(choice==='deny'){sfx.alarm();think(t('nDenied'),t('lApproval'))}
}
$('gYes').onclick=()=>decide('allow');$('gNo').onclick=()=>decide('deny');$('gTerm').onclick=()=>decide('terminal');

/* ---------- live connection ---------- */
function connect(){
  const es=new EventSource('/events?t='+TOKEN);const c=$('conn');
  es.onopen=()=>{c.textContent=t('connected');c.className='pill on';c.dataset.k='connected'};
  es.onerror=()=>{c.textContent=t('lost');c.className='pill off';c.dataset.k='lost'};
  es.onmessage=m=>{let d;try{d=JSON.parse(m.data)}catch(_){return}
    if(d.type==='hello'){if(!d.installed)think(t('nNotInstalled'),t('lAlert'));sendPlan();return}
    if(d.type==='decided'){if(gateId===d.id){closeGate()}return}
    if(d.type==='hook'){
      if(replayMode)stopReplay();
      if(d.e.hook_event_name==='PermissionRequest'){recEvent(d.e);openGate(d.id,d.e,d.wait);return}
      push(d.e);
    }};
}
let planOn=store.get('at.plan')==='1';
function sendPlan(){if(OFFLINE)return;fetch('/plan',{method:'POST',headers:{'content-type':'application/json','x-theater-token':TOKEN},body:JSON.stringify({on:planOn})}).catch(()=>{})}
function presence(){fetch('/presence',{method:'POST',headers:{'content-type':'application/json','x-theater-token':TOKEN},body:JSON.stringify({visible:!document.hidden}),keepalive:true}).catch(()=>{})}

/* ---------- in-page demo ---------- */
let demoRunning=false;
const idleP=()=>new Promise(r=>{const f=()=>(!busy&&!queue.length)?r():setTimeout(f,80);f()});
const SL=ms=>new Promise(r=>setTimeout(r,document.hidden?0:ms/userSpeed));
const D_PKG='{\n  "name": "my-shop",\n  "type": "module",\n  "dependencies": {\n    "express": "^4.19.2"\n  }\n}\n';
const D_ROUTES="import express from 'express';\nconst router = express.Router();\n\nrouter.get('/', home);\nrouter.get('/login', oldLoginPage);\nrouter.post('/signup', signup);\n\nexport default router;\n";
const D_AUTH="import { compare } from 'bcrypt';\n\nexport async function login(email, password) {\n  if (!email.includes('@')) {\n    throw new Error('invalid email');\n  }\n  const user = await db.users.find({ email });\n  if (!user) return { ok: false };\n  const valid = await compare(password, user.hash);\n  return { ok: valid, token: valid ? sign(user.id) : null };\n}\n";
const D_HTML='<form id="login" class="auth-card">\n  <h1>Sign in</h1>\n  <input type="email" name="email" required>\n  <input type="password" name="password" required>\n  <button type="submit">Login</button>\n</form>\n<script type="module" src="auth.js"><\/script>';
async function runDemo(){
  if(demoRunning)return;stopReplay();demoRunning=true;if(!entered){enter();await SL(2700)}
  const C='./';let n=0;
  const ev=o=>push({session_id:'demo',cwd:'my-shop',...o});
  const tool=async(name,input,resp,hold=500,before)=>{const id='d'+(++n);ev({hook_event_name:'PreToolUse',tool_name:name,tool_input:input,tool_use_id:id,_before:before});await idleP();await SL(hold);ev({hook_event_name:'PostToolUse',tool_name:name,tool_input:input,tool_response:resp,tool_use_id:id});await idleP()};
  const todos=a=>({todos:t('demoTodos').map((c,i)=>({content:c,status:i<a?'completed':i===a?'in_progress':'pending'}))});
  try{
    ev({hook_event_name:'UserPromptSubmit',prompt:t('demoPrompt')});await idleP();await SL(6500);
    await tool('TodoWrite',todos(0),{},300);
    await tool('Read',{file_path:C+'package.json'},{},300,D_PKG);
    await tool('Read',{file_path:C+'routes.js'},{},300,D_ROUTES);
    await tool('TodoWrite',todos(1),{},300);
    await tool('Write',{file_path:C+'login.html',content:D_HTML},{type:'create'},300);
    await tool('TodoWrite',todos(2),{},300);
    const pr={hook_event_name:'PermissionRequest',session_id:'demo',tool_name:'Bash',tool_input:{command:'npm install bcrypt',description:t('demoInstall')}};
    recEvent(pr);openGate('demo',pr,25);
    const ch=await new Promise(res=>{demoDecision=res;setTimeout(()=>{if(gateId==='demo'){closeGate();recDecision('allow');res('allow')}},25000)});demoDecision=null;
    if(ch==='allow')await tool('Bash',{command:'npm install bcrypt',description:t('demoInstall')},{stdout:'added 3 packages in 2.1s',interrupted:false},1500);
    else await think(t('demoNoLib'),t('lAgent'));
    await tool('Write',{file_path:C+'auth.js',content:D_AUTH},{type:'create'},300);
    await tool('TodoWrite',todos(3),{},300);
    await tool('Edit',{file_path:C+'routes.js',old_string:"router.get('/login', oldLoginPage);",new_string:"router.get('/login', serve('login.html'));\nrouter.post('/api/login', handleLogin);"},{},300,D_ROUTES);
    await tool('TodoWrite',todos(4),{},300);
    await tool('Bash',{command:'npm test',description:t('demoRunTests')},{stdout:'PASS  login form renders\nPASS  rejects email without @\nFAIL  accepts uppercase email\nPASS  rejects wrong password\nPASS  returns token\n\nTests: 1 failed, 4 passed, 5 total'},1800);
    await SL(800);
    await tool('Edit',{file_path:C+'auth.js',old_string:"export async function login(email, password) {",new_string:"export async function login(email, password) {\n  email = email.trim().toLowerCase();"},{},300,D_AUTH);
    await tool('Bash',{command:'npm test',description:t('demoRerun')},{stdout:'PASS  login form renders\nPASS  rejects email without @\nPASS  accepts uppercase email\nPASS  rejects wrong password\nPASS  returns token\n\nTests: 5 passed, 5 total'},1800);
    await tool('TodoWrite',todos(5),{},300);
    ev({hook_event_name:'Stop',last_assistant_message:t('demoDone')});await idleP();
  }finally{demoRunning=false}
}

/* ---------- replays: save, open, play ---------- */
let replayToken=0;
function toast(msg,ms=3200){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),ms)}
function maskCmd(s){return typeof s==='string'?s.replace(/\b[A-Za-z0-9_\-]{24,}\b/g,'••••').replace(/(token|key|secret|passw(?:or)?d|pass|auth)(=|\s+|:)\S+/ig,'$1$2••••'):s}
function maskStr(s){return typeof s==='string'?s.replace(/[^\s{}()[\];,.<>/=]/g,'•'):s}
function redactTake(take){
  const c=JSON.parse(JSON.stringify(take));c.redacted=true;
  for(const it of c.events){const e=it.e;if(!e)continue;if(e._before)e._before=maskStr(e._before);const ti=e.tool_input||{};
    ['content','old_string','new_string'].forEach(k=>{if(ti[k])ti[k]=maskStr(ti[k])});
    if(ti.command)ti.command=maskCmd(ti.command);if(ti.url)ti.url=maskCmd(ti.url);if(e.tool_response&&typeof e.tool_response==='object'){for(const k of ['stdout','stderr'])if(e.tool_response[k])e.tool_response[k]=maskCmd(e.tool_response[k])}
    if(Array.isArray(ti.edits))ti.edits.forEach(x=>{x.old_string=maskStr(x.old_string);x.new_string=maskStr(x.new_string)})}
  return c;
}
function saveShow(){
  if(!lastTake){toast(t('noTake'));return}
  $('saveDlg').hidden=false;$('bDl').focus();
}
$('bDl').onclick=()=>{
  const data=$('redact').checked?redactTake(lastTake):lastTake;
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`agent-theater-${data.created.slice(0,10)}${data.redacted?'-redacted':''}.json`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);$('saveDlg').hidden=true;toast(t('saved'));
};
$('bDlCancel').onclick=()=>{$('saveDlg').hidden=true};
function validTake(d){return d&&d.app==='agent-theater'&&Array.isArray(d.events)}
function stopReplay(){if(replayMode){replayMode=false;replayToken++;$('rpBadge').hidden=true}}
async function playReplay(d){
  if(!validTake(d)){toast(t('badFile'));return}
  if(!entered){enter();await SL(2700)}stopReplay();const my=++replayToken;replayMode=true;
  const b=$('rpBadge');b.hidden=false;b.textContent=d.redacted?t('rpRedacted'):t('rpNow');
  toast(t('rpPlaying',{t:clip(d.title||'',60)}));
  let prev=0;
  for(let i=0;i<d.events.length;i++){
    if(my!==replayToken)return;
    const it=d.events[i];if(!it.e){prev=it.t;continue}
    await idleP();if(my!==replayToken)return;
    await SL(Math.max(150,Math.min(2200,(it.t-prev))));prev=it.t;if(my!==replayToken)return;
    if(it.e.hook_event_name==='PermissionRequest'){
      openGate('replay',it.e,0);const dec=d.events.slice(i+1).find(x=>x.decision);const choice=dec?dec.decision:'terminal';
      $('gCd').textContent=t('gReplay',{c:t(choice==='allow'?'dAllow':choice==='deny'?'dDeny':'dTerminal')});
      await SL(1800);if(my!==replayToken)return;$({allow:'gYes',deny:'gNo',terminal:'gTerm'}[choice]||'gTerm').classList.add('picked');await SL(1100);
      if(gateId==='replay'){gateId='replay';closeGate();if(choice==='allow'){sfx.chime();shock()}else if(choice==='deny')sfx.alarm()}
      continue;
    }
    queue.push(it.e);pump();
  }
  await idleP();if(my===replayToken){replayMode=false;$('rpBadge').hidden=true}
}
function readFile(f){if(!f)return;const r=new FileReader();r.onload=()=>{try{playReplay(JSON.parse(r.result))}catch(e){toast(t('badFile'))}};r.readAsText(f)}
$('fileIn').onchange=e=>{readFile(e.target.files[0]);e.target.value=''};
let dragN=0;
addEventListener('dragenter',e=>{if([...(e.dataTransfer?.types||[])].includes('Files')){dragN++;$('drop').hidden=false}});
addEventListener('dragleave',()=>{if(--dragN<=0){dragN=0;$('drop').hidden=true}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dragN=0;$('drop').hidden=true;readFile(e.dataTransfer.files[0])});

/* ---------- language & controls ---------- */
const QN={auto:'qAuto',high:'qHigh',mid:'qMid',low:'qLow'};
function applyLang(){
  const l=L();document.documentElement.lang=LANG;document.documentElement.dir=l.dir;document.title=t('title');
  document.querySelectorAll('[data-i]').forEach(el=>{el.textContent=t(el.dataset.i)});
  plan.setAttribute('aria-label',t('planAria'));
  $('bQual').textContent=t('cQual',{q:t(QN[qMode])});
  $('bPlan').textContent=t('cPlan',{m:t(planOn?'onW':'offW')});
  $('bTheme').textContent=t('cTheme',{m:t(theme==='noir'?'thNoir':'thNeon')});$('bVol').textContent=t('cVol',{n:Math.round(vol*100)});
  vidLabel();
  $('bLang').textContent=t('cLang');$('bLang2').textContent=t('cLang');
  $('introP').textContent=OFFLINE?t('introOffline'):t('introServer');
  $('idleSub').textContent=OFFLINE?t('idleSubOffline'):t('idleSub');
  const c=$('conn');if(OFFLINE){c.textContent=t('offline');c.className='pill'}else c.textContent=t(c.dataset.k||'connecting');
  if(!sessionOn&&!panels.length){$('req').textContent=OFFLINE?t('reqOffline'):t('reqWaiting')}
  if(!$('tText').textContent||!sessionOn){$('tLabel').textContent=t('lAgent');$('tText').textContent=OFFLINE?t('reqOffline'):t('reqWaiting')}
  layout();renderPlan();
}
function setLang(x){LANG=x;store.set('at.lang',x);applyLang()}
$('bLang').onclick=$('bLang2').onclick=()=>setLang(LANG==='ar'?'en':'ar');

let entered=false;
function enter(){
  if(entered)return;entered=true;$('intro').hidden=true;
  initAudio();try{ac&&ac.resume()}catch(e){}droneOn(.05);
  // opening sequence: the core ignites, then the stage fades in
  core.boot=0;document.body.classList.add('booting');sfx.boot();camTo({zoom:.35,rx:8},.05);setTimeout(()=>camTo({zoom:.55,rx:0},3.2),60);
  card(t('kBoot'),t('title'),'',2400);
  setTimeout(()=>{shock(core.x,core.y,Math.max(W,H)*.6,3);burst(160,core.x,core.y,9);kick(1.2);sfx.impact()},1100);
  setTimeout(()=>document.body.classList.remove('booting'),1500);
}
$('bEnter').onclick=enter;
$('bDemo').onclick=$('bDemo2').onclick=runDemo;
$('bOpen').onclick=$('bOpen2').onclick=()=>$('fileIn').click();
$('bSave').onclick=saveShow;
if(vidOk())$('bRec').onclick=vidArm;else $('bRec').hidden=true;
$('bSound').onclick=e=>{soundOn=!soundOn;e.currentTarget.setAttribute('aria-pressed',soundOn);droneOn(.05)};
$('bPlan').onclick=()=>{planOn=!planOn;store.set('at.plan',planOn?'1':'0');sendPlan();$('bPlan').textContent=t('cPlan',{m:t(planOn?'onW':'offW')});toast(t('planNote'),4500)};
if(OFFLINE)$('bPlan').hidden=true;
$('bTheme').onclick=()=>{setTheme(theme==='noir'?'neon':'noir');sfx.chime()};
$('bVol').onclick=()=>{vol=vol>.8?.6:vol>.5?.3:1;store.set('at.vol',vol);if(ac&&master)master.gain.setTargetAtTime(.55*vol,ac.currentTime,.05);$('bVol').textContent=t('cVol',{n:Math.round(vol*100)});sfx.node()};
$('bQual').onclick=e=>{const m=['auto','high','mid','low'];qMode=m[(m.indexOf(qMode)+1)%4];setQ(qMode==='auto'?2:{high:2,mid:1,low:0}[qMode]);e.currentTarget.textContent=t('cQual',{q:t(QN[qMode])})};
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('saveDlg').hidden)$('saveDlg').hidden=true});

/* ---------- boot ---------- */
document.body.dataset.q=Q;document.body.dataset.theme=theme;
applyLang();
if(OFFLINE){$('bEnter').hidden=true;$('bDemo2').className='btn'}
else{connect();presence();setInterval(presence,5000);document.addEventListener('visibilitychange',presence)}
addEventListener('load',resize);setTimeout(resize,400);
const rp=qs.get('r');
if(OFFLINE&&rp&&/^https:\/\//.test(rp))fetch(rp).then(r=>r.json()).then(d=>{if(validTake(d)){$('bDemo2').textContent=t('rpNow')+' ▶';$('bDemo2').onclick=()=>playReplay(d)}}).catch(()=>{});
})();
