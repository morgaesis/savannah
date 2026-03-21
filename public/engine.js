// African Plain Screensaver - Pixel Art Engine
// =============================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Dynamic viewport: fills the window at a consistent pixel density (~3.3x scale)
// A 1920x1080 screen → 384x216 pixel art. Wider screen shows more world.
// Responsive pixel scale: higher density on larger screens
const PIXEL_SCALE = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 600 ? 3 : 2;
let PW = Math.max(256, Math.floor(window.innerWidth / PIXEL_SCALE));
let PH = Math.max(144, Math.floor(window.innerHeight / PIXEL_SCALE));
canvas.width = PW; canvas.height = PH;

function resizeCanvas() {
  const newW = Math.max(256, Math.floor(window.innerWidth / PIXEL_SCALE));
  const newH = Math.max(144, Math.floor(window.innerHeight / PIXEL_SCALE));
  if (newW !== PW || newH !== PH) {
    PW = newW; PH = newH;
    canvas.width = PW; canvas.height = PH;
    // Re-render background and vignette for new size
    bgCanvas.width = PW; bgCanvas.height = PH;
    vigCanvas.width = PW; vigCanvas.height = PH;
    renderVignette();
    bgDirty = true;
    // Re-generate position-dependent elements for new dimensions
    starPoints = jitteredGridPoints(0, 0, PW, Math.max(1, HORIZON - VP.y), 6, WORLD_SEED+271, 0.55);
    // Regenerate foreground grass and cricket positions
    if (typeof fgGrass !== 'undefined') {
      fgGrass.length = 0;
      for (let i = 0; i < 12; i++) fgGrass.push({
        x: (i * 37 + 11) % PW,
        y: PH - 5 - (pcgHash(i, 0, 8888) * 30),
        height: 4 + Math.floor(pcgHash(i, 1, 8888) * 4),
        phase: pcgHash(i, 2, 8888) * Math.PI * 2,
        speed: 0.02 + pcgHash(i, 3, 8888) * 0.015,
        color: Math.floor(pcgHash(i, 4, 8888) * 3),
      });
    }
    if (typeof crickets !== 'undefined') {
      for (const c of crickets) {
        c.x = rand(30, PW - 30);
        c.y = rand(HORIZON - VP.y + 15, PH - 25);
      }
    }
  }
}
let _resizeTimer = 0;
function debouncedResize() {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(resizeCanvas, 100);
}
window.addEventListener('resize', debouncedResize);
window.addEventListener('orientationchange', debouncedResize);
document.addEventListener('fullscreenchange', () => setTimeout(resizeCanvas, 100));

// ── Configuration (mutable at runtime via config menu) ──
const CFG = {
  worldW: 800, worldH: 400,
  dustDevilFreq: 0.0003,
  animalCounts: { zebra:5, gazelle:6, wildebeest:5, warthog:3, lion:2, elephant:3, giraffe:2, bird:7 },
};
let WORLD_W = CFG.worldW, WORLD_H = CFG.worldH;
let HORIZON = Math.floor(WORLD_H * 0.45);
// VP.y is dynamic: positions horizon at ~52% from top regardless of viewport height
// Query params (parsed early so VP can use them)
const _urlParams = new URLSearchParams(window.location.search);
const _qVP = _urlParams.get('vp');
const VP = { x: _qVP ? Number(_qVP) : 180, get y() { return Math.floor(HORIZON - PH * 0.52); } };

canvas.addEventListener("click", (e) => {
  // Don't trigger fullscreen if user was dragging
  if (Math.abs(e.clientX - (inputState?.dragStartX||e.clientX)) > 5) return;
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});

const toggle = document.getElementById("toggle");
const ctrlBody = document.getElementById("ctrl-body");
const controls = document.getElementById("controls");
let collapsed = false;
toggle.addEventListener("click", e => { e.stopPropagation(); collapsed = !collapsed; controls.classList.toggle("collapsed", collapsed); ctrlBody.classList.toggle("hidden", collapsed); toggle.textContent = collapsed ? "[+]" : "[\u2212]"; });

// ── Utilities ──
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerpColor(a, b, t) { return [Math.round(lerp(a[0],b[0],t)), Math.round(lerp(a[1],b[1],t)), Math.round(lerp(a[2],b[2],t))]; }
function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b)); }
function wrapX(x) { return ((x % WORLD_W) + WORLD_W) % WORLD_W; }
function wrapDeltaX(dx) { if (dx > WORLD_W/2) return dx - WORLD_W; if (dx < -WORLD_W/2) return dx + WORLD_W; return dx; }
function worldToScreenX(wx) {
  // Map world x to screen x. VP.x is left edge of viewport.
  // Normalize delta to [0, WORLD_W), so items wrap from right edge to left.
  const dx = ((wx - VP.x) % WORLD_W + WORLD_W) % WORLD_W;
  // Wrap items that are more than PW+margin away (they're off-screen right, closer from left)
  const wrapThresh = Math.max(PW + 60, WORLD_W / 2);
  return Math.floor(dx > wrapThresh ? dx - WORLD_W : dx);
}
function dist(a, b) { return Math.hypot(wrapDeltaX(a.x - b.x), a.y - b.y); }
function dirFrom(from, to) { const dx = wrapDeltaX(to.x - from.x), dy = to.y - from.y, d = Math.hypot(dx, dy) || 1; return { dx: dx/d, dy: dy/d, d }; }
function pcgHash(x, y, seed) { let h = (x*374761393 + y*668265263 + seed*1274126177)|0; h = Math.imul(h^(h>>>16), 0x85ebca6b); h = Math.imul(h^(h>>>13), 0xc2b2ae35); return ((h^(h>>>16))>>>0)/4294967296; }
function pcgHashN(x, y, seed, n) { const out = []; for (let i = 0; i < n; i++) out.push(pcgHash(x, y, seed + i*7919)); return out; }
function jitteredGridPoints(aX, aY, aW, aH, cell, seed, density) { const pts = [], cols = Math.ceil(aW/cell), rows = Math.ceil(aH/cell); for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) { const [r1,r2,r3] = pcgHashN(cx,cy,seed,3); if (r3 > (density||1)) continue; const px = aX+cx*cell+r1*cell*0.9, py = aY+cy*cell+r2*cell*0.9; if (px >= aX && px < aX+aW && py >= aY && py < aY+aH) pts.push({x:px,y:py,hash:r1}); } return pts; }

// ── Query Params ──
const _qTime = _urlParams.get('t');
const _qSeed = _urlParams.get('seed');
const _qSpeed = _urlParams.get('speed');

// Master seed: affects world generation and animal spawning
const WORLD_SEED = _qSeed ? Number(_qSeed) : Math.floor(Math.random() * 100000);
// Seeded random replacement (used for animal spawning when seed is set)
let _seededIdx = 0;
const seededRand = (lo, hi) => lo + pcgHash(_seededIdx++, WORLD_SEED, 31337) * (hi - lo);
if (_qSeed) { window._rand = rand; rand = seededRand; }
{ const sdEl = document.getElementById('seed-display'); if (sdEl) sdEl.textContent = '#' + WORLD_SEED; }

// ── Time System ──
const savedDayLen = localStorage.getItem('ss_dayLength');
const savedTime = localStorage.getItem('ss_simTime');
const savedTimeStamp = localStorage.getItem('ss_savedAt');
let dayLengthSec = _qSpeed ? Number(_qSpeed) : (savedDayLen ? Number(savedDayLen) : 86400);
let simTime;
if (_qTime !== null) {
  simTime = ((Number(_qTime) % 24) + 24) % 24;
} else if (savedTime && savedTimeStamp) {
  simTime = (Number(savedTime) + (Date.now() - Number(savedTimeStamp)) / 1000 * 24 / dayLengthSec) % 24;
} else {
  const now = new Date(); simTime = now.getHours() + now.getMinutes() / 60;
}
let lastRealTime = performance.now();
const timeSlider = document.getElementById("time-slider");
const timeDisplay = document.getElementById("time-display");
const dayLengthSel = document.getElementById("day-length");
timeSlider.value = Math.round(simTime*60);
dayLengthSel.value = String(dayLengthSec);
dayLengthSel.addEventListener("change", () => { dayLengthSec = Number(dayLengthSel.value); localStorage.setItem('ss_dayLength', String(dayLengthSec)); });
timeSlider.addEventListener("input", () => {
  simTime = Number(timeSlider.value) / 60;
  localStorage.setItem('ss_simTime', String(simTime));
  localStorage.setItem('ss_savedAt', String(Date.now()));
  bgDirty = true;
});
setInterval(() => { localStorage.setItem('ss_simTime', String(simTime)); localStorage.setItem('ss_savedAt', String(Date.now())); }, 10000);

// Global time skip (used by buttons and keyboard)
window._skipTime = function(hour) {
  simTime = ((hour % 24) + 24) % 24;
  bgDirty = true;
  timeSlider.value = Math.round(simTime * 60);
  localStorage.setItem('ss_simTime', String(simTime));
  localStorage.setItem('ss_savedAt', String(Date.now()));
  drawTimeDial();
};

// Circular time dial
const timeDial = document.getElementById('time-dial');
const tdCtx = timeDial ? timeDial.getContext('2d') : null;
function drawTimeDial() {
  if (!tdCtx) return;
  const cx = 8, cy = 8, r = 7;
  tdCtx.clearRect(0, 0, 16, 16);
  tdCtx.beginPath(); tdCtx.arc(cx, cy, r, 0, Math.PI * 2);
  tdCtx.fillStyle = 'rgba(40,35,25,0.6)'; tdCtx.fill();
  tdCtx.strokeStyle = 'rgba(120,100,60,0.4)'; tdCtx.lineWidth = 0.5; tdCtx.stroke();
  tdCtx.beginPath(); tdCtx.arc(cx, cy, r - 1, -Math.PI/2, Math.PI/2);
  tdCtx.strokeStyle = 'rgba(200,160,60,0.3)'; tdCtx.lineWidth = 1; tdCtx.stroke();
  tdCtx.beginPath(); tdCtx.arc(cx, cy, r - 1, Math.PI/2, -Math.PI/2);
  tdCtx.strokeStyle = 'rgba(60,70,120,0.3)'; tdCtx.lineWidth = 1; tdCtx.stroke();
  const angle = (simTime / 24) * Math.PI * 2 - Math.PI / 2;
  const hx = cx + Math.cos(angle) * (r - 2);
  const hy = cy + Math.sin(angle) * (r - 2);
  tdCtx.beginPath(); tdCtx.moveTo(cx, cy); tdCtx.lineTo(hx, hy);
  tdCtx.strokeStyle = '#d4c080'; tdCtx.lineWidth = 1; tdCtx.stroke();
  // Center dot
  tdCtx.beginPath(); tdCtx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  tdCtx.fillStyle = '#d4c080'; tdCtx.fill();
}
drawTimeDial();

// Drag on dial to set time (circular, wraps naturally)
if (timeDial) {
  let dialDragging = false;
  const dialAngleToTime = (e) => {
    const rect = timeDial.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let angle = Math.atan2(dy, dx) + Math.PI / 2; // 0 = top (midnight)
    if (angle < 0) angle += Math.PI * 2;
    return (angle / (Math.PI * 2)) * 24;
  };
  timeDial.addEventListener('mousedown', (e) => { dialDragging = true; window._skipTime(dialAngleToTime(e)); });
  document.addEventListener('mousemove', (e) => { if (dialDragging) window._skipTime(dialAngleToTime(e)); });
  document.addEventListener('mouseup', () => { dialDragging = false; });
  timeDial.addEventListener('touchstart', (e) => { dialDragging = true; window._skipTime(dialAngleToTime(e.touches[0])); }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (dialDragging && e.touches.length) window._skipTime(dialAngleToTime(e.touches[0])); }, { passive: true });
  document.addEventListener('touchend', () => { dialDragging = false; });
}
const _qPause = _urlParams.get('pause') !== null;
const _qHide = _urlParams.get('hide') !== null;
if (_qHide) { const c = document.getElementById('controls'); if (c) c.style.display = 'none'; }
function updateTime() {
  const now = performance.now(), dtReal = (now-lastRealTime)/1000; lastRealTime = now;
  if (!_qPause) simTime = (simTime + dtReal*24/dayLengthSec)%24;
  timeSlider.value = Math.round(simTime*60);
  const h = Math.floor(simTime), m = Math.floor((simTime-h)*60);
  const ts = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  timeDisplay.textContent = ts;
  // Dynamic title with time and period
  const period = simTime < 5.5 ? 'Night' : simTime < 7 ? 'Dawn' : simTime < 10 ? 'Morning'
    : simTime < 14 ? 'Midday' : simTime < 17 ? 'Afternoon' : simTime < 19.5 ? 'Sunset'
    : simTime < 21 ? 'Dusk' : 'Night';
  document.title = `${ts} ${period} \u2014 African Plain`;
  drawTimeDial();
}

// ── Input System ──
const inputState = { left:false, right:false, dragging:false, dragStartX:0, dragVpStart:0 };
let configMenuOpen = false;
document.addEventListener("keydown", e => {
  if (configMenuOpen) return;
  if (e.key==="ArrowLeft"||e.key==="a") inputState.left=true;
  if (e.key==="ArrowRight"||e.key==="d") inputState.right=true;
  // Time skip: n = next period (dawn/noon/sunset/night)
  if (e.key === 'n') {
    const periods = [5.5, 7, 12, 17.5, 20.5];
    const next = periods.find(p => p > simTime + 0.1) || periods[0];
    window._skipTime(next);
  }
  // Speed toggle: s = cycle through 1x/60x/300x
  if (e.key === 's' && !e.ctrlKey) {
    const speeds = [86400, 1440, 288]; // 24h, 24min, ~5min per day
    const idx = speeds.indexOf(dayLengthSec);
    dayLengthSec = speeds[(idx + 1) % speeds.length];
    dayLengthSel.value = String(dayLengthSec);
    localStorage.setItem('ss_dayLength', String(dayLengthSec));
  }
  // Help overlay
  if (e.key === '?' || e.key === 'h') {
    let hel = document.getElementById('help-overlay');
    if (hel) { hel.remove(); return; }
    hel = document.createElement('div');
    hel.id = 'help-overlay';
    hel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    hel.innerHTML = `<div style="background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:16px 24px;color:#bbb;font:12px/2 monospace;max-width:320px;">
      <div style="color:#e8dcc0;font-size:14px;font-weight:bold;margin-bottom:8px;">Controls</div>
      <b>Click</b> fullscreen &nbsp; <b>Drag</b> pan<br>
      <b>N</b> next time period<br>
      <b>S</b> cycle speed (1x/60x/300x)<br>
      <b>←→</b> pan viewport<br>
      <b>?</b> this help<br>
      <div style="border-top:1px solid #333;margin:6px 0;"></div>
      <span style="color:#665;font-size:10px;">click anywhere to close</span>
    </div>`;
    hel.addEventListener('click', () => hel.remove());
    document.body.appendChild(hel);
  }
});
document.addEventListener("keyup", e => { if (e.key==="ArrowLeft"||e.key==="a") inputState.left=false; if (e.key==="ArrowRight"||e.key==="d") inputState.right=false; });
canvas.addEventListener("mousedown", e => { if (e.button!==0) return; inputState.dragging=true; inputState.dragStartX=e.clientX; inputState.dragVpStart=VP.x; canvas.style.cursor="grabbing"; });
document.addEventListener("mousemove", e => { if (!inputState.dragging) return; VP.x = wrapX(inputState.dragVpStart - (e.clientX-inputState.dragStartX)*PW/canvas.clientWidth); bgDirty=true; });
document.addEventListener("mouseup", () => { inputState.dragging=false; canvas.style.cursor="pointer"; });
canvas.addEventListener("touchstart", e => { if (e.touches.length===1) { inputState.dragging=true; inputState.dragStartX=e.touches[0].clientX; inputState.dragVpStart=VP.x; } }, {passive:true});
document.addEventListener("touchmove", e => { if (!inputState.dragging||e.touches.length!==1) return; VP.x = wrapX(inputState.dragVpStart - (e.touches[0].clientX-inputState.dragStartX)*PW/canvas.clientWidth); bgDirty=true; }, {passive:true});
document.addEventListener("touchend", () => { inputState.dragging=false; });
function applyInput() { if (inputState.left) { VP.x = wrapX(VP.x-1.2); bgDirty=true; } if (inputState.right) { VP.x = wrapX(VP.x+1.2); bgDirty=true; } }

// ── Sky / Ambient ──
const SKY_KEYS = [ {t:0,top:[8,8,25],mid:[12,12,35],low:[18,18,45]},{t:5,top:[8,8,25],mid:[12,12,35],low:[18,18,45]},{t:5.5,top:[25,15,55],mid:[60,30,50],low:[100,50,50]},{t:6.5,top:[40,25,80],mid:[170,85,50],low:[225,145,65]},{t:8,top:[90,140,210],mid:[140,180,235],low:[190,210,240]},{t:12,top:[70,130,210],mid:[120,170,235],low:[170,200,240]},{t:16,top:[80,135,200],mid:[150,170,200],low:[200,190,175]},{t:17.5,top:[45,25,85],mid:[175,85,50],low:[230,145,60]},{t:19,top:[25,15,60],mid:[70,35,45],low:[110,55,45]},{t:20,top:[12,10,35],mid:[18,15,40],low:[25,20,48]},{t:21,top:[8,8,25],mid:[12,12,35],low:[18,18,45]},{t:24,top:[8,8,25],mid:[12,12,35],low:[18,18,45]} ];
function getSkyColors(t) { for (let i=0;i<SKY_KEYS.length-1;i++) { if (t>=SKY_KEYS[i].t&&t<SKY_KEYS[i+1].t) { const f=(t-SKY_KEYS[i].t)/(SKY_KEYS[i+1].t-SKY_KEYS[i].t); return {top:lerpColor(SKY_KEYS[i].top,SKY_KEYS[i+1].top,f),mid:lerpColor(SKY_KEYS[i].mid,SKY_KEYS[i+1].mid,f),low:lerpColor(SKY_KEYS[i].low,SKY_KEYS[i+1].low,f)}; } } return {top:SKY_KEYS[0].top,mid:SKY_KEYS[0].mid,low:SKY_KEYS[0].low}; }
function getAmbient(t) { if(t<5)return 0.18;if(t<6.5)return lerp(0.18,0.7,(t-5)/1.5);if(t<8)return lerp(0.7,1,(t-6.5)/1.5);if(t<16)return 1;if(t<18)return lerp(1,0.7,(t-16)/2);if(t<20)return lerp(0.7,0.18,(t-18)/2);return 0.18; }
// Moonlight blue tint (applied as overlay on ground at night)
function getMoonlightAlpha(t) {
  const amb = getAmbient(t);
  if (amb > 0.35) return 0; // no moonlight needed during day
  const moonUp = !getSunPos(t);
  if (!moonUp) return 0;
  return (0.35 - amb) / 0.35 * 0.08; // max 8% blue overlay
}
function getSunPos(t) { const a=(t-6)/12*Math.PI; if(a<=0||a>=Math.PI)return null; return {x:WORLD_W*0.1+(WORLD_W*0.8)*((t-6)/12),y:HORIZON-Math.sin(a)*65,angle:a}; }
function getSunColor(t) { if(t<7)return[255,160,60];if(t<9)return lerpColor([255,160,60],[255,240,200],(t-7)/2);if(t<15)return[255,245,210];if(t<17)return lerpColor([255,245,210],[255,180,70],(t-15)/2);return[255,160,50]; }

// ── World Features ──
let bgDirty = true;
let trees=[],shrubs=[],grassTufts=[],rockPoints=[],starPoints=[];
const waterHole = {x:380,y:0,rx:30,ry:6};
function regenerateWorld() {
  WORLD_W=CFG.worldW; WORLD_H=CFG.worldH; HORIZON=Math.floor(WORLD_H*0.45); waterHole.y=HORIZON+50;
  trees=[]; const tc=Math.round(6*WORLD_W/800); for(let i=0;i<tc;i++) trees.push({x:(i*WORLD_W/tc+rand(-20,20))%WORLD_W,y:HORIZON+2+rand(0,14),s:2+Math.floor(rand(0,2))});
  shrubs=[]; const sc=Math.round(25*WORLD_W/800); for(let i=0;i<sc;i++) shrubs.push({x:(i*137+43)%WORLD_W,y:HORIZON+5+(i*53%70),s:1+(i%3)});
  grassTufts=jitteredGridPoints(0,HORIZON+2,WORLD_W,WORLD_H-HORIZON-12,12,WORLD_SEED+42,0.55);
  rockPoints=jitteredGridPoints(0,HORIZON+8,WORLD_W,WORLD_H-HORIZON-20,50,WORLD_SEED+137,0.25);
  starPoints=jitteredGridPoints(0,0,PW,HORIZON-VP.y,6,WORLD_SEED+271,0.55);
  bgDirty=true;
}
regenerateWorld();

// ── Animal System ──
const STATE = {IDLE:'idle',WANDER:'wander',GRAZE:'graze',DRINK:'drink',FLEE:'flee',HUNT:'hunt',STALK:'stalk',CHASE:'chase',REST:'rest',FLOCK:'flock',ALERT:'alert',APPROACH_WATER:'apw',PERCH:'perch',WALK_GROUND:'walk_ground',DEAD:'dead',EAT:'eat'};
function makeBrain(o) { return Object.assign({speed:0.15,fleeSpeed:0.5,huntSpeed:0.4,huntRange:80,restDesire:0.3,grazeDesire:0.3,wanderDesire:0.2,waterDesire:0.15,herdDesire:0.3,huntDesire:0.1,fearSensitivity:0.6,boldness:0.6,laziness:0.5,curiosity:0.3,thirstRate:1,hungerRate:1,prey:false,herd:false,flying:false},o); }
// Speeds based on real animal data (1.0 ≈ 80 km/h top sprint)
// walk = typical cruising, fleeSpeed/huntSpeed = top sprint
// stamina = ticks at top speed before exhaustion (30 tps)
const BRAINS = {
  zebra:makeBrain({speed:0.07,fleeSpeed:0.52,stamina:1200,prey:true,herd:true,restDesire:0.2,grazeDesire:0.4,wanderDesire:0.15,waterDesire:0.1,herdDesire:0.4,fearSensitivity:0.7,boldness:0.5,laziness:0.4}),
  gazelle:makeBrain({speed:0.08,fleeSpeed:0.72,stamina:2400,prey:true,herd:true,restDesire:0.2,grazeDesire:0.35,wanderDesire:0.15,waterDesire:0.1,herdDesire:0.5,fearSensitivity:0.8,boldness:0.4,laziness:0.35}),
  wildebeest:makeBrain({speed:0.07,fleeSpeed:0.65,stamina:1500,prey:true,herd:true,restDesire:0.2,grazeDesire:0.4,wanderDesire:0.2,waterDesire:0.1,herdDesire:0.45,fearSensitivity:0.6,boldness:0.5,laziness:0.4}),
  warthog:makeBrain({speed:0.06,fleeSpeed:0.38,stamina:900,prey:true,herd:false,restDesire:0.2,grazeDesire:0.35,wanderDesire:0.25,waterDesire:0.1,herdDesire:0.1,fearSensitivity:0.7,boldness:0.6,laziness:0.3}),
  lion:makeBrain({speed:0.06,huntSpeed:0.65,stamina:600,huntRange:90,restDesire:0.55,grazeDesire:0,wanderDesire:0.1,waterDesire:0.05,herdDesire:0.15,huntDesire:0.15,fearSensitivity:0.1,boldness:1,laziness:0.7}),
  elephant:makeBrain({speed:0.05,fleeSpeed:0.32,stamina:1200,herd:true,restDesire:0.25,grazeDesire:0.3,wanderDesire:0.15,waterDesire:0.2,herdDesire:0.35,fearSensitivity:0.05,boldness:1,laziness:0.5}),
  giraffe:makeBrain({speed:0.06,fleeSpeed:0.47,stamina:1200,restDesire:0.15,grazeDesire:0.4,wanderDesire:0.2,waterDesire:0.1,herdDesire:0.1,fearSensitivity:0.2,boldness:0.8,laziness:0.4}),
  bird:makeBrain({speed:0.08,flying:true,stamina:9999,restDesire:0.25,grazeDesire:0.15,wanderDesire:0.3,waterDesire:0.05,herdDesire:0.3,fearSensitivity:0.3,boldness:0.5,laziness:0.3}),
};
function individualizeBrain(base) { const b=Object.assign({},base); const v=(val,r)=>clamp(val+rand(-r,r),0,1); b.speed*=rand(0.75,1.25);b.fleeSpeed*=rand(0.8,1.2);b.huntSpeed*=rand(0.8,1.2);b.huntRange*=rand(0.7,1.3); b.restDesire=v(b.restDesire,0.2);b.grazeDesire=v(b.grazeDesire,0.2);b.wanderDesire=v(b.wanderDesire,0.15);b.waterDesire=v(b.waterDesire,0.1);b.herdDesire=v(b.herdDesire,0.25);b.huntDesire=v(b.huntDesire,0.1);b.fearSensitivity=v(b.fearSensitivity,0.25);b.boldness=v(b.boldness,0.3);b.laziness=v(b.laziness,0.3);b.curiosity=v(b.curiosity,0.25);b.thirstRate=rand(0.6,1.5);b.hungerRate=rand(0.6,1.5); return b; }

// ── Coroutines ──
function* behaviorLoop(self, getAnimals) {
  while (true) {
    if (!self.alive) { yield 60; continue; }
    if (self.brain.prey) { const threat=scanForThreat(self,getAnimals()); if(threat) { self.state=STATE.ALERT;self.targetVx=0;self.targetVy=0;const dir=dirFrom(self,threat);self.facing=dir.dx>0?1:-1;yield randInt(20,60); if(self.memory.fear>20*self.brain.boldness){self.state=STATE.FLEE;self.memory.fleeFrom={x:threat.x,y:threat.y};for(let i=0,dur=randInt(200,500);i<dur&&self.alive;i++){const ft=self.memory.fleeFrom,dir=dirFrom(ft,self);self.targetVx=dir.dx*self.getSprintSpeed()+(pcgHash(i,Math.floor(self.seed*100),88)-0.5)*0.5;self.targetVy=dir.dy*self.getSprintSpeed()*0.15;yield 1;}self.homeX=self.x;self.homeY=self.y;} self.state=STATE.IDLE;yield randInt(60,180);continue; } }
    if (self.brain.flying) { yield* birdBehavior(self,getAnimals); continue; }
    const isNight=simTime<5.5||simTime>20,isDusk=simTime>17&&simTime<=20,isDawn=simTime>=5.5&&simTime<7,isTwilight=isDusk||isDawn,isHotMidday=simTime>11&&simTime<14;
    if (self.type==='lion') { const ht=isTwilight?30:isNight?35:55; if(self.memory.hunger>ht*(1-self.brain.huntDesire)){yield* lionHunt(self,getAnimals);continue;} }
    const thirsty=self.memory.thirst>45&&self._tick-self.memory.lastWater>800,hungry=self.memory.hunger>25,scared=self.memory.threats.length>0;
    const nR=isNight?3:isTwilight?1.5:1,mR=isHotMidday?1.8:1,nH=isNight?2.5:1,nG=isNight?0.3:1,nW=isNight?0.4:1;
    // Heat increases thirst rate and water-seeking behavior
    const hotMul = isHotMidday ? 2.0 : 1.0;
    const weights=[{w:self.brain.restDesire*(1+self.brain.laziness)*nR*mR,a:'rest'},{w:self.brain.grazeDesire*(hungry?2.5:0.5)*nG,a:'graze'},{w:self.brain.wanderDesire*(1+self.brain.curiosity)*nW,a:'wander'},{w:self.brain.waterDesire*(thirsty?4*hotMul:0.3*hotMul),a:'water'},{w:self.brain.herdDesire*(self.brain.herd?1.5:0)*nH,a:'herd'},{w:scared?0.8:0.05,a:'avoid'},{w:isHotMidday?0.3:0,a:'shade'},{w:0.15,a:'idle'}];
    const totalW=weights.reduce((s,o)=>s+o.w,0); let r=Math.random()*totalW,chosen='idle'; for(const{w,a}of weights){r-=w;if(r<=0){chosen=a;break;}}
    switch(chosen) {
      case 'rest': self.state=STATE.REST;self.targetVx=0;self.targetVy=0;yield randInt(300,1200)*(0.5+self.brain.laziness);break;
      case 'graze': {
        self.state = STATE.GRAZE;
        for (let i = 0, dur = randInt(200, 800); i < dur && self.alive; i++) {
          self.targetVx *= 0.98; self.targetVy *= 0.98;
          self.memory.hunger = Math.max(0, self.memory.hunger - 0.04);
          // Shift position slightly while grazing
          if (i % 120 === 0) {
            self.targetVx = rand(-0.012, 0.012);
            self.targetVy = rand(-0.006, 0.006);
          }
          // Occasionally lift head (brief pause from eating)
          if (pcgHash(i, Math.floor(self.seed * 55), 9999) < 0.006) {
            self.state = STATE.IDLE; // head up
            self.targetVx = 0; self.targetVy = 0;
            if (pcgHash(i, Math.floor(self.seed * 44), 1111) < 0.5) self.facing *= -1;
            yield randInt(15, 45);
            self.state = STATE.GRAZE; // head back down
          }
          if (self.memory.hunger <= 3) break;
          yield 1;
        }
        break;
      }
      case 'wander': {
        self.state = STATE.WANDER;
        const a = pcgHash(self._tick >> 3, Math.floor(self.seed * 100), 44) * Math.PI * 2;
        self.targetVx = Math.cos(a) * self.brain.speed * 0.4;
        self.targetVy = Math.sin(a) * self.brain.speed * 0.12;
        for (let i = 0, dur = randInt(150, 500); i < dur && self.alive; i++) {
          // Home pull
          const hd = dist(self, { x: self.homeX, y: self.homeY });
          if (hd > 60 + self.brain.curiosity * 60) {
            const dir = dirFrom(self, { x: self.homeX, y: self.homeY });
            self.targetVx += dir.dx * 0.006;
            self.targetVy += dir.dy * 0.002;
          }
          // Micro-behaviors: random pauses, look-arounds, direction shifts
          const microRoll = pcgHash(i, Math.floor(self.seed * 77), 5555);
          if (microRoll < 0.005) {
            // Brief pause: stop and look around
            const savedVx = self.targetVx, savedVy = self.targetVy;
            self.targetVx = 0; self.targetVy = 0;
            self.facing *= -1; // look the other way
            yield randInt(20, 60);
            self.facing *= -1; // look back
            self.targetVx = savedVx; self.targetVy = savedVy;
          } else if (microRoll < 0.012) {
            // Slight direction change mid-walk
            const shift = (pcgHash(i, Math.floor(self.seed * 88), 6666) - 0.5) * 0.8;
            self.targetVx += shift * self.brain.speed;
            self.targetVy += (pcgHash(i, Math.floor(self.seed * 99), 7777) - 0.5) * 0.2 * self.brain.speed;
          }
          yield 1;
        }
        break;
      }
      case 'water': self.state=STATE.APPROACH_WATER;yield* goToWater(self);break;
      case 'herd': yield* herdDrift(self,getAnimals);break;
      case 'avoid': { const lt=self.memory.threats[self.memory.threats.length-1]; if(lt){self.state=STATE.WANDER;const dir=dirFrom(lt,self);self.targetVx=dir.dx*self.brain.speed*0.3;self.targetVy=dir.dy*self.brain.speed*0.1;yield randInt(100,250);}else yield randInt(60,150);break; }
      case 'shade': {
        // Seek shade under nearest tree during hot midday
        let nearest = null, nd = Infinity;
        for (const t of trees) {
          const d = dist(self, t);
          if (d < nd) { nearest = t; nd = d; }
        }
        if (nearest && nd > 10) {
          self.state = STATE.WANDER;
          const dir = dirFrom(self, nearest);
          self.targetVx = dir.dx * self.brain.speed * 0.5;
          self.targetVy = dir.dy * self.brain.speed * 0.3;
          yield Math.min(Math.floor(nd / self.brain.speed), 400);
        }
        // Rest under the tree
        self.state = STATE.REST;
        self.targetVx = 0; self.targetVy = 0;
        yield randInt(300, 800);
        break;
      }
      default: {
        // Idle: standing still but looking around occasionally
        self.state = STATE.IDLE;
        self.targetVx = 0; self.targetVy = 0;
        const idleDur = randInt(150, 600) * (0.5 + self.brain.laziness);
        for (let i = 0; i < idleDur && self.alive; i++) {
          // Occasionally look around (flip facing)
          if (pcgHash(i, Math.floor(self.seed * 66), 8888) < 0.008) {
            self.facing *= -1;
          }
          yield 1;
        }
        break;
      }
    }
  }
}

function scanForThreat(self, animals) {
  for (const o of animals) { if(o===self||!o.alive||o.type!=='lion')continue; const d=dist(self,o),alertD=65*self.brain.fearSensitivity; if(d<alertD){self.memory.fear=Math.min(100,self.memory.fear+2);self.memory.threats.push({x:o.x,y:o.y,time:self._tick});self.memory.fearDirect=true;const hunting=o.state===STATE.HUNT||o.state===STATE.STALK||o.state===STATE.CHASE||o.state===STATE.EAT;if(d<30*self.brain.boldness||(hunting&&d<alertD)){propagateAlarm(self,o,animals);return o;}} }
  // Stampede: social alarm with dampening (caps at 65, calm animals need higher threshold)
  for (const o of animals) { if(o===self||!o.alive||o.type!==self.type||o.state!==STATE.FLEE)continue; const d=dist(self,o); if(d<50*self.brain.herdDesire+20){const calmPenalty=(self.state===STATE.REST||self.state===STATE.GRAZE)?15:0;self.memory.fear=Math.min(65,self.memory.fear+3*(1-d/(50*self.brain.herdDesire+20)));if(o.memory.fleeFrom){self.memory.threats.push({x:o.memory.fleeFrom.x,y:o.memory.fleeFrom.y,time:self._tick});if(self.memory.fear>(15+calmPenalty)*self.brain.boldness){self.memory.fearDirect=false;return{x:o.memory.fleeFrom.x,y:o.memory.fleeFrom.y};}}} }
  return null;
}

function propagateAlarm(source, threat, animals) { let alerted=0; for(const a of animals){if(a===source||!a.alive||a.type!==source.type)continue;const d=dist(source,a);if(d<70){a.memory.fear=Math.min(65,a.memory.fear+8*(1-d/70));a.memory.threats.push({x:threat.x,y:threat.y,time:source._tick});alerted++;}} if(alerted>=2)spawnDustBurst(source.x,source.y,alerted*2,8); }

function* goToWater(self) {
  // Approach a point on the waterhole edge (not center), with slight offset per animal
  const angle = pcgHash(Math.floor(self.seed * 100), 0, 4567) * Math.PI * 2;
  const edgeX = waterHole.x + Math.cos(angle) * (waterHole.rx + 4);
  const edgeY = waterHole.y + Math.sin(angle) * (waterHole.ry + 3);
  for (let i = 0; i < 600 && self.alive; i++) {
    const dir = dirFrom(self, { x: edgeX, y: edgeY });
    if (dir.d < 8) {
      self.state = STATE.DRINK;
      self.targetVx = 0; self.targetVy = 0;
      // Face the water
      self.facing = wrapDeltaX(waterHole.x - self.x) > 0 ? 1 : -1;
      for (let j = 0, dur = randInt(200, 500); j < dur; j++) {
        self.memory.thirst = Math.max(0, self.memory.thirst - 0.08);
        if (self.memory.thirst <= 2) break;
        yield 1;
      }
      self.memory.lastWater = self._tick;
      return;
    }
    self.targetVx = dir.dx * self.brain.speed * 0.6;
    self.targetVy = dir.dy * self.brain.speed * 0.4;
    yield 1;
  }
}

function* herdDrift(self, getAnimals) { if(!self.brain.herd){yield 60;return;} const mates=getAnimals().filter(a=>a!==self&&a.type===self.type&&a.alive); if(!mates.length){yield 60;return;} self.state=STATE.WANDER; let cdx=0,cy=0; for(const m of mates){cdx+=wrapDeltaX(m.x-self.x);cy+=m.y;} const cx=wrapX(self.x+cdx/mates.length); cy/=mates.length; const dir=dirFrom(self,{x:cx,y:cy}); if(dir.d>30){self.targetVx=dir.dx*self.brain.speed*0.4+rand(-0.02,0.02);self.targetVy=dir.dy*self.brain.speed*0.15;yield randInt(100,300);}else yield randInt(80,200); }

function* lionHunt(self, getAnimals) {
  self.state=STATE.HUNT; let target=null,nd=Infinity; for(const o of getAnimals()){if(o===self||!o.alive||!o.brain.prey)continue;const d=dist(self,o);if(d<self.brain.huntRange&&d<nd){target=o;nd=d;}} if(!target){self.state=STATE.REST;yield randInt(600,1500);return;}
  self.state=STATE.STALK; for(let i=0;i<800&&self.alive;i++){if(!target.alive){self.state=STATE.REST;yield randInt(300,600);return;}if(target.state===STATE.FLEE){if(dist(self,target)<45)break;else{self.state=STATE.REST;yield randInt(600,1500);return;}}const dir=dirFrom(self,target);if(dir.d<20)break;const pause=pcgHash(i>>2,Math.floor(self.seed*100),66)>0.55;self.targetVx=pause?0:dir.dx*self.brain.speed*0.25;self.targetVy=pause?0:dir.dy*self.brain.speed*0.075;yield 1;}
  self.state=STATE.CHASE; for(let i=0;i<350&&self.alive;i++){if(!target.alive)break;const dir=dirFrom(self,target);self.targetVx=dir.dx*self.getSprintSpeed();self.targetVy=dir.dy*self.getSprintSpeed()*0.25;if(dir.d<6){target.alive=false;target.state=STATE.DEAD;self.state=STATE.EAT;self.targetVx=0;self.targetVy=0;showNarration('The lion feeds');spawnVultures(target.x, target.y);for(let j=0,dur=randInt(600,1800);j<dur&&self.alive;j++){self.memory.hunger=Math.max(0,self.memory.hunger-0.06);self.targetVx=0;self.targetVy=0;if(dist(self,target)>8){const d2=dirFrom(self,target);self.targetVx=d2.dx*0.02;self.targetVy=d2.dy*0.01;}yield 1;}self.state=STATE.REST;yield randInt(800,2500);return;}if(dir.d>100)break;yield 1;}
  self.state=STATE.REST;yield randInt(800,2500);
}

function* birdBehavior(self, getAnimals) {
  const isNight = simTime < 5.3 || simTime > 20;
  const isDawnChorus = simTime >= 5.3 && simTime < 5.8; // dawn chorus window
  if (isNight) {
    // Roost at night
    self.state = STATE.PERCH; self.targetVx = 0; self.targetVy = 0;
    const nt = trees.find(t => Math.abs(wrapDeltaX(t.x - self.x)) < 40);
    if (nt) { self.x = nt.x + rand(-5, 5); self.y = nt.y - nt.s * 4; }
    yield randInt(300, 900);
    return;
  }
  if (isDawnChorus) {
    // Dawn chorus: all birds take off together with scatter effect
    birdScatterEffect(self.x, self.y);
    self.state = STATE.FLOCK;
    self._flockPhase = rand(0, Math.PI * 2);
    self.targetVx = rand(-0.2, 0.2);
    self.targetVy = -self.brain.speed * 0.7; // steep ascent
    for (let i = 0; i < 40 && self.y > HORIZON - 25; i++) yield 1;
    // Circle and flock excitedly for a while
    for (let i = 0, dur = randInt(300, 600); i < dur; i++) {
      const t = (self._tick + i) * 0.015 + self._flockPhase;
      self.targetVx = Math.cos(t) * self.brain.speed * 0.5;
      self.targetVy = Math.sin(t * 0.7) * self.brain.speed * 0.2;
      yield 1;
    }
    return;
  }
  const onGround=self.y>=HORIZON,choice=Math.random();
  if(choice<0.35){if(onGround){self.state=STATE.FLOCK;birdScatterEffect(self.x,self.y);self.targetVx=rand(-0.1,0.1);self.targetVy=-self.brain.speed*0.5;for(let i=0;i<60&&self.y>HORIZON-15;i++)yield 1;}self.state=STATE.FLOCK;self._flockPhase=rand(0,Math.PI*2);for(let i=0,dur=randInt(400,900);i<dur;i++){const t=(self._tick+i)*0.01+self._flockPhase;let fx=Math.cos(t)*self.brain.speed*0.35,fy=Math.sin(t*0.6)*self.brain.speed*0.12;const near=getAnimals().filter(a=>a!==self&&a.type==='bird'&&a.state===STATE.FLOCK&&dist(self,a)<50);if(near.length){let cx=0,cy=0;for(const a of near){cx+=wrapDeltaX(a.x-self.x);cy+=a.y;}fx+=wrapDeltaX(self.x+cx/near.length-self.x)*0.001;fy+=(cy/near.length-self.y)*0.001;}self.targetVx=fx;self.targetVy=fy;yield 1;}}
  else if(choice<0.6){if(!onGround){self.state=STATE.FLOCK;const landY=HORIZON+rand(5,60);for(let i=0;i<90&&self.y<landY-2;i++){const dx=wrapDeltaX(self.x+rand(-20,20)-self.x),dy=landY-self.y,d=Math.hypot(dx,dy)||1;self.targetVx=(dx/d)*self.brain.speed*0.3;self.targetVy=(dy/d)*self.brain.speed*0.25;yield 1;}}self.state=STATE.PERCH;self.targetVx=0;self.targetVy=0;yield randInt(300,800);}
  else if(choice<0.8){self.state=STATE.WALK_GROUND;self.y=clamp(self.y,HORIZON+5,WORLD_H-10);for(let h=0,hops=randInt(3,8);h<hops;h++){self.targetVx=rand(-0.15,0.15);self.targetVy=rand(-0.05,0.05);yield randInt(8,15);self.targetVx=0;self.targetVy=0;yield randInt(20,60);}}
  else{birdScatterEffect(self.x,self.y);self.state=STATE.FLOCK;self.targetVx=rand(-0.15,0.15);self.targetVy=-self.brain.speed*0.6;for(let i=0;i<50&&self.y>HORIZON-20;i++)yield 1;yield randInt(400,1000);}
}

// ── Animal class ──
class Animal {
  constructor(type, x, y) {
    this.type=type;this.brain=individualizeBrain(BRAINS[type]);this.x=wrapX(x);this.y=y;this.vx=0;this.vy=0;this.targetVx=0;this.targetVy=0;this.state=STATE.IDLE;this.facing=1;this.frame=0;this.seed=Math.random()*1000;this.alive=true;this.homeX=this.x;this.homeY=y;this._tick=0;this._flockPhase=rand(0,Math.PI*2);this._walkDist=0;
    this.energy = 1.0; // 0-1, depletes during sprinting, regenerates at rest
    this.memory={lastWater:-9999,thirst:rand(0,40),hunger:rand(0,40),fear:0,threats:[],huntTarget:null,fleeFrom:null,fearDirect:false};
    this._fiber=behaviorLoop(this,()=>animals);this._yieldRemaining=randInt(30,200);
  }
  getSprintSpeed() {
    const base = this.brain.fleeSpeed || this.brain.huntSpeed || this.brain.speed * 3;
    const factor = this.energy > 0.5 ? 1.0 : 0.4 + this.energy * 1.2;
    return base * factor;
  }
  tick(globalTick) {
    if(!this.alive&&this.state!==STATE.DEAD)return;this._tick=globalTick;this.frame++;
    // Thirst accumulates faster during hot midday
    const heatThirst = (simTime > 10 && simTime < 15) ? 1.8 : 1.0;
    this.memory.thirst+=0.008*this.brain.thirstRate*heatThirst;this.memory.hunger+=0.006*this.brain.hungerRate;this.memory.fear=Math.max(0,this.memory.fear-(this.memory.fearDirect?0.1:0.2));this.memory.threats=this.memory.threats.filter(t=>globalTick-t.time<900);
    // Energy: depletes during sprinting, regenerates at rest
    const sprinting = this.state === STATE.FLEE || this.state === STATE.CHASE;
    if (sprinting) {
      this.energy = Math.max(0, this.energy - 1 / (this.brain.stamina || 600));
    } else {
      this.energy = Math.min(1, this.energy + 0.002); // slow recovery
    }
    // Threat interrupt
    if(this.brain.prey&&this.alive&&globalTick%8===(Math.floor(this.seed)%8)&&this.state!==STATE.FLEE&&this.state!==STATE.ALERT){const threat=scanForThreat(this,animals);if(threat){this.state=STATE.FLEE;this.memory.fleeFrom={x:threat.x,y:threat.y};propagateAlarm(this,threat,animals);this._fiber=(function*(self){for(let i=0,dur=200+Math.floor(pcgHash(self.seed,globalTick,99)*300);i<dur&&self.alive;i++){const ft=self.memory.fleeFrom;if(ft){const dir=dirFrom(ft,self);self.targetVx=dir.dx*self.getSprintSpeed()+(pcgHash(Math.floor(self.x),i,self.seed)-0.5)*0.4;self.targetVy=dir.dy*self.getSprintSpeed()*0.15;}yield 1;}self.homeX=self.x;self.homeY=self.y;self.state=STATE.IDLE;self._fiber=behaviorLoop(self,()=>animals);self._yieldRemaining=30+Math.floor(pcgHash(self.seed,globalTick,77)*90);})(this);this._yieldRemaining=0;}}
    // Sleep pressure
    const isNight=simTime<5.5||simTime>20.5,isDeep=simTime<4||simTime>22;
    if(isNight&&this.alive&&this.state!==STATE.FLEE&&this.state!==STATE.REST&&this.state!==STATE.DEAD&&this.state!==STATE.EAT){const base=isDeep?0.025:0.008;if(pcgHash(globalTick&0xFFF,Math.floor(this.seed*137)&0xFFF,333)<base*(1+this.brain.restDesire)*(this.type==='lion'?0.2:1)*(this.brain.flying&&this.state===STATE.FLOCK?0.3:1)){this.state=STATE.REST;this.targetVx=0;this.targetVy=0;this._fiber=(function*(self){yield 900+Math.floor(pcgHash(self.seed,globalTick,55)*1800);self._fiber=behaviorLoop(self,()=>animals);self._yieldRemaining=30;})(this);this._yieldRemaining=0;}}
    // Step coroutine
    this._yieldRemaining--;if(this._yieldRemaining<=0){const result=this._fiber.next();this._yieldRemaining=(typeof result.value==='number')?result.value:60;if(result.done){this._fiber=behaviorLoop(this,()=>animals);this._yieldRemaining=60;}}
    // Physics
    const acc=this.state===STATE.FLEE?0.1:0.025;this.vx+=(this.targetVx-this.vx)*acc;this.vy+=(this.targetVy-this.vy)*acc;
    if(this.state===STATE.WANDER||this.state===STATE.GRAZE||this.state===STATE.WALK_GROUND){this.vx+=(pcgHash(globalTick,Math.floor(this.seed*1000),1)-0.5)*0.012;this.vy+=(pcgHash(globalTick,Math.floor(this.seed*1000),2)-0.5)*0.004;}
    const nearSeam = this.x < 20 || this.x > WORLD_W - 20;
    // Herding (elephants follow nearest mate in single file; others pull toward center)
    if(this.brain.herd&&this.alive&&!this.brain.flying&&this.state!==STATE.FLEE&&this.state!==STATE.CHASE){
      let hdx=0,hcy=0,hn=0;
      if (this.type === 'elephant') {
        // Follow nearest elephant that's ahead (single-file behavior)
        let nearest = null, nd = Infinity;
        for (const o of animals) {
          if (o === this || !o.alive || o.type !== 'elephant') continue;
          const d = dist(this, o);
          if (d < 60 && d > 8 && d < nd) { nearest = o; nd = d; }
        }
        if (nearest) {
          // Follow behind: aim for a point behind the leader
          const behind = wrapDeltaX(nearest.x - this.x);
          hdx = behind - Math.sign(behind) * 12; // stay 12px behind
          hcy = nearest.y; hn = 1;
        }
      } else {
        for(const o of animals){if(o===this||!o.alive||o.type!==this.type)continue;if(dist(this,o)<100){hdx+=wrapDeltaX(o.x-this.x);hcy+=o.y;hn++;}}
      }
      if(hn>0){
        const cdx=hdx/hn,cdy=hcy/hn-this.y,d=Math.hypot(cdx,cdy);
        if(d>15){
          const pull=this.brain.herdDesire*0.003*Math.min(d/50,1);
          const pullX = (cdx/d)*pull, pullY = (cdy/d)*pull*0.3;
          // Near seam: only apply herd pull if it agrees with current velocity direction
          // This prevents flip-flopping at the wrap boundary
          if (!nearSeam || Math.sign(pullX) === Math.sign(this.vx) || Math.abs(this.vx) < 0.005) {
            this.vx += pullX; this.vy += pullY;
          }
        }
      }
    }
    // Collision avoidance (force scales with speed so sprinting animals still dodge)
    if(!this.brain.flying||this.state===STATE.PERCH||this.state===STATE.WALK_GROUND){
      const ps=this.type==='elephant'?12:this.type==='giraffe'?8:5;
      const spd = Math.hypot(this.vx, this.vy);
      const pushBase = 0.04 + spd * 0.15; // stronger push at higher speeds
      for(const o of spatialGrid.query(this.x,this.y,ps)){
        if(o===this||!o.alive)continue;
        if(o.brain.flying&&o.state!==STATE.PERCH&&o.state!==STATE.WALK_GROUND)continue;
        // Don't dodge your own hunt target
        if(this.state===STATE.CHASE&&this.memory.huntTarget===o)continue;
        const dx=wrapDeltaX(this.x-o.x),dy=this.y-o.y,d=Math.hypot(dx,dy);
        if(d<ps&&d>0.1){const push=(ps-d)/ps*pushBase;this.vx+=(dx/d)*push;this.vy+=(dy/d)*push*0.3;}
      }
    }
    // Waterhole avoidance
    if(!this.brain.flying&&this.state!==STATE.DRINK){const wdx=wrapDeltaX(this.x-waterHole.x),wx=wdx/(waterHole.rx+3),wy=(this.y-waterHole.y)/(waterHole.ry+3),wd=wx*wx+wy*wy;if(wd<1){const d=Math.sqrt(wd)||0.1;this.vx+=(wx/d)*(1-d)*0.1*waterHole.rx;this.vy+=(wy/d)*(1-d)*0.1*waterHole.ry;}}
    // Vertical damping to prevent floating
    if(!this.brain.flying||this.state===STATE.PERCH||this.state===STATE.WALK_GROUND){this.vy*=0.88;const yDrift=this.y-this.homeY;if(Math.abs(yDrift)>15&&this.state!==STATE.FLEE&&this.state!==STATE.APPROACH_WATER&&this.state!==STATE.DRINK)this.vy-=yDrift*0.001;}
    this.x+=this.vx;this.y+=this.vy;if(!this.brain.flying||this.state===STATE.WALK_GROUND)this._walkDist+=Math.hypot(this.vx,this.vy);
    // Wrap X, soft-clamp Y
    if(this.brain.flying&&this.state!==STATE.PERCH&&this.state!==STATE.WALK_GROUND){this.x=wrapX(this.x);if(this.y<15){this.vy+=0.02;this.targetVy=Math.max(this.targetVy,0);}if(this.y>HORIZON-3){this.vy-=0.02;this.targetVy=Math.min(this.targetVy,0);}this.y=clamp(this.y,10,HORIZON);}else{this.x=wrapX(this.x);if(this.y<HORIZON+3){this.vy+=0.01;this.targetVy+=0.003;}else if(this.y>WORLD_H-15){this.vy-=0.01;this.targetVy-=0.003;}this.y=clamp(this.y,HORIZON+1,WORLD_H-5);}
    if(Math.abs(this.vx)>0.02)this.facing=this.vx>0?1:-1;
    // Seam anti-oscillation: lock velocity direction when crossing the boundary
    if (nearSeam) {
      this.homeX = this.x;
      if (!this._seamLock && Math.abs(this.vx) > 0.01) {
        this._seamLock = Math.sign(this.vx); // lock direction
        this._seamTimer = 90; // hold for 3 seconds
      }
    }
    if (this._seamTimer > 0) {
      this._seamTimer--;
      // Force velocity to maintain the locked direction
      if (Math.sign(this.vx) !== this._seamLock && Math.abs(this.vx) > 0.005) {
        this.vx = Math.abs(this.vx) * this._seamLock;
        this.targetVx = Math.abs(this.targetVx) * this._seamLock;
      }
      if (this._seamTimer <= 0) this._seamLock = 0;
    }
    if (Math.abs(wrapDeltaX(this.x - this.homeX)) > WORLD_W * 0.15) {
      this.homeX = this.x;
    }
    // Safety: fix NaN/invalid positions
    if(isNaN(this.x)||isNaN(this.y)){this.x=this.homeX;this.y=this.homeY;this.vx=0;this.vy=0;}
  }
  draw(ctx, vpx, vpy) {
    if(!this.alive&&this.state!==STATE.DEAD)return;const sx=worldToScreenX(this.x),sy=Math.floor(this.y-vpy);if(sx<-40||sx>PW+40||sy<-20||sy>PH+20)return;
    const horizonSy=HORIZON-vpy,isFlying=this.brain.flying&&this.state!==STATE.PERCH&&this.state!==STATE.WALK_GROUND;
    let depthScale=1;if(!isFlying&&sy>horizonSy)depthScale=0.85+((sy-horizonSy)/Math.max(1,PH-horizonSy))*0.25;
    const speed=Math.hypot(this.vx,this.vy),isMoving=speed>0.02,wp=this._walkDist*0.35;
    // Gazelle stotting: exaggerated bounce when alert (signaling to predator)
    const stotting = this.type === 'gazelle' && this.state === STATE.ALERT;
    const bob = stotting ? Math.abs(Math.sin(this.frame * 0.3)) * 3 : (isMoving ? Math.sin(wp*2)*0.6 : 0);
    // Breathing: sleeping animals gently rise/fall 1px on a slow cycle
    const isResting = this.state === STATE.REST && speed < 0.03;
    const breathe = isResting ? Math.round(Math.sin(this.frame * 0.04 + this.seed) * 0.5) : 0;
    ctx.save();ctx.translate(sx,sy+Math.round(-Math.abs(bob)*0.3)+breathe);if(depthScale!==1)ctx.scale(depthScale,depthScale);if(this.facing===-1)ctx.scale(-1,1);
    // Night dimming: animals appear as darker silhouettes at night
    const nightDim = getAmbient(simTime);
    if (nightDim < 0.5) ctx.globalAlpha = clamp(0.4 + nightDim * 1.2, 0.4, 1);
    if(this.state===STATE.DEAD){ctx.fillStyle="rgba(60,40,25,0.7)";ctx.fillRect(-3,-2,6,2);ctx.restore();return;}
    switch(this.type){case'zebra':this._sprZebra(ctx,wp,isMoving);break;case'gazelle':this._sprGazelle(ctx,wp,isMoving);break;case'wildebeest':this._sprWildebeest(ctx,wp,isMoving);break;case'warthog':this._sprWarthog(ctx,wp,isMoving);break;case'lion':this._sprLion(ctx,wp,isMoving);break;case'elephant':this._sprElephant(ctx,wp,isMoving);break;case'giraffe':this._sprGiraffe(ctx,wp,isMoving);break;case'bird':this._sprBird(ctx);break;}
    ctx.restore();
  }
  _legs(wp,m){if(!m)return{fl:0,fr:0,bl:0,br:0};const s=Math.sin(wp),c=Math.cos(wp);return{fl:Math.round(s),br:Math.round(s),fr:Math.round(c),bl:Math.round(c)};}
  _sprZebra(ctx,wp,m){
    if(this.state===STATE.REST&&Math.hypot(this.vx,this.vy)<0.03){
      // Lying down: compact body, no legs, tucked head
      ctx.fillStyle=rgb([220,220,220]);ctx.fillRect(-4,-2,8,2);
      ctx.fillStyle=rgb([25,25,25]);ctx.fillRect(-2,-2,1,2);ctx.fillRect(0,-2,1,2);ctx.fillRect(2,-2,1,2);
      ctx.fillStyle=rgb([210,210,210]);ctx.fillRect(3,-3,2,1); // head tucked
      ctx.fillStyle=rgb([15,15,15]);ctx.fillRect(4,-3,1,1); // eye
      return;
    }
    const hd=(this.state===STATE.GRAZE||this.state===STATE.DRINK)?3:0,l=this._legs(wp,m);ctx.fillStyle=rgb([225,225,225]);ctx.fillRect(-5,-5,10,4);ctx.fillStyle=rgb([25,25,25]);ctx.fillRect(-3,-5,1,4);ctx.fillRect(-1,-5,1,4);ctx.fillRect(1,-5,1,4);ctx.fillRect(3,-5,1,4);ctx.fillStyle=rgb([220,220,220]);ctx.fillRect(4,-7+hd,2,3);ctx.fillStyle=rgb([25,25,25]);ctx.fillRect(5,-6+hd,1,1);ctx.fillStyle=rgb([210,210,210]);ctx.fillRect(5,-8+hd,3,2);ctx.fillStyle=rgb([15,15,15]);ctx.fillRect(7,-8+hd,1,1);ctx.fillRect(6,-9+hd,1,1);ctx.fillStyle=rgb([30,30,30]);ctx.fillRect(3,-7+hd,3,1);ctx.fillStyle=rgb([35,35,35]);ctx.fillRect(-3+l.bl,-1,1,3);ctx.fillRect(-1+l.br,-1,1,3);ctx.fillRect(1+l.fl,-1,1,3);ctx.fillRect(3+l.fr,-1,1,3);// Tail swish: faster during hot midday (swatting flies)
    const isHot = simTime > 10 && simTime < 15;
    const swishSpeed = isHot && !m ? 15 : 30; // faster swish when idle in heat
    const tailOff = this.frame % (swishSpeed * 2) < swishSpeed ? 0 : -1;
    ctx.fillStyle=rgb([25,25,25]);
    ctx.fillRect(-6, -4 + tailOff, 1, 2);
    if (isHot && !m) ctx.fillRect(-7, -3 + tailOff, 1, 1); // wider swish in heat
  }
  _sprGazelle(ctx,wp,m){
    if(this.state===STATE.REST&&Math.hypot(this.vx,this.vy)<0.03){
      ctx.fillStyle=rgb([185,145,85]);ctx.fillRect(-3,-2,6,2);
      ctx.fillStyle=rgb([235,225,205]);ctx.fillRect(-2,-1,4,1);
      ctx.fillStyle=rgb([185,145,85]);ctx.fillRect(2,-3,2,1);
      ctx.fillStyle=rgb([20,20,15]);ctx.fillRect(3,-3,1,1);
      return;
    }
    const hd=(this.state===STATE.GRAZE||this.state===STATE.DRINK)?3:0,l=this._legs(wp,m);ctx.fillStyle=rgb([185,145,85]);ctx.fillRect(-4,-4,8,3);ctx.fillStyle=rgb([235,225,205]);ctx.fillRect(-3,-2,6,1);ctx.fillStyle=rgb([110,80,45]);ctx.fillRect(-4,-2,8,1);ctx.fillStyle=rgb([185,145,85]);ctx.fillRect(3,-6+hd,2,3);ctx.fillRect(4,-7+hd,2,2);ctx.fillStyle=rgb([235,225,205]);ctx.fillRect(5,-7+hd,1,1);ctx.fillStyle=rgb([20,20,15]);ctx.fillRect(5,-6+hd,1,1);ctx.fillStyle=rgb([50,40,25]);ctx.fillRect(4,-9+hd,1,2);ctx.fillRect(5,-10+hd,1,2);ctx.fillStyle=rgb([85,65,45]);ctx.fillRect(-2+l.bl,-1,1,3);ctx.fillRect(0+l.br,-1,1,3);ctx.fillRect(2+l.fl,-1,1,3);ctx.fillStyle=rgb([240,235,220]);ctx.fillRect(-5,-3,1,1);}
  _sprWildebeest(ctx,wp,m){
    if(this.state===STATE.REST&&Math.hypot(this.vx,this.vy)<0.03){
      ctx.fillStyle=rgb([70,65,55]);ctx.fillRect(-4,-2,8,2);
      ctx.fillStyle=rgb([55,50,42]);ctx.fillRect(3,-3,2,1);
      ctx.fillStyle=rgb([65,60,50]);ctx.fillRect(3,-4,2,2);
      ctx.fillStyle=rgb([20,15,10]);ctx.fillRect(4,-4,1,1);
      return;
    }
    const hd=(this.state===STATE.GRAZE||this.state===STATE.DRINK)?2:0,l=this._legs(wp,m);ctx.fillStyle=rgb([70,65,55]);ctx.fillRect(-5,-5,10,4);ctx.fillStyle=rgb([55,50,42]);ctx.fillRect(3,-4,3,3);ctx.fillStyle=rgb([65,60,50]);ctx.fillRect(5,-7+hd,3,3);ctx.fillStyle=rgb([40,35,25]);ctx.fillRect(6,-9+hd,1,2);ctx.fillRect(5,-9+hd,1,1);ctx.fillRect(7,-9+hd,1,1);ctx.fillStyle=rgb([20,15,10]);ctx.fillRect(7,-6+hd,1,1);ctx.fillStyle=rgb([50,45,35]);ctx.fillRect(3,-6+hd,3,1);ctx.fillStyle=rgb([50,45,38]);ctx.fillRect(-3+l.bl,-1,1,3);ctx.fillRect(-1+l.br,-1,1,3);ctx.fillRect(1+l.fl,-1,1,3);ctx.fillRect(3+l.fr,-1,1,3);ctx.fillStyle=rgb([35,30,25]);ctx.fillRect(-6,-4,1,2);}
  _sprWarthog(ctx,wp,m){
    const grazing=this.state===STATE.GRAZE;
    const tailUp=this.state===STATE.FLEE;
    const l=this._legs(wp,m);
    // Body (tilts forward when grazing — kneeling on front legs)
    const tilt = grazing ? 1 : 0;
    ctx.fillStyle=rgb([100,90,75]);ctx.fillRect(-3,-3+tilt,7,3);
    // Head (lower when grazing)
    ctx.fillStyle=rgb([95,85,70]);ctx.fillRect(3,-4+tilt*2,3,3);ctx.fillRect(5,-3+tilt*2,2,2);
    // Tusks
    ctx.fillStyle=rgb([230,225,210]);ctx.fillRect(6,-4+tilt*2,1,1);
    // Warts
    ctx.fillStyle=rgb([120,100,75]);ctx.fillRect(4,-4+tilt*2,1,1);
    // Eye
    ctx.fillStyle=rgb([20,15,10]);ctx.fillRect(4,-3+tilt*2,1,1);
    // Legs (front legs bent when grazing)
    ctx.fillStyle=rgb([70,60,50]);
    ctx.fillRect(-2+l.bl,0,1,2);
    ctx.fillRect(0+l.br,0,1,2);
    if (grazing) {
      // Front legs folded (kneeling)
      ctx.fillRect(2,0+tilt,1,1);
    } else {
      ctx.fillRect(2+l.fl,0,1,2);
    }
    // Tail
    ctx.fillStyle=rgb([60,50,40]);
    if(tailUp){ctx.fillRect(-4,-5,1,3);ctx.fillRect(-4,-6,1,1);}
    else ctx.fillRect(-4,-2+tilt,1,2);
  }
  _sprLion(ctx,wp,m){const eating=this.state===STATE.EAT,crouch=this.state===STATE.STALK?2:0,resting=this.state===STATE.REST&&Math.hypot(this.vx,this.vy)<0.03,l=this._legs(wp,m||this.state===STATE.CHASE);
    if(resting){ctx.fillStyle=rgb([190,150,65]);ctx.fillRect(-5,-2,10,2);ctx.fillStyle=rgb([165,120,45]);ctx.fillRect(3,-4,5,3);ctx.fillStyle=rgb([190,150,65]);ctx.fillRect(6,-3,2,2);ctx.fillStyle=rgb([35,25,10]);ctx.fillRect(7,-3,1,1);ctx.fillStyle=rgb([120,85,35]);ctx.fillRect(-6,-1,1,1);return;}
    if(eating){ctx.fillStyle=rgb([195,155,68]);ctx.fillRect(-5,-4,10,4);ctx.fillStyle=rgb([160,115,42]);ctx.fillRect(3,-6,5,4);ctx.fillRect(2,-7,6,2);ctx.fillStyle=rgb([180,140,60]);ctx.fillRect(5,-2,3,2);ctx.fillStyle=rgb([55,35,15]);ctx.fillRect(7,-1,1,1);ctx.fillStyle=rgb([155,115,50]);ctx.fillRect(-3,0,1,3);ctx.fillRect(-1,0,1,3);ctx.fillRect(2,0,1,3);ctx.fillRect(4,0,1,3);ctx.fillStyle=rgb([170,130,55]);ctx.fillRect(-6,-3+Math.round(Math.sin(this.frame*0.06)),2,1);return;}
    ctx.fillStyle=rgb([195,155,68]);ctx.fillRect(-5,-4+crouch,10,4);ctx.fillStyle=rgb([175,135,55]);ctx.fillRect(-4,-4+crouch,8,1);ctx.fillStyle=rgb([160,115,42]);ctx.fillRect(3,-7+crouch,5,5);ctx.fillRect(2,-8+crouch,6,2);ctx.fillStyle=rgb([185,140,55]);ctx.fillRect(3,-8+crouch,4,1);ctx.fillStyle=rgb([180,140,60]);ctx.fillRect(6,-6+crouch,2,3);ctx.fillStyle=rgb([55,35,15]);ctx.fillRect(7,-5+crouch,1,1);ctx.fillStyle=rgb([35,25,10]);ctx.fillRect(7,-6+crouch,1,1);ctx.fillStyle=rgb([155,115,50]);ctx.fillRect(-3+l.bl,crouch,1,3-crouch);ctx.fillRect(-1+l.br,crouch,1,3-crouch);ctx.fillRect(2+l.fl,crouch,1,3-crouch);ctx.fillRect(4+l.fr,crouch,1,3-crouch);const tw=Math.sin(this.frame*0.06);ctx.fillStyle=rgb([170,130,55]);ctx.fillRect(-6,-3+crouch+Math.round(tw),2,1);ctx.fillStyle=rgb([140,100,40]);ctx.fillRect(-7,-2+crouch+Math.round(tw),1,1);}
  _sprElephant(ctx,wp,m){
    const drinking = this.state === STATE.DRINK;
    const resting = this.state === STATE.REST && Math.hypot(this.vx, this.vy) < 0.03;
    const l = this._legs(wp * 0.7, m);
    // Body (lighter edge for night visibility)
    ctx.fillStyle = rgb([100, 95, 85]);
    ctx.fillRect(-6, -8, 13, 8);
    ctx.fillRect(-5, -9, 11, 1);
    // Lighter top edge for silhouette contrast
    ctx.fillStyle = rgb([115, 110, 100]);
    ctx.fillRect(-5, -9, 11, 1);
    // Belly
    ctx.fillStyle = rgb([110, 105, 95]);
    ctx.fillRect(-5, -1, 10, 1);
    // Head
    ctx.fillStyle = rgb([100, 95, 85]);
    ctx.fillRect(6, -9, 4, 6);
    ctx.fillRect(5, -10, 4, 2);
    // Ear flap (faster in heat — thermoregulation)
    ctx.fillStyle = rgb([85, 80, 72]);
    const earSpeed = (simTime > 10 && simTime < 15) ? 0.06 : 0.025;
    const ef = Math.sin(this.frame * earSpeed) > 0.3 ? 1 : 0;
    ctx.fillRect(4 - ef, -10, 3 + ef, 4);
    ctx.fillStyle = rgb([115, 100, 85]);
    ctx.fillRect(5 - ef, -9, 1, 2);
    // Eye
    ctx.fillStyle = rgb([30, 25, 20]);
    ctx.fillRect(8, -8, 1, 1);
    // Trunk (raised when drinking, swinging otherwise)
    ctx.fillStyle = rgb([92, 87, 77]);
    if (drinking) {
      // Trunk raised, spraying water
      ctx.fillRect(8, -6, 1, 3);
      ctx.fillRect(9, -7, 1, 2);
      ctx.fillRect(9, -8, 1, 1);
      // Water spray particles from trunk tip
      if (this.frame % 12 < 6) {
        ctx.fillStyle = `rgba(100,140,180,0.5)`;
        ctx.fillRect(10, -9, 1, 1);
        ctx.fillRect(9, -10, 1, 1);
        ctx.fillRect(8, -9, 1, 1);
      }
    } else if (this.state === STATE.IDLE && this.frame % 300 < 40) {
      // Dust bathing: trunk swings up and over, spraying dirt
      const phase = (this.frame % 300) / 40; // 0-1 through the animation
      if (phase < 0.4) {
        // Trunk reaching down to scoop
        ctx.fillRect(8, -3, 1, 4);
        ctx.fillRect(9, 1, 1, 1);
      } else if (phase < 0.7) {
        // Trunk swinging up
        ctx.fillRect(8, -6, 1, 3);
        ctx.fillRect(9, -8, 1, 2);
        // Dirt particles flying
        ctx.fillStyle = `rgba(130,110,70,0.6)`;
        ctx.fillRect(6, -10, 1, 1);
        ctx.fillRect(3, -11, 1, 1);
        ctx.fillRect(0, -10, 1, 1);
        ctx.fillRect(-2, -9, 1, 1);
      } else {
        // Trunk settling back down
        ctx.fillRect(8, -5, 1, 3);
        ctx.fillRect(9, -3, 1, 2);
        // Dust settling on back
        ctx.fillStyle = `rgba(130,110,70,0.3)`;
        ctx.fillRect(-3, -9, 6, 1);
      }
    } else {
      const ts = Math.sin(this.frame * 0.03);
      ctx.fillRect(8, -4, 1, 4);
      ctx.fillRect(9, -1 + Math.round(ts * 0.5), 1, 2);
      ctx.fillRect(9, 1 + Math.round(ts), 1, 1);
    }
    // Tusks
    ctx.fillStyle = rgb([235, 230, 215]);
    ctx.fillRect(9, -5, 1, 2);
    // Legs (not drawn if resting)
    if (!resting) {
      ctx.fillStyle = rgb([82, 78, 68]);
      ctx.fillRect(-4 + l.bl, 0, 2, 4);
      ctx.fillRect(-1 + l.br, 0, 2, 4);
      ctx.fillRect(2 + l.fl, 0, 2, 4);
      ctx.fillRect(5 + l.fr, 0, 2, 4);
    }
    // Tail
    ctx.fillStyle = rgb([70, 65, 55]);
    ctx.fillRect(-7, -7, 1, 2);
    ctx.fillRect(-8, -6, 1, 2);
  }
  _sprGiraffe(ctx,wp,m){
    // Giraffes browse UP from trees (head raised), graze DOWN only when no tree nearby
    const nearTree = this.state===STATE.GRAZE && trees.some(t => dist(this, t) < 25);
    const hd = this.state===STATE.DRINK ? 8 : (nearTree ? -3 : (this.state===STATE.GRAZE ? 4 : 0));
    const l=this._legs(wp*0.8,m);
    // Neck sway when walking (subtle 1px oscillation at the top)
    const neckSway = m ? Math.round(Math.sin(wp * 0.8) * 0.8) : 0;
    // Body
    ctx.fillStyle=rgb([195,165,100]);ctx.fillRect(-3,-5,7,5);
    // Spots
    ctx.fillStyle=rgb([140,105,55]);ctx.fillRect(-2,-4,2,2);ctx.fillRect(1,-3,2,2);ctx.fillRect(0,-5,1,1);
    // Neck (with sway at top)
    ctx.fillStyle=rgb([195,165,100]);
    for (let ny = 0; ny < 10; ny++) {
      const sw = Math.round(neckSway * ny / 10); // sway increases toward top
      ctx.fillRect(3 + sw, -14 + hd + ny, 2, 1);
    }
    // Neck spots
    ctx.fillStyle=rgb([140,105,55]);ctx.fillRect(3+neckSway,-12+hd,1,2);ctx.fillRect(4+neckSway,-9+hd,1,2);ctx.fillRect(3,-7+hd,1,1);
    // Head (follows neck sway)
    ctx.fillStyle=rgb([195,165,100]);ctx.fillRect(4+neckSway,-15+hd,2,2);
    ctx.fillStyle=rgb([140,120,80]);ctx.fillRect(4+neckSway,-17+hd,1,2);ctx.fillRect(5+neckSway,-16+hd,1,1);
    ctx.fillStyle=rgb([20,15,10]);ctx.fillRect(5+neckSway,-15+hd,1,1);
    // Legs
    ctx.fillStyle=rgb([170,140,85]);ctx.fillRect(-2+l.bl,0,1,5);ctx.fillRect(0+l.br,0,1,5);ctx.fillRect(2+l.fl,0,1,5);ctx.fillRect(3+l.fr,0,1,5);
    // Tail
    ctx.fillStyle=rgb([100,80,50]);ctx.fillRect(-4,-4,1,2);ctx.fillRect(-5,-3,1,1);
  }
  _sprBird(ctx){const onGround=this.state===STATE.PERCH||this.state===STATE.WALK_GROUND;if(onGround){ctx.fillStyle=rgb([55,48,42]);ctx.fillRect(0,-3,2,2);ctx.fillRect(-1,-2,1,1);ctx.fillStyle=rgb([90,65,30]);ctx.fillRect(3,-3,1,1);ctx.fillStyle=rgb([15,12,10]);ctx.fillRect(2,-3,1,1);ctx.fillStyle=rgb([65,50,35]);ctx.fillRect(0,-1,1,2);ctx.fillRect(1,-1,1,2);}else{const fs=0.10+(this.seed%100)/100*0.08,fp=this.seed*6.28,wu=Math.round(Math.sin(this.frame*fs+fp)*2);ctx.fillStyle=rgb([42,38,34]);ctx.fillRect(0,0,1,1);ctx.fillRect(-1,-1,1,1);ctx.fillRect(-2,-1-wu,1,1);ctx.fillRect(-3,-1-wu-(wu>0?1:0),1,1);ctx.fillRect(1,-1,1,1);ctx.fillRect(2,-1-wu,1,1);ctx.fillRect(3,-1-wu-(wu>0?1:0),1,1);}}
}

// ── Populate ──
let animals = [];
function spawnAnimal(type) { let x,y; switch(type){case'zebra':x=rand(100,WORLD_W-100);y=rand(HORIZON+20,HORIZON+50);break;case'gazelle':x=rand(100,WORLD_W-100);y=rand(HORIZON+15,HORIZON+40);break;case'wildebeest':x=rand(100,WORLD_W-100);y=rand(HORIZON+30,HORIZON+60);break;case'warthog':x=rand(50,WORLD_W-50);y=rand(HORIZON+25,HORIZON+65);break;case'lion':x=rand(100,WORLD_W-100);y=rand(HORIZON+40,HORIZON+80);{const l=new Animal('lion',x,y);l.memory.hunger=rand(35,60);return l;}case'elephant':x=rand(50,WORLD_W-50);y=rand(HORIZON+25,HORIZON+55);break;case'giraffe':x=rand(100,WORLD_W-100);y=rand(HORIZON+12,HORIZON+45);break;case'bird':x=rand(50,WORLD_W-50);y=rand(25,HORIZON-10);break;default:x=rand(50,WORLD_W-50);y=rand(HORIZON+20,HORIZON+60);} return new Animal(type,x,y); }
function populateAnimals() { animals=[]; for(const[type,count]of Object.entries(CFG.animalCounts)) for(let i=0;i<count;i++) animals.push(spawnAnimal(type)); }
populateAnimals();
function syncAnimalCounts() { for(const[type,target]of Object.entries(CFG.animalCounts)){const cur=animals.filter(a=>a.type===type&&a.alive);let diff=target-cur.length;if(diff>0)for(let i=0;i<diff;i++)animals.push(spawnAnimal(type));else if(diff<0){let rm=-diff;for(let i=animals.length-1;i>=0&&rm>0;i--)if(animals[i].type===type&&animals[i].alive){animals.splice(i,1);rm--;}}} }
function respawnCheck(tick) {
  if (tick % 300 !== 0) return; // check every 10s
  const dead = animals.filter(a => !a.alive && a.brain.prey);
  for (const d of dead) {
    const aliveOfType = animals.filter(a => a.type === d.type && a.alive).length;
    const target = CFG.animalCounts[d.type] || 0;
    if (aliveOfType >= target) continue;
    // Higher respawn chance when population is low
    const urgency = 1 - aliveOfType / Math.max(1, target); // 0=full, 1=empty
    const chance = 0.3 + urgency * 0.5; // 30%-80% depending on how depleted
    if (Math.random() < chance) {
      d.x = rand(0, WORLD_W);
      d.y = rand(HORIZON + 15, HORIZON + 70);
      d.alive = true;
      d.state = STATE.IDLE;
      d.vx = 0; d.vy = 0;
      d.targetVx = 0; d.targetVy = 0;
      d.memory = { lastWater: -9999, thirst: rand(10, 40), hunger: rand(10, 40),
        fear: 0, threats: [], huntTarget: null, fleeFrom: null };
      d.homeX = d.x; d.homeY = d.y;
      d._fiber = behaviorLoop(d, () => animals);
      d._yieldRemaining = randInt(30, 120);
    }
  }
  // Hard floor: if total alive drops below 50% of expected, force-spawn missing
  const totalExpected = Object.values(CFG.animalCounts).reduce((s, v) => s + v, 0);
  const totalAlive = animals.filter(a => a.alive).length;
  if (totalAlive < totalExpected * 0.5) {
    syncAnimalCounts();
  }
}

// ── Background Rendering ──
const bgCanvas = document.createElement("canvas"); bgCanvas.width=PW;bgCanvas.height=PH;
const bgCtx = bgCanvas.getContext("2d");
let lastBgTime=-999, lastBgVpx=-999; bgDirty=true;

function renderBg() {
  const t=simTime,sky=getSkyColors(t),amb=getAmbient(t),hS=HORIZON-VP.y;
  // Sky with enhanced twilight band
  // During golden hour, add a warm bright band just above the horizon
  const isTwilight = (t > 5 && t < 8) || (t > 16.5 && t < 20);
  const twilightIntensity = isTwilight
    ? (t < 12 ? 1 - Math.abs(t - 6.5) / 1.5 : 1 - Math.abs(t - 18) / 1.5)
    : 0;
  // Twilight band color: bright warm orange near horizon
  const twBand = [
    clamp(sky.low[0] + 40 * twilightIntensity, 0, 255),
    clamp(sky.low[1] + 20 * twilightIntensity, 0, 255),
    clamp(sky.low[2] - 10 * twilightIntensity, 0, 255),
  ];

  for (let y = 0; y < PH; y++) {
    const wy = y + VP.y;
    if (wy >= HORIZON) break;
    const f = wy / HORIZON;
    let c;
    if (f < 0.35) c = lerpColor(sky.top, sky.mid, f / 0.35);
    else if (f < 0.7) c = lerpColor(sky.mid, sky.low, (f - 0.35) / 0.35);
    else if (f < 0.88) c = lerpColor(sky.low, twBand, (f - 0.7) / 0.18);
    else c = lerpColor(twBand, [clamp(twBand[0]+15,0,255), clamp(twBand[1]+10,0,255), clamp(twBand[2]+5,0,255)], (f - 0.88) / 0.12);
    bgCtx.fillStyle = rgb(c);
    bgCtx.fillRect(0, y, PW, 1);
  }
  // Stars + Milky Way
  if(amb<0.35){const sb=(0.35-amb)/0.35;
    // Milky Way band: diagonal arc across the sky with dense faint stars
    if (sb > 0.3) {
      const mwAlpha = (sb - 0.3) / 0.7; // only visible in deeper night
      // The band curves from bottom-left to upper-right
      for (let px = 0; px < PW; px++) {
        // Band center y follows a gentle curve
        const bandCenter = hS * (0.25 + 0.3 * (px / PW)) + Math.sin(px * 0.03) * 8;
        const bandWidth = 18 + Math.sin(px * 0.02 + 1) * 6; // 12-24px wide
        for (let i = 0; i < 3; i++) {
          // Hash-placed dots within the band
          const dotY = bandCenter + (pcgHash(px, i, 9001) - 0.5) * bandWidth;
          if (dotY < 2 || dotY >= hS - 2) continue;
          const distFromCenter = Math.abs(dotY - bandCenter) / (bandWidth * 0.5);
          const fade = (1 - distFromCenter * distFromCenter); // gaussian-ish
          // Diffuse glow
          const ga = mwAlpha * fade * 0.04;
          if (ga > 0.003) {
            bgCtx.fillStyle = `rgba(200,210,240,${ga})`;
            bgCtx.fillRect(px, Math.floor(dotY), 1, 1);
          }
          // Occasional bright star within the band
          if (pcgHash(px, i + 10, 9002) < 0.15) {
            const sa = mwAlpha * fade * 0.35;
            bgCtx.fillStyle = `rgba(240,240,255,${clamp(sa, 0, 0.6)})`;
            bgCtx.fillRect(px, Math.floor(dotY), 1, 1);
          }
        }
      }
      // Broader diffuse glow behind the band (subtle)
      for (let py = 0; py < hS; py++) {
        const bandCenter = hS * (0.25 + 0.3 * (PW * 0.5 / PW)) + Math.sin(PW * 0.5 * 0.03) * 8;
        const d = Math.abs(py - bandCenter);
        if (d < 25) {
          const ga = mwAlpha * (1 - d / 25) * 0.015;
          bgCtx.fillStyle = `rgba(180,190,220,${ga})`;
          bgCtx.fillRect(0, py, PW, 1);
        }
      }
    }
    // Regular stars
    for(let i=0;i<starPoints.length;i++){const sp=starPoints[i],sx=Math.floor(sp.x),sy=Math.floor(sp.y);if(sy>=hS||sy<=0||sx<0||sx>=PW)continue;const tw=0.6+0.4*Math.sin(t*0.8+i*1.7),br=sp.hash<0.1?1:sp.hash<0.3?0.7:0.4,a=sb*br*tw;bgCtx.fillStyle=`rgba(255,255,240,${clamp(a,0,0.9)})`;bgCtx.fillRect(sx,sy,1,1);if(sp.hash<0.08){bgCtx.fillStyle=`rgba(255,255,240,${clamp(a*0.4,0,0.4)})`;bgCtx.fillRect(sx+1,sy,1,1);bgCtx.fillRect(sx,sy+1,1,1);}}

    // Southern Cross constellation (Crux) - iconic from African latitudes
    if (sb > 0.5) {
      const cruxX = Math.floor(PW * 0.65), cruxY = Math.floor(hS * 0.35);
      const cruxAlpha = sb * 0.85;
      const cruxStars = [
        [0, -8],   // Alpha (Acrux, bottom)
        [0, 8],    // Gamma (top)
        [-6, 0],   // Delta (left)
        [5, 0],    // Beta (right, Mimosa)
        [-1, 3],   // Epsilon (dimmer, off-center)
      ];
      // Draw connecting lines first (faint)
      bgCtx.strokeStyle = `rgba(200,210,240,${cruxAlpha * 0.08})`;
      bgCtx.lineWidth = 0.5;
      bgCtx.beginPath();
      bgCtx.moveTo(cruxX + cruxStars[0][0], cruxY + cruxStars[0][1]);
      bgCtx.lineTo(cruxX + cruxStars[1][0], cruxY + cruxStars[1][1]);
      bgCtx.moveTo(cruxX + cruxStars[2][0], cruxY + cruxStars[2][1]);
      bgCtx.lineTo(cruxX + cruxStars[3][0], cruxY + cruxStars[3][1]);
      bgCtx.stroke();
      // Draw stars
      for (let si = 0; si < cruxStars.length; si++) {
        const [dx, dy] = cruxStars[si];
        const bright = si < 4 ? 0.9 : 0.5; // epsilon is dimmer
        bgCtx.fillStyle = `rgba(220,230,255,${cruxAlpha * bright})`;
        bgCtx.fillRect(cruxX + dx, cruxY + dy, 1, 1);
        if (si < 2) { // alpha and gamma get glow
          bgCtx.fillStyle = `rgba(200,210,240,${cruxAlpha * bright * 0.3})`;
          bgCtx.fillRect(cruxX + dx + 1, cruxY + dy, 1, 1);
          bgCtx.fillRect(cruxX + dx, cruxY + dy + 1, 1, 1);
        }
      }
    }
  if(!getSunPos(t)){const mp=(t<12)?(t+12):(t-12),ma=(mp-6)/12*Math.PI;if(ma>0&&ma<Math.PI){const mx=Math.floor(WORLD_W*0.15+(WORLD_W*0.7)*((mp-6)/12)-VP.x),my=Math.floor(HORIZON-Math.sin(ma)*55-VP.y);if(mx>-15&&mx<PW+15&&my>0&&my<hS){const R=7;for(let r=R+8;r>R;r--){bgCtx.fillStyle=`rgba(180,200,230,${0.04*(1-(r-R)/8)*sb})`;for(let dy=-r;dy<=r;dy++){const hw=Math.floor(Math.sqrt(r*r-dy*dy)),py=my+dy;if(py>=0&&py<hS)bgCtx.fillRect(mx-hw,py,hw*2,1);}}bgCtx.fillStyle=rgb([220,225,235]);for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++)if(dx*dx+dy*dy<=R*R&&my+dy>=0&&my+dy<hS)bgCtx.fillRect(mx+dx,my+dy,1,1);bgCtx.fillStyle=rgb([195,200,210]);bgCtx.fillRect(mx-2,my-1,2,2);bgCtx.fillRect(mx+2,my+1,1,1);bgCtx.fillRect(mx-1,my+2,2,1);}}}}
  // Hills
  for(let pass=0;pass<2;pass++){const hcBase=pass===0?[70,55,40]:[60,48,32];for(let px=0;px<PW;px++){const wx=wrapX(px+VP.x),phase=pass*2.1,hh=4+Math.sin(wx*0.015+phase)*3+Math.sin(wx*0.04+phase)*1.5+Math.sin(wx*0.007+phase)*5,hTop=Math.floor(hS-hh);for(let py=hTop;py<hS;py++){if(py>=0&&py<PH){const ft=(py-hTop)/(hS-hTop),base=lerpColor(hcBase,[85,70,38],ft);bgCtx.fillStyle=rgb([Math.round(base[0]*amb),Math.round(base[1]*amb),Math.round(base[2]*amb)]);bgCtx.fillRect(px,py,1,1);}}}}
  // Kopjes (rock outcrops on the horizon - iconic savanna features)
  const kopjePositions = [
    { wx: 280, w: 12, h: 8 }, // small rocky bump
    { wx: 520, w: 18, h: 12 }, // larger kopje
    { wx: 680, w: 8, h: 6 },  // distant small one
  ];
  for (const kp of kopjePositions) {
    const ksx = worldToScreenX(kp.wx);
    if (ksx < -20 || ksx > PW + 20) continue;
    const kc = [Math.round(55 * amb), Math.round(48 * amb), Math.round(38 * amb)];
    // Rocky shape: wider base, irregular top
    for (let dy = 0; dy < kp.h; dy++) {
      const t = dy / kp.h; // 0=top, 1=base
      const w = Math.floor(kp.w * (0.4 + t * 0.6)); // narrow top, wide base
      const irregularity = Math.round((pcgHash(kp.wx + dy, dy, 7654) - 0.5) * 3);
      const py = hS - kp.h + dy;
      if (py >= 0 && py < PH) {
        // Slightly lighter on top
        const shade = 1 - t * 0.2;
        bgCtx.fillStyle = rgb([Math.round(kc[0] * shade), Math.round(kc[1] * shade), Math.round(kc[2] * shade)]);
        bgCtx.fillRect(ksx - Math.floor(w / 2) + irregularity, py, w, 1);
      }
    }
    // Highlight on sun-facing side
    const kpSun = getSunPos(t);
    if (kpSun) {
      const side = kpSun.x > kp.wx ? 1 : -1;
      bgCtx.fillStyle = `rgba(180,160,120,${0.08 * amb})`;
      for (let dy = 1; dy < kp.h - 1; dy++) {
        const py = hS - kp.h + dy;
        if (py >= 0 && py < PH) bgCtx.fillRect(ksx + side * Math.floor(kp.w * 0.3), py, 2, 1);
      }
    }
  }
  // Treeline
  if(hS>0){bgCtx.fillStyle=`rgba(${Math.round(35*amb)},${Math.round(42*amb)},${Math.round(20*amb)},0.6)`;for(let px=0;px<PW;px++){const wx=wrapX(px+VP.x),th=2+Math.sin(wx*0.08)*1.5+Math.sin(wx*0.2)*0.8+(Math.sin(wx*0.35)>0.3?2:0),ty=Math.floor(hS-th);if(ty>=0&&ty<PH)bgCtx.fillRect(px,ty,1,Math.ceil(th));}}
  // Ground
  // Ground: fast line-by-line with per-line noise
  const gY=Math.max(0,hS);
  for(let y=gY;y<PH;y++){
    const wy=y+VP.y,ft=(wy-HORIZON)/(WORLD_H-HORIZON);
    const r=lerp(85,55,ft)*amb,g=lerp(70,45,ft)*amb,b=lerp(38,22,ft)*amb;
    const n=(pcgHash(0,wy,WORLD_SEED+1001)-0.5)*6;
    bgCtx.fillStyle=rgb([clamp(r+n,0,255),clamp(g+n,0,255),clamp(b+n*0.5,0,255)]);
    bgCtx.fillRect(0,y,PW,1);
  }
  // Trampled ground around waterhole (darker, muddier from animal traffic)
  const whScrX = worldToScreenX(waterHole.x), whScrY = Math.floor(waterHole.y - VP.y);
  if (whScrX > -60 && whScrX < PW + 60 && whScrY > 0 && whScrY < PH) {
    const trampR = waterHole.rx + 15;
    bgCtx.fillStyle = `rgba(40,30,15,${0.06 * amb})`;
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -trampR; dx <= trampR; dx++) {
        const d = Math.hypot(dx / trampR, dy / 8);
        if (d > 0.6 && d < 1.0 && pcgHash(Math.abs(dx), Math.abs(dy), WORLD_SEED + 8888) < 0.5) {
          bgCtx.fillRect(whScrX + dx, whScrY + dy, 1, 1);
        }
      }
    }
  }
  // Rocks+grass+shadows (wrap-aware)
  for(const rock of rockPoints){const rx=worldToScreenX(rock.x),ry=Math.floor(rock.y-VP.y);if(rx<-5||rx>=PW+5||ry<0||ry>=PH)continue;const sz=1+Math.floor(rock.hash*2.5);bgCtx.fillStyle=`rgba(25,18,10,${0.12*amb})`;bgCtx.fillRect(rx-sz,ry+1,sz*2,1);const rc=Math.round((70+rock.hash*15)*amb),gc=Math.round((65+rock.hash*12)*amb),bc=Math.round((55+rock.hash*10)*amb);bgCtx.fillStyle=rgb([rc,gc,bc]);bgCtx.fillRect(rx,ry-sz,sz,sz+1);bgCtx.fillStyle=rgb([Math.min(255,rc+15),Math.min(255,gc+12),Math.min(255,bc+8)]);bgCtx.fillRect(rx,ry-sz,sz,1);}
  const grassC=[[85,78,28],[75,85,30],[95,80,25],[70,65,25],[80,90,32]];for(const g of grassTufts){const gx=worldToScreenX(g.x),gy=Math.floor(g.y-VP.y);if(gx<0||gx>=PW||gy<0||gy>=PH)continue;const v=Math.floor(g.hash*grassC.length),h=2+Math.floor(g.hash*3),c=grassC[v];bgCtx.fillStyle=`rgba(${Math.round(c[0]*amb)},${Math.round(c[1]*amb)},${Math.round(c[2]*amb)},0.7)`;bgCtx.fillRect(gx,gy-h,1,h);if(g.hash>0.3)bgCtx.fillRect(gx-1,gy-Math.floor(h*0.6),1,Math.floor(h*0.5));if(g.hash>0.15)bgCtx.fillRect(gx+1,gy-Math.floor(h*0.7),1,Math.floor(h*0.6));}
  const sun=getSunPos(t);if(sun)for(let i=0;i<20;i++){bgCtx.fillStyle=`rgba(210,155,75,${0.09*(1-i/20)*amb})`;bgCtx.fillRect(0,hS-3+i,PW,1);}
  if(sun&&(t<8||t>16)){const w=(t<8)?(8-t)/2:(t-16)/2,wa=clamp(w*0.06,0,0.1);if(wa>0.01){bgCtx.fillStyle=`rgba(220,150,50,${wa})`;bgCtx.fillRect(0,hS,PW,PH-hS);}}
  // First light: bright line at horizon before sunrise / after sunset
  // Visible from ~5:00-6:00 (pre-dawn) and ~18:30-19:30 (post-sunset)
  const isPreDawn = t > 4.8 && t < 6.2;
  const isPostSunset = t > 18.3 && t < 19.5;
  if (isPreDawn || isPostSunset) {
    const progress = isPreDawn
      ? clamp((t - 4.8) / 1.4, 0, 1)  // 0 at 4:48, 1 at 6:12
      : clamp(1 - (t - 18.3) / 1.2, 0, 1); // 1 at 18:18, 0 at 19:30
    // Thin bright band right at horizon
    const bandH = 3 + Math.floor(progress * 4); // 3-7px tall
    for (let i = 0; i < bandH; i++) {
      const py = hS - i - 1;
      if (py < 0 || py >= PH) continue;
      const fade = (1 - i / bandH);
      // Pre-dawn: starts cool (blue-white), warms to orange
      const warmth = isPreDawn ? clamp((t - 5.2) / 0.8, 0, 1) : clamp((19.2 - t) / 0.8, 0, 1);
      const r = Math.round(lerp(160, 255, warmth));
      const g = Math.round(lerp(170, 180, warmth));
      const b = Math.round(lerp(200, 100, warmth));
      const a = progress * fade * 0.25;
      bgCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
      bgCtx.fillRect(0, py, PW, 1);
    }
  }
  // Tree shadows: direction and length based on sun/moon elevation
  const lightSrc = sun || getMoonPos(t);
  const shadowDir = lightSrc ? clamp(Math.sign(VP.x + PW/2 - lightSrc.x), -1, 1) : -1;
  const shadowAlpha = sun ? 0.12 * amb : (lightSrc ? 0.035 : 0);
  const sunElev = sun ? Math.sin(sun.angle) : 0.5; // 0=horizon, 1=zenith
  const treeShadowStretch = 1 + (1 - sunElev) * 2.5; // 1x at noon, 3.5x at horizon
  if (shadowAlpha > 0.005) {
    for (const tr of trees) {
      const x = worldToScreenX(tr.x), y = Math.floor(tr.y - VP.y);
      if (x > -30 && x < PW + 30) {
        const sLen = Math.round(tr.s * 10 * treeShadowStretch);
        bgCtx.fillStyle = `rgba(20,15,10,${shadowAlpha})`;
        const sOff = shadowDir < 0 ? -sLen : 0;
        bgCtx.fillRect(x + sOff, y - 1, sLen, 2);
        // Thicker shadow at low sun
        if (treeShadowStretch > 1.5) bgCtx.fillRect(x + sOff + 2, y, sLen - 4, 1);
      }
    }
  }
  for(const s of shrubs){const x=worldToScreenX(s.x),y=Math.floor(s.y-VP.y);if(x>-10&&x<PW+10){bgCtx.fillStyle=`rgba(20,15,10,${0.08*amb})`;bgCtx.fillRect(x-s.s*3,y+1,s.s*3,1);}}
  for(let i=0;i<16;i++){const a=0.35*(1-i/16)*(1-i/16);bgCtx.fillStyle=`rgba(8,6,3,${a})`;bgCtx.fillRect(0,i,PW,1);bgCtx.fillRect(0,PH-1-i,PW,1);bgCtx.fillRect(i,0,1,PH);bgCtx.fillRect(PW-1-i,0,1,PH);}
  lastBgTime=t;lastBgVpx=VP.x;bgDirty=false;
}

// ── Sun (foreground for smooth movement) ──
function drawSunFG() { const t=simTime,sun=getSunPos(t);if(!sun)return;const sc=getSunColor(t),amb=getAmbient(t),hS=HORIZON-VP.y,sx=worldToScreenX(sun.x),sy=Math.floor(sun.y-VP.y);if(sy>=hS||sy<-40)return;const R=11;for(let r=R+20;r>R;r--){const a=0.08*(1-(r-R)/20)*amb;ctx.fillStyle=`rgba(${sc[0]},${sc[1]},${Math.floor(sc[2]*0.7)},${a})`;for(let dy=-r;dy<=r;dy++){const hw=Math.floor(Math.sqrt(r*r-dy*dy)),py=sy+dy;if(py>=0&&py<hS)ctx.fillRect(sx-hw,py,hw*2,1);}}ctx.fillStyle=rgb(sc);for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++)if(dx*dx+dy*dy<=R*R&&sy+dy>=0&&sy+dy<hS)ctx.fillRect(sx+dx,sy+dy,1,1);ctx.fillStyle=rgb([255,250,230]);for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(dx*dx+dy*dy<=9&&sy+dy>=0&&sy+dy<hS)ctx.fillRect(sx+dx,sy+dy,1,1); }

// ── Dynamic trees/shrubs ──
function drawTreeDyn(t) {
  const x = worldToScreenX(t.x), y = Math.floor(t.y - VP.y);
  if (x < -30 || x > PW + 30 || y < -30 || y > PH + 30) return;
  const s = t.s, a = getAmbient(simTime);

  // Canopy sway: unique per tree, trunk stays fixed
  const seed = Math.floor(t.x * 7 + t.y * 13);
  const swaySpeed = 0.008 + (seed % 100) / 100 * 0.005;
  const sway = Math.round(Math.sin(logicTick * swaySpeed + seed * 0.1) * 0.8);

  // Trunk
  ctx.fillStyle = rgb([Math.round(55*a), Math.round(38*a), Math.round(22*a)]);
  ctx.fillRect(x - 1, y - s*5, 3, s*5);

  // Canopy (shifted by sway)
  const cx = x + sway;
  const cw = s*5, ch = s*2, cy = y - s*5;
  ctx.fillStyle = rgb([Math.round(30*a), Math.round(42*a), Math.round(18*a)]);
  ctx.fillRect(cx - cw, cy - 1, cw*2 + 1, 2);
  ctx.fillRect(cx - cw + 1, cy + 1, cw*2 - 1, 1);
  ctx.fillStyle = rgb([Math.round(38*a), Math.round(52*a), Math.round(24*a)]);
  ctx.fillRect(cx - cw + 1, cy - ch, cw*2 - 1, ch);
  ctx.fillRect(cx - cw - 1, cy - Math.floor(ch*0.6), cw*2 + 3, Math.floor(ch*0.4));
  ctx.fillStyle = rgb([Math.round(52*a), Math.round(65*a), Math.round(32*a)]);
  ctx.fillRect(cx - cw + 2, cy - ch - 1, cw*2 - 3, 1);
  if (getSunPos(simTime)) {
    ctx.fillStyle = `rgba(190,150,60,${0.12*a})`;
    ctx.fillRect(cx + 1, cy - ch, cw - 1, ch);
  }
}
function drawShrubDyn(s){const x=worldToScreenX(s.x),y=Math.floor(s.y-VP.y);if(x<-10||x>PW+10||y<-10||y>PH+10)return;const sz=s.s,a=getAmbient(simTime);ctx.fillStyle=rgb([Math.round(42*a),Math.round(55*a),Math.round(22*a)]);ctx.fillRect(x-sz,y-sz,sz*2+1,sz+1);ctx.fillStyle=rgb([Math.round(55*a),Math.round(68*a),Math.round(32*a)]);ctx.fillRect(x-sz+1,y-sz-1,sz*2-1,1);}

// ── Water, clouds, particles, effects ──
const ripples=[];
function drawWaterHole(tick, al) {
  const sx = worldToScreenX(waterHole.x), sy = waterHole.y - VP.y;
  if (sx < -50 || sx > PW + 50 || sy < -20 || sy > PH + 20) return;
  const a = getAmbient(simTime);

  // Muddy banks
  ctx.fillStyle = `rgba(${Math.round(65*a)},${Math.round(50*a)},${Math.round(28*a)},0.7)`;
  for (let dy = -(waterHole.ry+3); dy <= waterHole.ry+3; dy++)
    for (let dx = -(waterHole.rx+4); dx <= waterHole.rx+4; dx++) {
      const nx = dx/(waterHole.rx+4), ny = dy/(waterHole.ry+3);
      if (nx*nx+ny*ny <= 1 && nx*nx+ny*ny > 0.6)
        ctx.fillRect(Math.floor(sx+dx), Math.floor(sy+dy), 1, 1);
    }

  // Sky/light reflection color
  const sky = getSkyColors(simTime);
  const sun = getSunPos(simTime);
  const moon = !sun ? getMoonPos(simTime) : null;
  const lightSource = sun || moon;
  const lightColor = sun ? getSunColor(simTime) : [180, 200, 230]; // moonlight blue-white
  const lightRefX = lightSource ? clamp(wrapDeltaX(lightSource.x - waterHole.x) / waterHole.rx * 0.3, -0.7, 0.7) : 0;

  // Water body
  const wc = [Math.round(55*a), Math.round(75*a), Math.round(105*a)];
  const wh = [Math.round(115*a), Math.round(135*a), Math.round(165*a)];
  for (let dy = -waterHole.ry; dy <= waterHole.ry; dy++)
    for (let dx = -waterHole.rx; dx <= waterHole.rx; dx++) {
      const nx = dx/waterHole.rx, ny = dy/waterHole.ry;
      if (nx*nx+ny*ny > 1) continue;
      let sh = Math.sin((dx+tick*0.025)*0.4) * 0.1;
      for (const r of ripples)
        sh += Math.sin(Math.hypot(dx-(r.x-waterHole.x), dy-(r.y-waterHole.y))*1.5-r.age*0.15)*0.15*Math.max(0,1-r.age/60);

      // Sky reflection (top half of waterhole)
      const skyRef = (ny < -0.2 && Math.abs(nx) < 0.6) ? 0.06 * a : 0;
      // Sky color bleed into water
      const skyBlend = clamp((1-ny)*0.3, 0, 0.3) * (1-nx*nx);
      let c = lerpColor(wc, wh, clamp(0.45 + sh + skyRef, 0, 1));
      c = [c[0] + sky.low[0]*skyBlend*0.15, c[1] + sky.low[1]*skyBlend*0.15, c[2] + sky.low[2]*skyBlend*0.15];

      // Sun/moon reflection spot
      if (lightSource) {
        const sd = Math.hypot(nx - lightRefX, ny + 0.15);
        if (sd < 0.3) {
          const fade = (0.3-sd)/0.3 * (1 + sh*2);
          const intensity = sun ? 0.15 : 0.08; // moon dimmer
          c[0] += lightColor[0] * intensity * fade * a;
          c[1] += lightColor[1] * intensity * fade * a;
          c[2] += lightColor[2] * intensity * fade * a;
        }
      }

      ctx.fillStyle = rgb([clamp(Math.round(c[0]),0,255), clamp(Math.round(c[1]),0,255), clamp(Math.round(c[2]),0,255)]);
      ctx.fillRect(Math.floor(sx+dx), Math.floor(sy+dy), 1, 1);
    }

  // Reeds
  ctx.fillStyle = rgb([Math.round(45*a), Math.round(60*a), Math.round(22*a)]);
  for (const rx of [-waterHole.rx+3, -waterHole.rx+6, waterHole.rx-5, waterHole.rx-2]) {
    const rsx = Math.floor(sx+rx), rsy = Math.floor(sy-waterHole.ry+1);
    ctx.fillRect(rsx, rsy-3, 1, 4);
    ctx.fillRect(rsx+1, rsy-2, 1, 3);
    ctx.fillRect(rsx, rsy-4, 1, 1);
  }

  // Ripples from drinking
  for (const an of al) if (an.alive && an.state === STATE.DRINK && an.frame%40 === 0)
    ripples.push({x: an.x, y: an.y, age: 0});
  for (let i = ripples.length-1; i >= 0; i--) {
    ripples[i].age++;
    if (ripples[i].age > 60) ripples.splice(i, 1);
  }
}

// Clouds: larger, fluffier, more visible during daytime
const clouds=[];for(let i=0;i<6;i++){
  const w=randInt(25,55), puffs=[];
  const puffCount = randInt(4, 8);
  // Build a cloud shape from overlapping puffs
  for(let j=0;j<puffCount;j++){
    const pw=randInt(8,Math.floor(w*0.65)), ph=randInt(4,8);
    puffs.push({dx:randInt(-3,w-pw+3), dy:randInt(-ph+3,3), w:pw, h:ph});
  }
  clouds.push({x:rand(0,WORLD_W), y:rand(12,HORIZON*0.32), w, speed:rand(0.006,0.02), puffs});
}
function drawClouds(){const a=getAmbient(simTime);if(a<0.1)return;const sun=getSunPos(simTime),t=simTime;let cr,cg,cb;if(t<7||t>17.5){cr=240;cg=180;cb=140;}else if(t>10&&t<15){cr=235;cg=235;cb=240;}else{cr=240;cg=220;cb=210;}for(const c of clouds){
    // Higher clouds drift faster (altitude parallax)
    const altFactor = 1 + (1 - c.y / (HORIZON * 0.35)) * 0.5;
    c.x=wrapX(c.x+c.speed*altFactor);const sx=worldToScreenX(c.x),sy=Math.floor(c.y-VP.y);if(sx<-60||sx>PW+60||sy<-20||sy>PH)continue;if(sun){ctx.fillStyle=`rgba(0,0,0,${0.04*a})`;ctx.fillRect(sx+Math.round(wrapDeltaX(c.x-sun.x)*0.04),HORIZON-VP.y+5,c.w,3);}for(const p of c.puffs){const px=sx+p.dx,py=sy+p.dy;
      // Underside shadow
      ctx.fillStyle=`rgba(${Math.round(cr*0.65)},${Math.round(cg*0.6)},${Math.round(cb*0.55)},${0.25*a})`;
      ctx.fillRect(px,py+Math.floor(p.h*0.5),p.w,Math.ceil(p.h*0.5));
      // Main body
      ctx.fillStyle=`rgba(${cr},${cg},${cb},${0.4*a})`;
      ctx.fillRect(px+1,py+1,p.w-2,p.h-2);
      // Bright top edge
      ctx.fillStyle=`rgba(255,${Math.min(255,cg+15)},${Math.min(255,cb+10)},${0.5*a})`;
      ctx.fillRect(px+1,py,p.w-2,2);
      // Highlight peak
      ctx.fillStyle=`rgba(255,255,${Math.min(255,cb+30)},${0.25*a})`;
      ctx.fillRect(px+2,py-1,Math.max(1,p.w-4),1);
    }
  }
}

const windSeeds=[];for(let i=0;i<10;i++)windSeeds.push({x:rand(0,PW),y:rand(10,PH-30),vx:rand(0.08,0.2),wobblePhase:rand(0,Math.PI*2),wobbleAmp:rand(0.3,0.8),wobbleFreq:rand(0.015,0.035),size:rand(0.8,1.5),bright:rand(0.3,0.7)});
function drawWindWaves(tk){if(REDUCED_MOTION)return;const a=getAmbient(simTime);if(a<0.15)return;const hY=HORIZON-VP.y;if(hY>=PH)return;for(let w=0;w<3;w++){const sp=0.3+w*0.15,wX=((tk*sp+w*200)%(PW+80))-40,wW=25+w*10,bY=hY+10+w*((PH-hY)/4);for(let dx=0;dx<wW;dx++){const px=Math.floor(wX+dx);if(px<0||px>=PW)continue;const py=Math.floor(bY+Math.round((pcgHash(dx,w,7777)-0.5)*6));if(py<hY||py>=PH)continue;ctx.fillStyle=`rgba(140,130,70,${Math.sin(dx/wW*Math.PI)*0.06*a})`;ctx.fillRect(px,py-1,1,3);}}}
const fgGrass=[];for(let i=0;i<12;i++)fgGrass.push({x:(i*37+11)%PW,y:PH-5-pcgHash(i,0,8888)*30,height:4+Math.floor(pcgHash(i,1,8888)*4),phase:pcgHash(i,2,8888)*Math.PI*2,speed:0.02+pcgHash(i,3,8888)*0.015,color:Math.floor(pcgHash(i,4,8888)*3)});
function drawFgGrass(tk){const a=getAmbient(simTime);if(a<0.1)return;const cols=[[75*a,80*a,28*a],[65*a,85*a,30*a],[90*a,78*a,25*a]];for(const g of fgGrass){const sway=Math.sin(tk*g.speed+g.phase)*1.5,c=cols[g.color];ctx.fillStyle=rgb([Math.round(c[0]),Math.round(c[1]),Math.round(c[2])]);for(let bl=-1;bl<=1;bl++){const bx=g.x+bl*2,h=g.height-Math.abs(bl);for(let py=0;py<h;py++)ctx.fillRect(bx+Math.round(sway*(py/h)*(py/h)),Math.floor(g.y-py),1,1);}ctx.fillStyle=rgb([Math.round(c[0]+15*a),Math.round(c[1]+10*a),Math.round(c[2]+5*a)]);ctx.fillRect(g.x+Math.round(sway),Math.floor(g.y-g.height+1),1,1);}}
function drawWindSeeds(tk){const a=getAmbient(simTime);if(a<0.25)return;for(const s of windSeeds){s.x+=s.vx;s.y+=Math.sin(tk*s.wobbleFreq+s.wobblePhase)*s.wobbleAmp*0.3;if(s.x>PW+5){s.x=-5;s.y=rand(10,PH-30);}s.y=clamp(s.y,5,PH-10);const sx=Math.floor(s.x),sy=Math.floor(s.y),al=s.bright*a*(sy<(HORIZON-VP.y)?0.6:0.3);ctx.fillStyle=`rgba(240,220,160,${al})`;ctx.fillRect(sx,sy,1,1);if(s.size>1.2){ctx.fillStyle=`rgba(240,220,160,${al*0.4})`;ctx.fillRect(sx-1,sy,1,1);}}}
function drawHeatShimmer(tk){if(REDUCED_MOTION||simTime<10||simTime>15)return;const intensity=1-Math.abs(simTime-12.5)/2.5;if(intensity<=0)return;const hY=HORIZON-VP.y;for(let y=0;y<8;y++){const sy=hY+y;if(sy<0||sy>=PH)continue;const off=Math.round(Math.sin(tk*0.04+y*1.3)*intensity*1.5),al=0.04*intensity*(1-y/8);if(off!==0&&al>0.005){ctx.globalAlpha=al;ctx.drawImage(canvas,0,sy,PW,1,off,sy,PW,1);ctx.globalAlpha=1;}}}
const dustMotes=[];for(let i=0;i<15;i++)dustMotes.push({x:rand(0,PW),y:rand(HORIZON-VP.y-20,PH-15),speed:rand(0.02,0.06),phase:rand(0,Math.PI*2),bright:rand(0.1,0.3)});
function drawDust(tk){const a=getAmbient(simTime);if(a<0.3)return;for(const m of dustMotes){m.x+=m.speed;m.y+=Math.sin(tk*0.012+m.phase)*0.04;if(m.x>PW+2){m.x=-2;m.y=rand(HORIZON-VP.y-20,PH-15);}ctx.fillStyle=`rgba(255,220,140,${clamp(m.bright*a+Math.sin(tk*0.03+m.phase)*0.05,0,0.4)})`;ctx.fillRect(Math.floor(m.x),Math.floor(m.y),1,1);}}

const particles=[];
function spawnParticle(type,x,y,vx,vy,life,size,color){particles.push({type,x,y,vx,vy,life,maxLife:life,size,color});}
function spawnDustBurst(x,y,count,spread){for(let i=0;i<count;i++)spawnParticle('dust',x+rand(-spread,spread),y+rand(-1,1),rand(-0.15,0.15),rand(-0.12,-0.02),randInt(25,55),rand(1.5,3.5),[140,120,80]);}
function spawnSplash(x,y){for(let i=0;i<4;i++)spawnParticle('splash',x+rand(-3,3),y+rand(-2,0),rand(-0.08,0.08),rand(-0.15,-0.05),randInt(15,30),rand(1,2),[100,140,180]);}
function birdScatterEffect(x,y){for(let i=0;i<6;i++)spawnParticle('debris',x+rand(-4,4),y+rand(-1,1),rand(-0.2,0.2),rand(-0.15,-0.05),randInt(10,25),rand(1,1.5),[70,65,50]);}
// Animal footprints: fade over time, form natural paths
const footprints = [];
const MAX_FOOTPRINTS = 200;

function updateFootprints(animalList) {
  const amb = getAmbient(simTime);

  // Spawn footprints from moving ground animals
  for (const a of animalList) {
    if (!a.alive || a.brain.flying) continue;
    if (a.state === STATE.REST || a.state === STATE.DEAD || a.state === STATE.PERCH) continue;
    const speed = Math.hypot(a.vx, a.vy);
    if (speed < 0.03) continue;
    // Frequency based on speed: running = frequent, walking = sparse
    const interval = speed > 0.3 ? 6 : speed > 0.1 ? 15 : 30;
    if (a.frame % interval !== 0) continue;
    footprints.push({
      x: a.x + (pcgHash(a.frame, Math.floor(a.seed * 100), 1234) - 0.5) * 2,
      y: a.y + 1,
      life: 600, // ~20 seconds
      maxLife: 600,
      size: a.type === 'elephant' ? 2 : 1,
    });
  }

  // Cap
  while (footprints.length > MAX_FOOTPRINTS) footprints.shift();

  // Update and draw
  for (let i = footprints.length - 1; i >= 0; i--) {
    const fp = footprints[i];
    fp.life--;
    if (fp.life <= 0) { footprints.splice(i, 1); continue; }
    const sx = worldToScreenX(fp.x);
    const sy = Math.floor(fp.y - VP.y);
    if (sx < 0 || sx >= PW || sy < 0 || sy >= PH) continue;
    const fade = fp.life / fp.maxLife;
    const alpha = fade * fade * 0.06 * amb; // quadratic fade, very subtle
    ctx.fillStyle = `rgba(40,30,18,${alpha})`;
    ctx.fillRect(sx, sy, fp.size, 1);
  }
}

function updateParticles(al){if(REDUCED_MOTION)return;const a=getAmbient(simTime);for(const an of al){if(!an.alive||an.brain.flying)continue;const running=an.state===STATE.FLEE||an.state===STATE.CHASE;if(running&&an.frame%4===0){const cnt=an.type==='elephant'?3:1;for(let i=0;i<cnt;i++)spawnParticle('dust',an.x-an.vx*2+rand(-3,3),an.y+rand(0,2),-an.vx*0.15+rand(-0.12,0.12),rand(-0.1,-0.02),randInt(30,60),rand(2,4),[140,120,80]);}else if(Math.hypot(an.vx,an.vy)>an.brain.speed*0.4&&an.frame%15===0)spawnParticle('dust',an.x-an.vx*2+rand(-2,2),an.y+rand(0,1),rand(-0.05,0.05),rand(-0.05,-0.01),randInt(15,35),rand(1,2),[130,115,75]);if(an.state===STATE.DRINK&&an.frame%50===0)spawnSplash(an.x,an.y);if(an.state===STATE.GRAZE&&an.frame%80===0)spawnParticle('debris',an.x+rand(-2,2),an.y-2,rand(-0.04,0.04),rand(-0.06,-0.02),randInt(10,20),1,[80,90,35]);}for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.002;p.vx*=0.96;p.vy*=0.97;p.life--;if(p.life<=0){particles.splice(i,1);continue;}const sx=worldToScreenX(p.x),sy=Math.floor(p.y-VP.y);if(sx<-5||sx>=PW+5||sy<-5||sy>=PH+5)continue;const fade=p.life/p.maxLife,al2=fade*(p.type==='dust'?0.35:p.type==='splash'?0.5:0.3)*a,s=Math.max(1,Math.ceil(p.size*(0.5+fade*0.5)));ctx.fillStyle=`rgba(${p.color[0]},${p.color[1]},${p.color[2]},${al2})`;ctx.fillRect(sx,sy,s,s);if(p.type==='dust'&&s>=2&&fade>0.5){ctx.fillStyle=`rgba(${Math.min(255,p.color[0]+30)},${Math.min(255,p.color[1]+25)},${Math.min(255,p.color[2]+15)},${al2*0.5})`;ctx.fillRect(sx,sy,1,1);}}if(particles.length>150)particles.splice(0,particles.length-150);}
// Moon position (opposite side of sun arc)
function getMoonPos(t) {
  const mp = (t < 12) ? (t + 12) : (t - 12);
  const ma = (mp - 6) / 12 * Math.PI;
  if (ma <= 0 || ma >= Math.PI) return null;
  return { x: WORLD_W * 0.15 + (WORLD_W * 0.7) * ((mp - 6) / 12), y: HORIZON - Math.sin(ma) * 55 };
}

// Golden hour rim light: warm highlight on sun-facing edge of animals
function drawRimLight(an) {
  if (!an.alive || an.brain.flying) return;
  const sun = getSunPos(simTime);
  if (!sun) return;
  const t = simTime;
  // Only during golden hour
  if (t > 8 && t < 16.5) return;
  const intensity = (t < 8) ? 1 - Math.abs(t - 6.5) / 1.5 : 1 - Math.abs(t - 17.75) / 1.25;
  if (intensity <= 0.1) return;
  const sx = worldToScreenX(an.x), sy = Math.floor(an.y - VP.y);
  if (sx < -40 || sx > PW + 40 || sy < -20 || sy > PH + 20) return;
  const sunSide = wrapDeltaX(sun.x - an.x) > 0 ? 1 : -1;
  const h = an.type === 'elephant' ? 8 : an.type === 'giraffe' ? 14 : 5;
  const alpha = intensity * 0.15;
  ctx.fillStyle = `rgba(255,180,80,${alpha})`;
  // Thin warm line on sun-facing edge
  for (let dy = 0; dy < h; dy++) {
    ctx.fillRect(sx + sunSide * (an.type === 'elephant' ? 6 : 4), sy - h + dy, 1, 1);
  }
}

function drawExhaustion(an) {
  if (!an.alive || an.energy > 0.35) return;
  const sprinting = an.state === STATE.FLEE || an.state === STATE.CHASE;
  if (!sprinting) return;
  const sx = worldToScreenX(an.x), sy = Math.floor(an.y - VP.y);
  if (sx < -40 || sx > PW + 40 || sy < -20 || sy > PH + 20) return;
  const pant = an.frame % 20;
  if (pant < 10) {
    const alpha = (1 - an.energy / 0.35) * 0.4 * (1 - pant / 10);
    ctx.fillStyle = `rgba(220,220,220,${alpha})`;
    ctx.fillRect(sx + an.facing * 3, sy - 8 - pant, 1, 1);
    if (an.energy < 0.15) ctx.fillRect(sx + an.facing * 2, sy - 6 - Math.floor(pant * 0.7), 1, 1);
  }
}

function drawShadow(an) {
  if (!an.alive || an.brain.flying) return;
  const sx = worldToScreenX(an.x), sy = Math.floor(an.y - VP.y);
  if (sx < -40 || sx > PW + 40 || sy < -20 || sy > PH + 20) return;
  const a = getAmbient(simTime);

  // Sun shadows (daytime) or moon shadows (nighttime)
  const sun = getSunPos(simTime);
  const moon = !sun ? getMoonPos(simTime) : null;
  let sdx = -8;
  let shadowAlpha;
  // Shadow length scales with sun angle: long at dawn/dusk, short at noon
  let sunElev = 1; // 0=horizon, 1=zenith
  if (sun) {
    sunElev = Math.sin(sun.angle); // 0 at horizon, 1 at noon
    sdx = clamp(Math.round(wrapDeltaX(an.x - sun.x) * 0.08), -20, 20);
    shadowAlpha = 0.1 * a;
  } else if (moon) {
    sdx = clamp(Math.round(wrapDeltaX(an.x - moon.x) * 0.06), -12, 12);
    shadowAlpha = 0.04;
    sunElev = 0.5;
  } else {
    return;
  }

  const hSy = HORIZON - VP.y;
  const dT = sy > hSy ? (sy - hSy) / Math.max(1, PH - hSy) : 0;
  const sc = 0.85 + dT * 0.25;
  // Shadow elongation: 1x at noon, up to 3x at horizon
  const elongation = 1 + (1 - sunElev) * 2;
  const bL = an.type === 'elephant' ? 14 : an.type === 'giraffe' ? 10 : an.type === 'lion' ? 10 : 7;
  const len = Math.round(bL * sc * elongation);
  const sd = Math.round(sdx * sc * elongation);
  ctx.fillStyle = `rgba(15,12,8,${shadowAlpha})`;
  ctx.fillRect(sx + Math.min(0, sd), sy + 1, Math.abs(sd) + len, 1);
  // Thicker shadow at low sun angles
  if (elongation > 1.5) {
    ctx.fillRect(sx + Math.min(0, sd) + 1, sy + 2, Math.abs(sd) + len - 2, 1);
  }
  if (an.type === 'elephant' || an.type === 'giraffe') {
    ctx.fillRect(sx + Math.min(0, sd) + 2, sy + 2, Math.abs(sd) + len - 4, 1);
  }
}

const fireflies=[];for(let i=0;i<12;i++)fireflies.push({x:rand(50,PW-50),y:rand(HORIZON-VP.y+10,PH-20),phase:rand(0,Math.PI*2),speed:rand(0.3,0.8),driftX:rand(-0.05,0.05),driftY:rand(-0.03,0.03)});
// Cricket chirps: tiny expanding rings on the ground at night
const crickets = [];
for (let i = 0; i < 8; i++) {
  crickets.push({
    x: rand(30, PW - 30),
    y: rand(HORIZON - VP.y + 15, PH - 25),
    phase: rand(0, Math.PI * 2),
    interval: randInt(90, 200), // ticks between chirps
    ringAge: -1, // -1 = not chirping
  });
}

// Animal calls: visible sound ripples from vocalizing animals
const animalCalls = [];
function updateAnimalCalls(tick) {
  // Spawn calls from herd animals occasionally
  for (const a of animals) {
    if (!a.alive || a.brain.flying || a.state === STATE.REST || a.state === STATE.DEAD) continue;
    if (a.type !== 'zebra' && a.type !== 'wildebeest' && a.type !== 'elephant') continue;
    // Each animal has a unique call interval based on seed
    const interval = 400 + Math.floor(pcgHash(Math.floor(a.seed * 77), 0, 3456) * 600);
    if (tick % interval !== Math.floor(a.seed * interval) % interval) continue;
    animalCalls.push({ x: a.x, y: a.y - 4, age: 0, type: a.type });
  }
  // Draw and age
  const amb = getAmbient(simTime);
  for (let i = animalCalls.length - 1; i >= 0; i--) {
    const c = animalCalls[i];
    c.age++;
    if (c.age > 25) { animalCalls.splice(i, 1); continue; }
    const sx = worldToScreenX(c.x), sy = Math.floor(c.y - VP.y);
    if (sx < -20 || sx > PW + 20 || sy < -10 || sy > PH) continue;
    const r = c.age * 0.6;
    const fade = 1 - c.age / 25;
    const alpha = fade * 0.12 * amb;
    ctx.strokeStyle = `rgba(180,170,140,${alpha})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r, -0.8, 0.8); // partial arc (not full circle — directional call)
    ctx.stroke();
  }
  if (animalCalls.length > 20) animalCalls.splice(0, animalCalls.length - 20);
}

function drawCrickets(tick) {
  const amb = getAmbient(simTime);
  if (amb > 0.3) return; // only at night

  const nightDepth = (0.3 - amb) / 0.3;
  for (const c of crickets) {
    // Trigger chirp
    if (c.ringAge < 0 && (tick + Math.floor(c.phase * 100)) % c.interval === 0) {
      c.ringAge = 0;
    }
    if (c.ringAge >= 0) {
      c.ringAge++;
      const r = c.ringAge * 0.4; // expanding ring
      const fade = 1 - c.ringAge / 20;
      if (fade <= 0) { c.ringAge = -1; continue; }
      const alpha = fade * nightDepth * 0.12;
      ctx.strokeStyle = `rgba(180,200,160,${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawFireflies(tk){const a=getAmbient(simTime);if(a>0.4||a<0.08)return;const int=1-Math.abs(a-0.2)/0.2;for(const f of fireflies){f.x+=f.driftX+Math.sin(tk*0.01+f.phase)*0.08;f.y+=f.driftY+Math.cos(tk*0.008+f.phase)*0.05;if(f.x<10)f.x=PW-10;if(f.x>PW-10)f.x=10;if(f.y<HORIZON-VP.y+5)f.y=PH-20;if(f.y>PH-15)f.y=HORIZON-VP.y+10;const glow=(Math.sin(tk*f.speed*0.1+f.phase)+1)*0.5;if(glow<0.3)continue;const al=glow*int*0.7;ctx.fillStyle=`rgba(180,220,80,${al*0.3})`;ctx.fillRect(Math.floor(f.x)-1,Math.floor(f.y)-1,3,3);ctx.fillStyle=`rgba(220,255,120,${al})`;ctx.fillRect(Math.floor(f.x),Math.floor(f.y),1,1);}}
// Morning mist: ground fog at dawn that slowly dissipates
function drawMorningMist(tick) {
  const t = simTime;
  // Mist visible from 5:00-7:30, peaks around 5:30-6:00
  if (t < 4.5 || t > 7.5) return;
  let intensity;
  if (t < 5.5) intensity = (t - 4.5) / 1.0; // forming
  else if (t < 6.0) intensity = 1.0; // peak
  else intensity = 1.0 - (t - 6.0) / 1.5; // dissipating
  if (intensity <= 0) return;

  const hS = HORIZON - VP.y;
  const mistTop = hS - 5; // mist rises slightly above horizon
  const mistBottom = Math.min(PH, hS + 50); // extends ~50px below horizon

  // Multiple wispy layers
  for (let layer = 0; layer < 3; layer++) {
    const layerSpeed = 0.015 + layer * 0.008;
    const layerOffset = tick * layerSpeed + layer * 80;
    const layerAlpha = intensity * (0.06 - layer * 0.015); // front layers more opaque

    for (let y = mistTop; y < mistBottom; y++) {
      if (y < 0 || y >= PH) continue;
      const yFade = (y < hS)
        ? (y - mistTop) / Math.max(1, hS - mistTop) // above horizon: fade to top
        : 1.0 - (y - hS) / Math.max(1, mistBottom - hS); // below: fade to bottom
      // Wispy horizontal variation using hash
      for (let x = 0; x < PW; x += 2) {
        const wx = x + Math.floor(layerOffset);
        const wispDensity = pcgHash(wx >> 3, y >> 2, 4321 + layer);
        if (wispDensity < 0.4) continue; // gaps in mist
        const wispAlpha = layerAlpha * yFade * (wispDensity - 0.4) / 0.6;
        if (wispAlpha < 0.003) continue;
        ctx.fillStyle = `rgba(200,210,220,${wispAlpha})`;
        ctx.fillRect(x, y, 2, 1);
      }
    }
  }

  // Thicker mist patch around waterhole (water evaporation)
  const whSx = worldToScreenX(waterHole.x);
  const whSy = Math.floor(waterHole.y - VP.y);
  if (whSx > -40 && whSx < PW + 40 && whSy > 0 && whSy < PH) {
    const whMistR = 25;
    const whAlpha = intensity * 0.08;
    for (let dy = -whMistR; dy <= 5; dy++) {
      for (let dx = -whMistR; dx <= whMistR; dx++) {
        const d = Math.hypot(dx, dy * 2); // wider than tall
        if (d > whMistR) continue;
        const py = whSy + dy - 5; // rises above waterhole
        const px = whSx + dx;
        if (px < 0 || px >= PW || py < 0 || py >= PH) continue;
        const fade = (1 - d / whMistR);
        // Drift with time
        const drift = Math.floor(tick * 0.02 + dy * 0.3);
        const wispVal = pcgHash((px + drift) >> 2, py >> 2, 5432);
        if (wispVal < 0.3) continue;
        const a = whAlpha * fade * fade * (wispVal - 0.3) / 0.7;
        ctx.fillStyle = `rgba(210,220,230,${a})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

function drawSunRays(){const sun=getSunPos(simTime);if(!sun)return;const t=simTime;if(!((t>6&&t<8)||(t>16.5&&t<19)))return;const int=(t<12)?1-Math.abs(t-7)/1:1-Math.abs(t-17.75)/1.25;if(int<=0)return;let sx=worldToScreenX(sun.x),sy=Math.floor(sun.y-VP.y);if(sx<-20)sx=-10;if(sx>PW+20)sx=PW+10;sy=clamp(sy,-10,PH*0.6);const a=getAmbient(simTime),sc=getSunColor(simTime);ctx.fillStyle=`rgb(${sc[0]},${sc[1]},${Math.floor(sc[2]*0.7)})`;for(let i=0;i<7;i++){const ra=(i/7)*0.8-0.4+pcgHash(i,0,9876)*0.15,rw=3+pcgHash(i,1,9876)*8,rl=60+pcgHash(i,2,9876)*80;if(pcgHash(i,3,9876)>0.7)continue;const x1=sx+Math.tan(ra)*10-rw*0.3,x2=sx+Math.tan(ra)*10+rw*0.3,x3=sx+Math.tan(ra)*rl-rw,x4=sx+Math.tan(ra)*rl+rw,y1=sy+5,y2=sy+rl;for(let ry=y1;ry<y2&&ry<PH;ry++){if(ry<0)continue;const rf=(ry-y1)/(y2-y1),lx=Math.floor(lerp(x1,x3,rf)),rx=Math.floor(lerp(x2,x4,rf)),fa=(1-rf)*(1-rf);if(rx>lx&&fa>0.01){ctx.globalAlpha=clamp(int*0.08*a*fa,0,0.08);ctx.fillRect(lx,ry,rx-lx,1);}}}ctx.globalAlpha=1;}
// Night owl: glides across the sky, silhouette against moon is dramatic
const owl = { active: false, x: 0, y: 0, vx: 0, frame: 0 };

function updateOwl(tick) {
  const amb = getAmbient(simTime);
  if (amb > 0.25) { owl.active = false; return; }

  if (!owl.active) {
    if (pcgHash(tick & 0x3FF, 0, 3141) < 0.0006) {
      owl.active = true;
      const goRight = pcgHash(tick, 1, 3141) > 0.5;
      owl.x = goRight ? -15 : PW + 15;
      owl.y = rand(15, (HORIZON - VP.y) * 0.6);
      owl.vx = goRight ? rand(0.4, 0.7) : rand(-0.7, -0.4);
      owl.frame = 0;
    }
    return;
  }

  owl.x += owl.vx;
  owl.y += (pcgHash(Math.floor(owl.x), owl.frame, 3142) - 0.5) * 0.15;
  owl.frame++;

  if (owl.x < -20 || owl.x > PW + 20) { owl.active = false; return; }
}

// Vultures: circle above carcasses after a kill
const vultures = []; // {x, y, targetX, targetY, phase, radius, life}

function spawnVultures(killX, killY) {
  const count = randInt(3, 6);
  for (let i = 0; i < count; i++) {
    vultures.push({
      x: killX + rand(-60, 60),
      y: rand(20, HORIZON * 0.5),
      targetX: killX,
      targetY: killY,
      phase: rand(0, Math.PI * 2),
      radius: rand(15, 30),
      speed: rand(0.008, 0.015),
      life: randInt(1200, 3000), // 40-100 seconds
      frame: 0,
    });
  }
  if (getAmbient(simTime) > 0.3) showNarration('Vultures begin to circle');
}

function updateVultures(tick) {
  for (let i = vultures.length - 1; i >= 0; i--) {
    const v = vultures[i];
    v.frame++;
    v.life--;
    if (v.life <= 0) { vultures.splice(i, 1); continue; }
    // Circle above the kill site
    v.phase += v.speed;
    v.x = v.targetX + Math.cos(v.phase) * v.radius;
    v.y = HORIZON * 0.3 + Math.sin(v.phase * 0.5) * 8;
    // Slowly descend as time passes (getting bolder)
    if (v.life < 400) {
      v.radius *= 0.999; // tighten circle
      v.y += 0.01; // drift lower
    }
  }
}

function drawVultures() {
  const amb = getAmbient(simTime);
  for (const v of vultures) {
    const sx = worldToScreenX(v.x);
    const sy = Math.floor(v.y - VP.y);
    if (sx < -40 || sx > PW + 40 || sy < -5 || sy > PH) continue;

    // Vulture silhouette: wider wingspan than other birds, distinctive shape
    const wingPhase = Math.sin(v.frame * 0.04 + v.phase); // per-vulture offset so they don't flap in sync
    const w = Math.round(wingPhase * 0.8); // barely flaps (gliding)
    ctx.fillStyle = `rgba(30,25,20,${0.6 + amb * 0.3})`;
    // Body
    ctx.fillRect(sx, sy, 2, 1);
    // Wings (wide, fingered tips)
    ctx.fillRect(sx - 3, sy - w, 3, 1);
    ctx.fillRect(sx + 2, sy - w, 3, 1);
    // Wing tips (spread fingers)
    ctx.fillRect(sx - 4, sy - w - (w > 0 ? 1 : 0), 1, 1);
    ctx.fillRect(sx + 5, sy - w - (w > 0 ? 1 : 0), 1, 1);
    // Head (extends forward)
    const facing = Math.cos(v.phase) > 0 ? 1 : -1;
    ctx.fillRect(sx + facing, sy - 1, 1, 1);
  }
}

function drawOwl() {
  if (!owl.active) return;
  const sx = Math.floor(owl.x), sy = Math.floor(owl.y);

  // Owl silhouette: wider wingspan than regular birds, slower wingbeat
  const wingPhase = Math.sin(owl.frame * 0.06); // slow, gliding
  const w = Math.round(wingPhase * 1.5);
  const facing = owl.vx > 0 ? 1 : -1;

  // Body
  ctx.fillStyle = 'rgb(15,12,10)';
  ctx.fillRect(sx, sy, 2, 2); // body (wider than regular bird)
  ctx.fillRect(sx + facing, sy - 1, 1, 1); // head

  // Wings (wider span)
  ctx.fillRect(sx - 2, sy - w, 2, 1);
  ctx.fillRect(sx - 4, sy - w - (w > 0 ? 1 : 0), 2, 1);
  ctx.fillRect(sx + 2, sy - w, 2, 1);
  ctx.fillRect(sx + 4, sy - w - (w > 0 ? 1 : 0), 2, 1);

  // Moon silhouette effect: if crossing the moon, owl is BLACK against bright moon
  const moonP = getMoonPos(simTime);
  if (moonP) {
    const mx = Math.floor(moonP.x - VP.x), my = Math.floor(moonP.y - VP.y);
    const dToMoon = Math.hypot(sx - mx, sy - my);
    if (dToMoon < 12) {
      // Very close to moon - the silhouette is dramatic, draw extra dark
      ctx.fillStyle = 'rgb(5,3,2)';
      ctx.fillRect(sx - 1, sy - 1, 4, 3);
      ctx.fillRect(sx - 4, sy - w - 1, 9, 2);
    }
  }
}

function drawEyeShine(){const a=getAmbient(simTime);if(a>0.25||simTime>6&&simTime<18)return;const sa=(0.25-a)/0.25*0.7;
  for(const an of animals){
    if(!an.alive||an.brain.flying||an.state===STATE.REST||an.state===STATE.DEAD)continue;
    const sx=worldToScreenX(an.x),sy=Math.floor(an.y-VP.y);
    if(sx<-40||sx>PW+40||sy<-20||sy>PH+20)continue;
    const eX=sx+an.facing*(an.type==='elephant'?8:an.type==='giraffe'?5:an.type==='lion'?7:5);
    const eY=sy-(an.type==='giraffe'?14:an.type==='elephant'?8:5);
    const isLion=an.type==='lion';
    // Lions: brighter, greenish-yellow, paired eyes visible
    const bright = isLion ? sa * 1.3 : sa;
    const r = isLion ? 160 : 220, g = isLion ? 230 : 160, b = isLion ? 60 : 40;
    ctx.fillStyle=`rgba(${r},${g},${b},${clamp(bright,0,1)})`;
    ctx.fillRect(eX,eY,1,1);
    // Second eye (visible when facing viewer = facing toward camera side)
    if (isLion || an.type === 'elephant') {
      ctx.fillRect(eX + an.facing * -2, eY, 1, 1);
    }
    // Glow halo
    ctx.fillStyle=`rgba(${r},${g},${b},${bright*0.25})`;
    ctx.fillRect(eX-1,eY,1,1); ctx.fillRect(eX+1,eY,1,1);
  }
}

// ── Dust Devil ──
const dustDevil={active:false,x:0,y:0,vx:0,life:0,maxLife:0,size:0};
function updateDustDevil(tk){if(!dustDevil.active){if(CFG.dustDevilFreq<=0)return;if(getAmbient(simTime)>0.5&&pcgHash(tk&0x3FF,0,5555)<CFG.dustDevilFreq){dustDevil.active=true;dustDevil.x=wrapX(VP.x-40);dustDevil.y=HORIZON+rand(20,70);dustDevil.vx=rand(0.3,0.6);dustDevil.size=rand(4,8);dustDevil.maxLife=randInt(300,600);dustDevil.life=dustDevil.maxLife;showNarration('A dust devil crosses the plain');}return;}dustDevil.x=wrapX(dustDevil.x+dustDevil.vx);dustDevil.y+=(pcgHash(tk,1,6666)-0.5)*0.3;dustDevil.life--;if(dustDevil.life<=0){dustDevil.active=false;return;}for(const a of animals){if(!a.alive||a.brain.flying)continue;const d=dist(a,dustDevil);if(d<25){a.memory.fear=Math.min(100,a.memory.fear+1);const dir=dirFrom(dustDevil,a);a.vx+=dir.dx*0.02;a.vy+=dir.dy*0.01;}}}
function drawDustDevil(tk){if(!dustDevil.active)return;const sx=worldToScreenX(dustDevil.x),sy=Math.floor(dustDevil.y-VP.y);if(sx<-20||sx>PW+20)return;const a=getAmbient(simTime),fade=Math.min(dustDevil.life/60,(dustDevil.maxLife-dustDevil.life)/60,1);for(let i=0;i<15;i++){const angle=tk*0.12+i*0.45,r=dustDevil.size*(0.3+(i/15)*0.7),py=sy-i*2,px=sx+Math.cos(angle)*r;if(py<0||py>=PH||px<0||px>=PW)continue;const al=fade*0.25*a*(1-i/18);ctx.fillStyle=`rgba(160,140,100,${al})`;ctx.fillRect(Math.floor(px),Math.floor(py),1,1);ctx.fillStyle=`rgba(140,125,85,${al*0.6})`;ctx.fillRect(Math.floor(px+Math.sin(angle)*0.8),Math.floor(py),1,1);}ctx.fillStyle=`rgba(150,135,95,${fade*0.12*a})`;ctx.fillRect(sx-dustDevil.size,sy-1,dustDevil.size*2,3);}
const shootingStar={active:false,x:0,y:0,vx:0,vy:0,life:0,trail:[]};
// Distant lightning: occasional flash on the horizon
const lightning = { active: false, x: 0, timer: 0, flash: 0, doubleStrike: false };

function drawDistantLightning(tick) {
  const amb = getAmbient(simTime);
  // Only at night or dusk
  if (amb > 0.5) { lightning.active = false; return; }

  if (!lightning.active) {
    // ~Every 1-3 minutes at night, chance of distant lightning
    if (pcgHash(tick & 0x7FF, 0, 8421) < 0.0008) {
      lightning.active = true;
      lightning.x = rand(0, PW); // random position on horizon
      lightning.timer = 0;
      lightning.flash = 0;
      lightning.doubleStrike = pcgHash(tick, 1, 8421) < 0.4; // 40% chance of double-flash
      if (pcgHash(tick, 2, 8421) < 0.3) showNarration('Distant thunder rolls across the plain');
    }
    return;
  }

  lightning.timer++;
  const hS = HORIZON - VP.y;

  // Flash sequence: brief bright flash, dim, optional second flash
  let flashAlpha = 0;
  if (lightning.timer < 3) {
    flashAlpha = 0.3; // first flash
  } else if (lightning.timer < 6) {
    flashAlpha = 0.05; // afterglow
  } else if (lightning.doubleStrike && lightning.timer > 8 && lightning.timer < 11) {
    flashAlpha = 0.2; // second strike
  } else if (lightning.timer > 15) {
    lightning.active = false;
    return;
  }

  if (flashAlpha > 0.01) {
    // Horizon glow behind the hills
    const glowW = 60 + Math.floor(pcgHash(Math.floor(lightning.x), lightning.timer, 8422) * 40);
    const glowX = Math.floor(lightning.x - glowW / 2);
    for (let y = Math.max(0, hS - 15); y < Math.min(PH, hS + 8); y++) {
      const yFade = 1 - Math.abs(y - hS) / 15;
      const a = flashAlpha * yFade * (0.5 - amb);
      if (a > 0.005) {
        ctx.fillStyle = `rgba(220,230,255,${a})`;
        ctx.fillRect(glowX, y, glowW, 1);
      }
    }

    // Lightning bolt: jagged line from sky to horizon
    if (flashAlpha > 0.15) {
      ctx.fillStyle = `rgba(240,245,255,${flashAlpha * 1.5})`;
      let bx = Math.floor(lightning.x);
      let by = Math.max(0, hS - 20);
      const boltEnd = hS;
      while (by < boltEnd) {
        ctx.fillRect(bx, by, 1, 2);
        by += 2;
        bx += Math.round((pcgHash(bx, by, 8423) - 0.5) * 4); // jagged
        // Occasional branch
        if (pcgHash(bx, by, 8424) < 0.2) {
          const branchDir = pcgHash(bx, by, 8425) < 0.5 ? -1 : 1;
          ctx.fillRect(bx + branchDir, by, 1, 1);
          ctx.fillRect(bx + branchDir * 2, by + 1, 1, 1);
        }
      }
    }
  }
}

function drawShootingStars(tk){const a=getAmbient(simTime);if(a>0.2){shootingStar.active=false;return;}if(!shootingStar.active){if(pcgHash(tk&0x1FF,0,7777)<0.001){shootingStar.active=true;shootingStar.x=rand(20,PW-40);shootingStar.y=rand(5,(HORIZON-VP.y)*0.5);shootingStar.vx=rand(1.5,3)*(pcgHash(tk,1,7777)>0.5?1:-1);shootingStar.vy=rand(0.3,1);shootingStar.life=randInt(15,30);shootingStar.trail=[];}return;}shootingStar.trail.push({x:shootingStar.x,y:shootingStar.y});if(shootingStar.trail.length>8)shootingStar.trail.shift();shootingStar.x+=shootingStar.vx;shootingStar.y+=shootingStar.vy;shootingStar.life--;if(shootingStar.life<=0||shootingStar.x<0||shootingStar.x>PW||shootingStar.y>PH*0.5){shootingStar.active=false;return;}const sa=(0.2-a)/0.2;for(let i=0;i<shootingStar.trail.length;i++){ctx.fillStyle=`rgba(255,255,240,${(i+1)/shootingStar.trail.length*0.6*sa})`;ctx.fillRect(Math.floor(shootingStar.trail[i].x),Math.floor(shootingStar.trail[i].y),1,1);}ctx.fillStyle=`rgba(255,255,250,${0.9*sa})`;ctx.fillRect(Math.floor(shootingStar.x),Math.floor(shootingStar.y),1,1);}

// ── Narration (improved readability) ──
const narration={text:'',alpha:0,timer:0,cooldown:0};
function showNarration(text){if(narration.cooldown>0||_qHide)return;narration.text=text;narration.alpha=0;narration.timer=240;narration.cooldown=600;}
function updateNarration(){if(narration.cooldown>0)narration.cooldown--;if(narration.timer<=0)return;narration.timer--;if(narration.timer>210)narration.alpha=(240-narration.timer)/30;else if(narration.timer<60)narration.alpha=narration.timer/60;else narration.alpha=1;}
function drawNarration(){if(narration.timer<=0||narration.alpha<=0)return;ctx.save();ctx.globalAlpha=narration.alpha*0.85;ctx.font='9px "Segoe UI",system-ui,sans-serif';ctx.textAlign='center';ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillText(narration.text,PW/2+1,PH-15+1);ctx.fillText(narration.text,PW/2-1,PH-15-1);ctx.fillStyle='#e8dcc0';ctx.fillText(narration.text,PW/2,PH-15);ctx.restore();}
let lastNarrationTick=0;
function detectEvents(tk){if(tk-lastNarrationTick<600)return;const h=Math.floor(simTime),m=Math.floor((simTime%1)*60);if(h===5&&m>=15&&m<18){showNarration('First light touches the horizon');lastNarrationTick=tk;return;}if(h===5&&m>=30&&m<33){showNarration('Birds stir in the trees');lastNarrationTick=tk;return;}if(h===6&&m<3){showNarration('Dawn breaks through the mist');lastNarrationTick=tk;return;}if(h===18&&m<3){showNarration('The sun sinks toward the horizon');lastNarrationTick=tk;return;}if(h===20&&m>=30&&m<33){showNarration('Night settles over the plain');lastNarrationTick=tk;return;}for(const a of animals){if(!a.alive)continue;if(a.type==='lion'&&a.state===STATE.STALK){showNarration('A lion begins to stalk...');if(window._playRoar)window._playRoar();lastNarrationTick=tk;return;}if(a.type==='lion'&&a.state===STATE.CHASE){showNarration(a.energy<0.3?'The lion tires...':'The lion charges!');lastNarrationTick=tk;return;}}const fl=animals.filter(a=>a.alive&&a.state===STATE.FLEE);if(fl.length>=3){const names={zebra:'Zebras',gazelle:'Gazelles',wildebeest:'Wildebeest',warthog:'Warthogs'};showNarration((names[fl[0].type]||'The herd')+' scatter in alarm!');if(window._playStampede)window._playStampede();lastNarrationTick=tk;return;}if(animals.filter(a=>a.alive&&a.state===STATE.DRINK).length>=2){showNarration('Animals gather at the waterhole');lastNarrationTick=tk;return;}if(animals.filter(a=>a.alive&&a.state===STATE.GRAZE).length>=6&&tk%1800<30){showNarration('The plain is still');lastNarrationTick=tk;return;}if((simTime<5.5||simTime>20.5)&&animals.filter(a=>a.alive&&a.state===STATE.REST).length>=10&&tk%2400<30){showNarration('The savanna sleeps');lastNarrationTick=tk;return;}}

// ── Config Menu ──
function createConfigMenu(){const ov=document.createElement('div');ov.id='config-overlay';ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;display:none;align-items:center;justify-content:center;';const dl=document.createElement('div');dl.style.cssText='background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:16px 20px;color:#ccc;font:12px/1.8 monospace;min-width:280px;max-width:340px;max-height:80vh;overflow-y:auto;';const ti=document.createElement('div');ti.style.cssText='font-size:14px;font-weight:bold;margin-bottom:10px;color:#e8dcc0;';ti.textContent='Settings';dl.appendChild(ti);
addSlider(dl,'World Width','cfg-ww',400,2400,CFG.worldW,100,v=>{CFG.worldW=v;regenerateWorld();for(const a of animals){a.x=wrapX(a.x);a.homeX=wrapX(a.homeX);}});
addSlider(dl,'Dust Devils','cfg-dd',0,10,Math.round(CFG.dustDevilFreq*20000),1,v=>{CFG.dustDevilFreq=v/20000;},v=>v===0?'Off':v<=3?'Rare':v<=6?'Normal':'Frequent');
const sep=document.createElement('div');sep.style.cssText='border-top:1px solid #333;margin:8px 0;';dl.appendChild(sep);const at=document.createElement('div');at.style.cssText='font-size:11px;color:#a88040;margin-bottom:4px;';at.textContent='Animal Counts';dl.appendChild(at);
for(const type of['zebra','gazelle','wildebeest','warthog','lion','elephant','giraffe','bird'])addSlider(dl,type.charAt(0).toUpperCase()+type.slice(1),'cfg-'+type,0,15,CFG.animalCounts[type],1,v=>{CFG.animalCounts[type]=v;syncAnimalCounts();});
// Reset button
const rb=document.createElement('button');rb.textContent='Reset All';rb.style.cssText='margin-top:12px;margin-right:8px;padding:4px 12px;background:#442222;color:#ccc;border:1px solid #664444;border-radius:4px;cursor:pointer;font:11px monospace;';
rb.addEventListener('click',()=>{
  // Reset time to current real time
  const now=new Date(); window._skipTime(now.getHours()+now.getMinutes()/60);
  // Reset day length to 24h
  dayLengthSec=86400; dayLengthSel.value='86400';
  localStorage.setItem('ss_dayLength','86400');
  // Reset viewport
  VP.x=180; bgDirty=true;
  // Reset animal counts to defaults and respawn
  CFG.animalCounts={zebra:5,gazelle:6,wildebeest:5,warthog:3,lion:2,elephant:3,giraffe:2,bird:7};
  populateAnimals();
  // Reset sliders in config menu
  for(const type of Object.keys(CFG.animalCounts)){
    const sl=document.getElementById('cfg-'+type);
    if(sl){sl.value=CFG.animalCounts[type];sl.dispatchEvent(new Event('input'));}
  }
  showNarration('World reset');
});
dl.appendChild(rb);
const cb=document.createElement('button');cb.textContent='Close';cb.style.cssText='margin-top:12px;padding:4px 12px;background:#333;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer;font:11px monospace;';cb.addEventListener('click',()=>{ov.style.display='none';configMenuOpen=false;});dl.appendChild(cb);ov.appendChild(dl);document.body.appendChild(ov);ov.addEventListener('click',e=>{if(e.target===ov){ov.style.display='none';configMenuOpen=false;}});return ov;}
function addSlider(parent,label,id,min,max,value,step,onChange,fmt){const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px;';const lbl=document.createElement('span');lbl.style.cssText='flex:0 0 90px;font-size:11px;';lbl.textContent=label;const sl=document.createElement('input');sl.type='range';sl.id=id;sl.min=min;sl.max=max;sl.value=value;sl.step=step;sl.style.cssText='flex:1;height:6px;accent-color:#a88040;';const val=document.createElement('span');val.style.cssText='flex:0 0 50px;font-size:10px;text-align:right;color:#888;';val.textContent=fmt?fmt(value):value;sl.addEventListener('input',()=>{const v=Number(sl.value);val.textContent=fmt?fmt(v):v;onChange(v);});row.appendChild(lbl);row.appendChild(sl);row.appendChild(val);parent.appendChild(row);}
const configOverlay=createConfigMenu();
const gearBtn=document.createElement('span');gearBtn.textContent=' [cfg]';gearBtn.style.cssText='cursor:pointer;color:#a88040;';gearBtn.addEventListener('click',e=>{e.stopPropagation();configMenuOpen=!configMenuOpen;configOverlay.style.display=configMenuOpen?'flex':'none';});toggle.parentElement.insertBefore(gearBtn,ctrlBody);

// ── Main Loop ──
const fpsEl=document.getElementById("fps");let lastFpsTime=performance.now(),frameCount=0,logicTick=0;
const LOGIC_HZ=30,LOGIC_DT=1000/LOGIC_HZ;let logicAccumulator=0,lastFrameTime=performance.now();
renderBg();
const GRID_CELL=20;
const GRID_COLS = Math.ceil(WORLD_W / GRID_CELL);
const spatialGrid = {
  cells: new Map(),
  clear() { this.cells.clear(); },
  _key(cx, cy) { return ((cx % GRID_COLS) + GRID_COLS) % GRID_COLS * 10000 + cy; }, // wrap cx
  insert(e) {
    const cx = Math.floor(e.x / GRID_CELL), cy = Math.floor(e.y / GRID_CELL);
    const k = this._key(cx, cy);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push(e);
  },
  query(x, y, r) {
    const res = [];
    const minCx = Math.floor((x - r) / GRID_CELL);
    const maxCx = Math.floor((x + r) / GRID_CELL);
    const minCy = Math.floor((y - r) / GRID_CELL);
    const maxCy = Math.floor((y + r) / GRID_CELL);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const c = this.cells.get(this._key(cx, cy)); // _key wraps cx
        if (c) for (const e of c) res.push(e);
      }
    }
    return res;
  }
};

function logicStep(){logicTick++;spatialGrid.clear();for(const a of animals)if(a.alive)spatialGrid.insert(a);for(const a of animals)a.tick(logicTick);respawnCheck(logicTick);updateDustDevil(logicTick);updateOwl(logicTick);updateVultures(logicTick);sleepShift(logicTick);if(logicTick%30===0)detectEvents(logicTick);}

// Sleeping animals occasionally shift position (flip facing)
function sleepShift(tick) {
  if (tick % 120 !== 0) return; // check every 4 seconds
  for (const a of animals) {
    if (!a.alive || a.state !== STATE.REST) continue;
    if (pcgHash(tick, Math.floor(a.seed * 100), 2718) < 0.01) {
      a.facing *= -1; // roll over
    }
  }
}

function render(){
  const now=performance.now(),frameDt=now-lastFrameTime;lastFrameTime=now;updateTime();applyInput();
  logicAccumulator+=frameDt;let steps=0;while(logicAccumulator>=LOGIC_DT&&steps<4){logicStep();logicAccumulator-=LOGIC_DT;steps++;}if(logicAccumulator>LOGIC_DT*4)logicAccumulator=0;
  const timeDelta=Math.abs(simTime-lastBgTime),vpDelta=Math.abs(wrapDeltaX(VP.x-lastBgVpx));if(timeDelta>0.008||timeDelta>23.9||vpDelta>0.5||bgDirty)renderBg();
  ctx.drawImage(bgCanvas,0,0);
  // Moonlight wash on ground
  const mlAlpha = getMoonlightAlpha(simTime);
  if (mlAlpha > 0.001) {
    const hS = HORIZON - VP.y;
    ctx.fillStyle = `rgba(100,120,160,${mlAlpha})`;
    ctx.fillRect(0, Math.max(0, hS), PW, PH - Math.max(0, hS));
    // Subtle moonlight on sky too
    ctx.fillStyle = `rgba(60,70,100,${mlAlpha * 0.3})`;
    ctx.fillRect(0, 0, PW, Math.max(0, hS));
  }
  drawSunFG();drawWindWaves(logicTick);drawClouds();drawWaterHole(logicTick,animals);updateFootprints(animals);drawFgGrass(logicTick);drawDust(logicTick);drawWindSeeds(logicTick);
  const drawList=[];for(const a of animals)if(a.alive||a.state===STATE.DEAD)drawList.push({y:a.y,type:'a',ref:a});for(const t of trees)drawList.push({y:t.y,type:'t',ref:t});for(const s of shrubs)drawList.push({y:s.y,type:'s',ref:s});drawList.sort((a,b)=>a.y-b.y);for(const d of drawList){if(d.type==='a'){drawShadow(d.ref);d.ref.draw(ctx,VP.x,VP.y);drawRimLight(d.ref);drawExhaustion(d.ref);}else if(d.type==='t')drawTreeDyn(d.ref);else drawShrubDyn(d.ref);}
  updateParticles(animals);drawFireflies(logicTick);drawCrickets(logicTick);updateAnimalCalls(logicTick);drawDustDevil(logicTick);drawShootingStars(logicTick);drawDistantLightning(logicTick);drawHeatShimmer(logicTick);drawMorningMist(logicTick);drawSunRays();drawVultures();drawOwl();drawEyeShine();
  // Window vignette
  ctx.drawImage(vigCanvas, 0, 0);
  // Color grade
  const t=simTime;if(t>17&&t<19.5){ctx.fillStyle=`rgba(200,120,40,${clamp((1-Math.abs(t-18.25)/1.25)*0.06,0,0.06)})`;ctx.fillRect(0,0,PW,PH);}else if(t>5.5&&t<7.5){ctx.fillStyle=`rgba(200,100,80,${clamp((1-Math.abs(t-6.5)/1)*0.04,0,0.04)})`;ctx.fillRect(0,0,PW,PH);}else if(t<5||t>21){ctx.fillStyle='rgba(20,30,60,0.08)';ctx.fillRect(0,0,PW,PH);}
  updateNarration();drawNarration();
  frameCount++;if(now-lastFpsTime>=1000){fpsEl.textContent=frameCount;frameCount=0;lastFpsTime=now;
    const popEl=document.getElementById('pop');
    if(popEl){
      const alive=animals.filter(a=>a.alive);
      const counts={};for(const a of alive)counts[a.type]=(counts[a.type]||0)+1;
      const icons={zebra:'Z',gazelle:'G',wildebeest:'W',warthog:'H',lion:'L',elephant:'E',giraffe:'R',bird:'B'};
      const parts=[];for(const[t,c]of Object.entries(counts))parts.push((icons[t]||t[0])+c);
      popEl.textContent=alive.length+' ('+parts.join(' ')+')';
    }
    // Minimap
    updateMinimap();
  }
  // First visit hint
  if (!localStorage.getItem('ss_visited')) {
    localStorage.setItem('ss_visited', '1');
    setTimeout(() => showNarration('Press ? for controls'), 3000);
  }
  requestAnimationFrame(render);
}
// Minimap: bird's-eye view of the full world
const minimapEl = document.getElementById('minimap');
const mmCtx = minimapEl ? minimapEl.getContext('2d') : null;
const MM_W = 80, MM_H = 24;

// Click minimap to pan viewport
if (minimapEl) {
  let mmDrag = false;
  const mmSetVP = (e) => {
    const rect = minimapEl.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    VP.x = wrapX(mx * WORLD_W - PW / 2);
    bgDirty = true;
  };
  minimapEl.addEventListener('mousedown', (e) => { e.stopPropagation(); mmDrag = true; mmSetVP(e); });
  document.addEventListener('mousemove', (e) => { if (mmDrag) mmSetVP(e); });
  document.addEventListener('mouseup', () => { mmDrag = false; });
  minimapEl.addEventListener('touchstart', (e) => { e.stopPropagation(); mmDrag = true; mmSetVP(e.touches[0]); }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (mmDrag && e.touches.length) mmSetVP(e.touches[0]); }, { passive: true });
  document.addEventListener('touchend', () => { mmDrag = false; });
  minimapEl.style.cursor = 'crosshair';
}

function updateMinimap() {
  if (!mmCtx) return;
  const amb = getAmbient(simTime);
  mmCtx.clearRect(0, 0, MM_W, MM_H);

  // Sky (uses actual sky color keyframes)
  const groundY = Math.floor(MM_H * 0.45);
  const sky = getSkyColors(simTime);
  const skyMid = sky.mid;
  mmCtx.fillStyle = rgb([Math.round(skyMid[0]*0.8), Math.round(skyMid[1]*0.8), Math.round(skyMid[2]*0.8)]);
  mmCtx.fillRect(0, 0, MM_W, groundY);
  // Horizon band
  const skyLow = sky.low;
  mmCtx.fillStyle = rgb([Math.round(skyLow[0]*0.6), Math.round(skyLow[1]*0.6), Math.round(skyLow[2]*0.6)]);
  mmCtx.fillRect(0, groundY - 2, MM_W, 2);
  // Ground
  mmCtx.fillStyle = `rgba(${Math.round(50*amb)},${Math.round(42*amb)},${Math.round(22*amb)},0.9)`;
  mmCtx.fillRect(0, groundY, MM_W, MM_H - groundY);

  // Waterhole
  const whX = Math.floor(waterHole.x / WORLD_W * MM_W);
  const whY = Math.floor((waterHole.y - HORIZON) / (WORLD_H - HORIZON) * (MM_H - groundY)) + groundY;
  mmCtx.fillStyle = `rgba(60,80,120,${0.5 + amb * 0.3})`;
  mmCtx.fillRect(whX - 1, whY, 3, 1);

  // Trees
  mmCtx.fillStyle = `rgba(30,50,20,${0.4 + amb * 0.3})`;
  for (const t of trees) {
    const tx = Math.floor(t.x / WORLD_W * MM_W);
    mmCtx.fillRect(tx, groundY - 1, 1, 2);
  }

  // Animals as colored dots
  const colors = {
    zebra: [220,220,220], gazelle: [180,140,80], wildebeest: [70,65,55],
    warthog: [100,90,75], lion: [200,160,60], elephant: [130,125,115],
    giraffe: [195,165,100], bird: [60,55,50],
  };
  for (const a of animals) {
    if (!a.alive) continue;
    const ax = Math.floor(a.x / WORLD_W * MM_W);
    const c = colors[a.type] || [150,150,150];
    if (a.brain.flying && a.state !== STATE.PERCH && a.state !== STATE.WALK_GROUND) {
      // Birds in sky
      const ay = Math.floor(a.y / HORIZON * groundY);
      mmCtx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.4*amb})`;
      mmCtx.fillRect(ax, clamp(ay, 0, groundY - 1), 1, 1);
    } else {
      // Ground animals
      const ay = Math.floor((a.y - HORIZON) / (WORLD_H - HORIZON) * (MM_H - groundY)) + groundY;
      mmCtx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.5+amb*0.4})`;
      mmCtx.fillRect(ax, clamp(ay, groundY, MM_H - 1), 1, 1);
    }
  }

  // Viewport indicator (white rectangle outline)
  // Viewport indicator (handles wrap)
  const vpX = Math.floor(((VP.x % WORLD_W) + WORLD_W) % WORLD_W / WORLD_W * MM_W);
  const vpW = Math.max(2, Math.floor(PW / WORLD_W * MM_W));
  mmCtx.strokeStyle = `rgba(255,255,255,${0.3 + amb * 0.2})`;
  mmCtx.lineWidth = 0.5;
  mmCtx.strokeRect(vpX, 0, vpW, MM_H);
  // If viewport wraps past right edge, draw second rect at left
  if (vpX + vpW > MM_W) {
    mmCtx.strokeRect(0, 0, vpX + vpW - MM_W, MM_H);
  }
}

// Pre-rendered window vignette overlay
const vigCanvas = document.createElement("canvas");
vigCanvas.width = PW; vigCanvas.height = PH;
function renderVignette() {
  vigCanvas.width = PW; vigCanvas.height = PH;
  const vc = vigCanvas.getContext("2d");
  vc.clearRect(0, 0, PW, PH);
  for (let i = 0; i < 18; i++) {
    const a = 0.4 * (1 - i/18) * (1 - i/18);
    vc.fillStyle = `rgba(8,5,2,${a})`;
    vc.fillRect(0, i, PW, 1);
    vc.fillRect(0, PH-1-i, PW, 1);
    vc.fillRect(i, 0, 1, PH);
    vc.fillRect(PW-1-i, 0, 1, PH);
  }
  for (let cy = 0; cy < 30; cy++) for (let cx = 0; cx < 30; cx++) {
    const d = Math.hypot(cx, cy);
    if (d < 30) {
      const a = 0.2 * (1-d/30) * (1-d/30);
      vc.fillStyle = `rgba(5,3,1,${a})`;
      vc.fillRect(cx, cy, 1, 1);
      vc.fillRect(PW-1-cx, cy, 1, 1);
      vc.fillRect(cx, PH-1-cy, 1, 1);
      vc.fillRect(PW-1-cx, PH-1-cy, 1, 1);
    }
  }
  for (let i = 0; i < 5; i++) { vc.fillStyle = `rgba(50,35,18,${0.06*(1-i/5)})`; vc.fillRect(0, PH-1-i, PW, 1); }
}
renderVignette();

// ── Procedural Ambient Audio ──
// Synthesized via Web Audio API - no audio files needed.
// Activates on first user interaction (browser autoplay policy).
let audioCtx = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Master volume
  const master = audioCtx.createGain();
  master.gain.value = 0.15;
  master.connect(audioCtx.destination);

  // Wind: filtered noise, always present but volume varies
  const windNoise = audioCtx.createBufferSource();
  const noiseLen = audioCtx.sampleRate * 2;
  const noiseBuf = audioCtx.createBuffer(1, noiseLen, audioCtx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
  windNoise.buffer = noiseBuf;
  windNoise.loop = true;
  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 400;
  windFilter.Q.value = 0.5;
  const windGain = audioCtx.createGain();
  windGain.gain.value = 0.08;
  windNoise.connect(windFilter).connect(windGain).connect(master);
  windNoise.start();

  // Cricket scheduler: plays short chirps at night
  function scheduleCricket() {
    const amb = getAmbient(simTime);
    const delay = amb < 0.3 ? rand(0.3, 1.5) : rand(5, 15); // frequent at night
    setTimeout(() => {
      if (!audioCtx || audioCtx.state === 'closed') return;
      if (getAmbient(simTime) < 0.35) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = rand(4000, 5500);
        osc.type = 'sine';
        g.gain.setValueAtTime(0, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.03, audioCtx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.connect(g).connect(master);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.1);
        // Double chirp
        if (Math.random() < 0.6) {
          const osc2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          osc2.frequency.value = osc.frequency.value * rand(0.98, 1.02);
          osc2.type = 'sine';
          g2.gain.setValueAtTime(0, audioCtx.currentTime + 0.12);
          g2.gain.linearRampToValueAtTime(0.025, audioCtx.currentTime + 0.13);
          g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
          osc2.connect(g2).connect(master);
          osc2.start(audioCtx.currentTime + 0.12);
          osc2.stop(audioCtx.currentTime + 0.22);
        }
      }
      scheduleCricket();
    }, delay * 1000);
  }

  // Bird call scheduler: plays at dawn/day
  function scheduleBird() {
    const amb = getAmbient(simTime);
    const isDawn = simTime > 5 && simTime < 8;
    const delay = isDawn ? rand(0.5, 2) : amb > 0.5 ? rand(3, 10) : rand(15, 30);
    setTimeout(() => {
      if (!audioCtx || audioCtx.state === 'closed') return;
      if (getAmbient(simTime) > 0.3) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const baseFreq = rand(1800, 3200);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(baseFreq * rand(1.1, 1.5), audioCtx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(baseFreq * rand(0.8, 1.0), audioCtx.currentTime + 0.2);
        g.gain.setValueAtTime(0, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.connect(g).connect(master);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.3);
      }
      scheduleBird();
    }, delay * 1000);
  }

  // Update wind volume based on time of day
  // Wind gusting: varies volume and filter over time for natural feel
  let windPhase = Math.random() * 100;
  setInterval(() => {
    if (!audioCtx || audioCtx.state === 'closed') return;
    const amb = getAmbient(simTime);
    windPhase += 0.15;
    // Gust pattern: slow sine + faster variation for organic feel
    const gust = 0.7 + Math.sin(windPhase * 0.3) * 0.2 + Math.sin(windPhase * 0.8) * 0.1;
    const baseVol = 0.03 + amb * 0.06;
    windGain.gain.linearRampToValueAtTime(baseVol * gust, audioCtx.currentTime + 1.5);
    // Filter shifts with gusts (higher freq = sharper wind)
    const baseFreq = 250 + amb * 300;
    windFilter.frequency.linearRampToValueAtTime(baseFreq * (0.8 + gust * 0.4), audioCtx.currentTime + 1.5);
  }, 1500);

  // Cicada buzz: continuous droning during hot midday (10:00-15:00)
  let cicadaOsc = null, cicadaGain = null;
  function updateCicada() {
    const isHot = simTime > 10 && simTime < 15;
    const intensity = isHot ? 1 - Math.abs(simTime - 12.5) / 2.5 : 0;
    if (intensity > 0.05 && !cicadaOsc) {
      cicadaOsc = audioCtx.createOscillator();
      cicadaGain = audioCtx.createGain();
      cicadaOsc.type = 'sawtooth';
      cicadaOsc.frequency.value = 4200 + Math.random() * 800;
      // Add tremolo via modulator
      const mod = audioCtx.createOscillator();
      const modGain = audioCtx.createGain();
      mod.frequency.value = 15 + Math.random() * 10; // rapid pulsing
      modGain.gain.value = 0.008;
      mod.connect(modGain).connect(cicadaGain.gain);
      mod.start();
      cicadaGain.gain.value = 0;
      cicadaOsc.connect(cicadaGain).connect(master);
      cicadaOsc.start();
    }
    if (cicadaGain) {
      cicadaGain.gain.linearRampToValueAtTime(intensity * 0.012, audioCtx.currentTime + 2);
    }
    if (intensity <= 0.05 && cicadaOsc) {
      try { cicadaOsc.stop(); } catch(e) {}
      cicadaOsc = null; cicadaGain = null;
    }
  }
  setInterval(updateCicada, 3000);

  scheduleCricket();
  scheduleBird();
}

// Event sound effects (called from detectEvents)
window._playRoar = function() {
  if (!audioCtx || audioMuted) return;
  // Low rumbling roar: filtered noise burst with pitch sweep
  const dur = 1.2;
  const noise = audioCtx.createBufferSource();
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / d.length * 3);
  noise.buffer = buf;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 200; filt.Q.value = 2;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.06, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  noise.connect(filt).connect(g).connect(audioCtx.destination);
  noise.start(); noise.stop(audioCtx.currentTime + dur);
};

window._playStampede = function() {
  if (!audioCtx || audioMuted) return;
  // Rapid low thumps: hoofbeats
  for (let i = 0; i < 8; i++) {
    const t = audioCtx.currentTime + i * 0.08 + Math.random() * 0.03;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = 60 + Math.random() * 30;
    osc.type = 'sine';
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.07);
  }
};

// Mute toggle
let audioMuted = localStorage.getItem('ss_muted') === 'true';
window._toggleMute = function() {
  audioMuted = !audioMuted;
  localStorage.setItem('ss_muted', String(audioMuted));
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = audioMuted ? '\u{1F507}' : '\u{1F50A}';
  if (audioCtx) {
    if (audioMuted) audioCtx.suspend();
    else audioCtx.resume();
  }
};
// Share: copy URL with current time and seed to clipboard
window._shareScene = function() {
  const t = Math.round(simTime * 100) / 100;
  const vp = Math.round(VP.x);
  const url = `${location.origin}${location.pathname}?t=${t}&seed=${WORLD_SEED}&vp=${vp}`;
  navigator.clipboard.writeText(url).then(() => {
    showNarration('Scene link copied');
    const btn = document.getElementById('share-btn');
    if (btn) { btn.textContent = '\u2705'; setTimeout(() => { btn.textContent = '\u{1F517}'; }, 2000); }
  }).catch(() => {
    // Fallback: show URL in prompt
    prompt('Scene link:', url);
  });
};

// Init mute button state
if (audioMuted) {
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = '\u{1F507}';
}

// Start audio on first user interaction (if not muted)
['click', 'keydown', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { if (!audioMuted) initAudio(); }, { once: false })
);

render();
