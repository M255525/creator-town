/* ================= 創作者小鎮：立體漫遊 =================
 * 切到「立體」檢視時才載入 Three.js。地形、建築、河流、道路、樹、人物全部沿用 index.html 的資料
 * （TOOLS／ZONES／RIVER_S／ROAD_S／HILLS／WATERS／L.trees／walker／PEERS），不另外維護一份島。
 * 座標：x = gx、z = gy、y = 高度；SVG 像素高度 × HK = 立體單位。
 */
(function(){
'use strict';
var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
var KEY_3D = 'creatorTown3d';
var HK = 1 / 30, SEA = .2, LAND = .5, DECK = .58;
var T3 = null, loading = null, built = false, active = false, failed = false;
var renderer, scene, camera, hemi, sun, raycaster, ndc;
var world = $('world3d'), canvas = $('c3d'), labRoot = $('lab3d');
var prefs = lsGet(KEY_3D, {sky:'now', sound:false, hint:true});
var cam = {yaw:Math.PI / 4, pitch:.55, dist:8.5, tx:0, ty:0, tz:0, overview:false, ovYaw:0};
var O = {blds:{}, pick:[], tags:[], zoneTags:[], avs:{}, lamps:[], anim:[]};
var keys = {}, lastT = 0, rafId = 0, sky = {dk:-1}, lastZone = null, bannerT = 0;

var PAL = {grass:'#a6d47a', grass2:'#98ca6a', sand:'#d6cfc0', wet:'#8b8578', deep:'#1f6f8f', shallow:'#5fb8c8',
  park:'#86cf62', lawn:'#b8e58f', yard:'#eadcc0', paving:'#e2ddd3', wood:'#cdb79a', road:'#f1ede4',
  hilltop:'#e6dccb', hillside:'#c9b9a0', rim:'#b3ab9b', ballast:'#b9ad9a'};
var INK = '#3b2f3a';                                              // 描邊色：深褐紫，比純黑柔和
var CREAM = {house:1, pavilion:1, school:1, civic:1, lighthouse:1};

function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T3.Color(h); }
function hexMix(a, b, t){ return mix(a, b, t); }
function groundKey(z){ var m = /--([a-z]+)/.exec(z.ground || ''); return m ? m[1] : 'grass'; }

/* ---------- 地形高度 ---------- */
function hillAt(gx, gy){
  var e = 0;
  HILLS.forEach(function(H){
    var d = Math.hypot(gx - H.at[0], gy - H.at[1]);
    H.layers.forEach(function(Ly){ var v = Ly[1] * (1 - smooth(Ly[0] - .07, Ly[0] + .05, d)); if (v > e) e = v; });   // 階梯看台：每一階是直角
  });
  return e * HK;
}
function edgeD(gx, gy){ var dx = gx - C[0], dy = gy - C[1]; return Math.hypot(dx, dy) - islandR(Math.atan2(dy, dx)); }
function landY(gx, gy){
  var d = edgeD(gx, gy);
  var y = d <= 0 ? LAND : LAND - smooth(0, .1, d) * (LAND + .4);  // 岸壁：陸地到水面是一道直牆
  if (d > .1) y = Math.max(-1.7, -.4 - (d - .1) * .3);           // 港內水深
  y += hillAt(gx, gy) * (1 - smooth(-.6, .1, d));
  var rd = riverDist(gx, gy);
  if (rd < .7) y += (-.25 - y) * (1 - smooth(.52, .62, rd));      // 運河：石砌直壁
  WATERS.forEach(function(w){ var wd = Math.hypot(gx - w.at[0], gy - w.at[1]); if (wd < w.r + .35) y += (.06 - y) * (1 - smooth(w.r - .12, w.r + .3, wd)); });
  return y;
}
function onBridge(gx, gy){ return riverDist(gx, gy) < .85 && minDist(BRIDGE_S, gx, gy) < .42; }
function standY(gx, gy){
  if (farBridgeDist(gx, gy) < .3) return LAND + .12;            // 跨海大橋橋面
  if (onFarIsland(gx, gy, -.1)) return LAND + .09;               // 對面小島
  var y = landY(gx, gy); return onBridge(gx, gy) ? Math.max(y, DECK + .04) : Math.max(y, SEA - .05); }

function zoneOfPoint(gx, gy){
  for (var i = 0; i < ZONES.length; i++){ var b = ZONES[i].box; if (gx > b[0] && gx < b[2] && gy > b[1] && gy < b[3]) return ZONES[i]; }
  return null;
}
function terrainColor(gx, gy, y, n){
  var d = edgeD(gx, gy);
  if (y < SEA + .03){ var depth = SEA - y; return hexMix(PAL.wet, PAL.deep, smooth(-.05, 1.5, depth)); }
  if (d > -.03) return PAL.wet;                                  // 岸壁牆面
  if (d > -.5) return PAL.sand;                                  // 岸邊混凝土收邊
  if (trackDist(gx, gy) < .34) return PAL.ballast;               // 輕軌道床
  var c = n > .5 ? PAL.grass : PAL.grass2, h = hillAt(gx, gy);
  if (h > .03) c = hexMix(PAL.hillside, PAL.hilltop, Math.min(1, h / (26 * HK)));
  GREENS.forEach(function(G){ if (Math.hypot(gx - G.at[0], gy - G.at[1]) < G.r) c = PAL.park; });
  var z = zoneOfPoint(gx, gy);
  if (z && z.id !== 'strategy') c = hexMix(PAL[groundKey(z)] || PAL.grass, z.color, .22);   // 地面帶場地主色，一眼分得出區塊
  if (z && z.id === 'brand' && gx > 6.95 && gx < 7.65) c = PAL.road;
  var rd = riverDist(gx, gy);
  if (rd < .9) c = hexMix(c, PAL.rim, 1 - smooth(.78, .9, rd));
  if (rd < .62) c = PAL.wet;
  WATERS.forEach(function(w){ var wd = Math.hypot(gx - w.at[0], gy - w.at[1]); if (wd < w.r + .45) c = hexMix(c, w === WATERS[1] ? '#d8d0bd' : PAL.rim, 1 - smooth(w.r + .2, w.r + .45, wd)); });
  return c;
}

/* ---------- 建場景 ---------- */
// 卡通著色：三段色階的 MeshToonMaterial（亮面／陰影面分明，像動畫賽璐璐上色）
var GRAD = null;
function toonGrad(){
  if (GRAD) return GRAD;
  GRAD = new T3.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, T3.RedFormat);
  GRAD.minFilter = GRAD.magFilter = T3.NearestFilter; GRAD.generateMipmaps = false; GRAD.needsUpdate = true;
  return GRAD;
}
function std(c, o){
  o = o || {}; o.color = c; delete o.roughness; delete o.metalness; delete o.flatShading;
  o.gradientMap = toonGrad();
  return new T3.MeshToonMaterial(o);
}
// 描邊：背面外推法（inverted hull）。外推方向用「同一位置的平均法線」，方塊轉角才不會裂開
var INK_MATS = {};
function inkMat(th){
  var k = th.toFixed(4);
  if (INK_MATS[k]) return INK_MATS[k];
  var m = new T3.MeshBasicMaterial({color:INK, side:T3.BackSide});
  m.onBeforeCompile = function(sh){
    sh.vertexShader = 'attribute vec3 onrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(onrm) * ' + k + ';');
  };
  m.customProgramCacheKey = function(){ return 'ink' + k; };
  return (INK_MATS[k] = m);
}
function ensureOnrm(g){
  if (g.attributes.onrm) return;
  if (!g.attributes.normal) g.computeVertexNormals();
  var p = g.attributes.position, n = g.attributes.normal, acc = {}, out = new Float32Array(p.count * 3), i, key, a;
  for (i = 0; i < p.count; i++){
    key = Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
    a = acc[key] || (acc[key] = [0, 0, 0]); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
  }
  for (i = 0; i < p.count; i++){
    key = Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
    a = acc[key]; var l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  g.setAttribute('onrm', new T3.BufferAttribute(out, 3));
}
function noPick(){}
function inkMesh(m, th){
  ensureOnrm(m.geometry);
  var o = m.isInstancedMesh ? new T3.InstancedMesh(m.geometry, inkMat(th), m.count) : new T3.Mesh(m.geometry, inkMat(th));
  if (m.isInstancedMesh){ o.instanceMatrix = m.instanceMatrix; o.frustumCulled = false; m.parent.add(o); }
  else m.add(o);
  o.raycast = noPick; o.userData.ink = true; o.castShadow = false; o.receiveShadow = false;
  return o;
}
function inkAll(g, th){
  var list = [], out = [];
  g.traverse(function(m){ if (m.isMesh && !m.userData.ink && !m.userData.noInk) list.push(m); });
  list.forEach(function(m){ out.push(inkMesh(m, th)); });
  g.userData.inks = out;
  return g;
}
function shadowAll(g){ g.traverse(function(m){ if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } }); return g; }

function buildTerrain(){
  var x0 = -6, x1 = 24, step = .2, n = Math.round((x1 - x0) / step) + 1;
  var pos = new Float32Array(n * n * 3), cols = new Float32Array(n * n * 3), idx = [], c = new T3.Color();
  for (var j = 0; j < n; j++) for (var i = 0; i < n; i++){
    var gx = x0 + i * step, gy = x0 + j * step, y = landY(gx, gy), k = (j * n + i) * 3;
    var noise = .5 + .5 * Math.sin(gx * 1.7 + Math.sin(gy * 1.3) * 2) * Math.cos(gy * 1.1 - gx * .4);
    pos[k] = gx; pos[k + 1] = y; pos[k + 2] = gy;
    c.set(terrainColor(gx, gy, y, noise));
    var v = .94 + noise * .08; cols[k] = c.r * v; cols[k + 1] = c.g * v; cols[k + 2] = c.b * v;
    if (i < n - 1 && j < n - 1){ var a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
  }
  var g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.BufferAttribute(pos, 3));
  g.setAttribute('color', new T3.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  var m = new T3.Mesh(g, new T3.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad()}));
  m.receiveShadow = true; m.name = 'terrain';
  var bed = new T3.Mesh(new T3.PlaneGeometry(160, 160), std(PAL.deep, {roughness:1})); bed.rotation.x = -Math.PI / 2; bed.position.set(C[0], -1.72, C[1]); scene.add(bed);
  scene.add(m); O.terrain = m;
}

function buildWater(){
  var g = new T3.PlaneGeometry(120, 120, 90, 90); g.rotateX(-Math.PI / 2); g.translate(C[0], SEA, C[1]);
  var m = new T3.Mesh(g, new T3.MeshToonMaterial({color:'#47c6e6', transparent:true, opacity:.82, gradientMap:toonGrad()}));
  m.receiveShadow = true; scene.add(m);
  O.water = m; O.waterBase = Float32Array.from(g.attributes.position.array);
  // 浪花：沿海岸一圈
  var ring = [], N = 160;
  for (var i = 0; i <= N; i++){ var a = i / N * Math.PI * 2, r = islandR(a) + .14; ring.push(new T3.Vector3(C[0] + Math.cos(a) * r, SEA + .012, C[1] + Math.sin(a) * r)); }
  var foamG = new T3.TubeGeometry(new T3.CatmullRomCurve3(ring, true), 240, .07, 4, true);
  O.foam = new T3.Mesh(foamG, new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.6}));
  O.foam.scale.y = .25; O.foam.position.y = SEA * .75;
  scene.add(O.foam);
}

function ribbon(points, half, lift, mat){
  var pos = [], idx = [];
  points.forEach(function(p, i){
    var a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * half, ny = dx / l * half;
    pos.push(p[0] + nx, landY(p[0] + nx, p[1] + ny) + lift, p[1] + ny, p[0] - nx, landY(p[0] - nx, p[1] - ny) + lift, p[1] - ny);
    if (i){ var k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  var g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  var m = new T3.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
function buildRoads(){
  var mat = std(PAL.road, {roughness:.9, polygonOffset:true, polygonOffsetFactor:-2, side:T3.DoubleSide});
  var edge = std('#c9c0a6', {roughness:.95, polygonOffset:true, polygonOffsetFactor:-1, side:T3.DoubleSide});
  var plank = std('#eef1f3'), beam = std('#4f7699'), lampPole = std('#3c4a52', {roughness:.5}), bulbMat = std('#fff3c4', {emissive:'#ffcf6b', emissiveIntensity:0});
  O.bulbMat = bulbMat;
  for (var s = 0; s + 48 < ROAD_S.length; s += 49){
    var road = ROAD_S.slice(s, s + 49), runs = [], run = [], land = [], seg = [];
    road.forEach(function(q, i){
      var wet = riverDist(q[0], q[1]) < .78;
      if (wet){ run.push(q); if (seg.length){ land.push(seg); seg = []; } }
      else { seg.push(q); if (run.length){ runs.push(run); run = []; } }
    });
    if (seg.length) land.push(seg); if (run.length) runs.push(run);
    land.forEach(function(sg){ if (sg.length > 1){ ribbon(sg, .27, .025, edge); ribbon(sg, .22, .035, mat); } });
    runs.forEach(function(rn){                                   // 白色鋼拱橋
      var a = rn[0], b = rn[rn.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) + .9, ang = Math.atan2(dx, dy);
      var g = new T3.Group(); g.position.set((a[0] + b[0]) / 2, DECK, (a[1] + b[1]) / 2); g.rotation.y = ang;
      var deck = new T3.Mesh(new T3.BoxGeometry(.56, .07, len), plank); g.add(deck);
      [-.3, .3].forEach(function(x){
        var rail = new T3.Mesh(new T3.BoxGeometry(.04, .04, len), beam); rail.position.set(x, .2, 0); g.add(rail);
        for (var z = -len / 2 + .1; z <= len / 2; z += .35){ var post = new T3.Mesh(new T3.BoxGeometry(.05, .2, .05), beam); post.position.set(x, .1, z); g.add(post); }
      });
      [-.3, .3].forEach(function(x){ var ar = new T3.Mesh(new T3.TorusGeometry(len / 2, .025, 6, 28, Math.PI), plank); ar.rotation.y = Math.PI / 2; ar.scale.set(1, .38, 1); ar.position.set(x, .02, 0); g.add(ar); });
      scene.add(inkAll(shadowAll(g), .014));
    });
    // 路燈
    road.forEach(function(q, i){
      if (i % 12 !== 6 || riverDist(q[0], q[1]) < 1.1) return;
      var a = road[Math.max(0, i - 1)], b = road[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      var px = q[0] - dy / l * .34, py = q[1] + dx / l * .34;
      if (TOOLS.some(function(t){ return Math.abs(px - t.gx) < t.s + .2 && Math.abs(py - t.gy) < t.s + .2; })) return;
      var y = landY(px, py), pole = new T3.Mesh(new T3.CylinderGeometry(.018, .025, .55, 6), lampPole);
      pole.position.set(px, y + .275, py); pole.castShadow = true; scene.add(pole);
      var bulb = new T3.Mesh(new T3.SphereGeometry(.05, 10, 8), bulbMat); bulb.position.set(px, y + .58, py); scene.add(bulb);
      O.lamps.push(bulb);
    });
  }
}

/* ---------- 建築 ---------- */
var winCanvas = null;
function windowTextures(){
  if (winCanvas) return winCanvas;
  function mk(wall, glass){
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var x = c.getContext('2d'); x.fillStyle = wall; x.fillRect(0, 0, 32, 32); x.fillStyle = glass; x.fillRect(8, 9, 16, 15);
    var t = new T3.CanvasTexture(c); t.wrapS = t.wrapT = T3.RepeatWrapping; t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  winCanvas = {map:mk('#ffffff', '#8fa9b8'), emi:mk('#000000', '#ffffff')};
  winCanvas.emi.colorSpace = T3.NoColorSpace;
  return winCanvas;
}
var texCache = {};
function patternTex(kind){                                        // 紅磚牆（含一扇窗）／鐵皮浪板（頂端一排氣窗）
  if (texCache[kind]) return texCache[kind];
  function mk(night){
    var c = document.createElement('canvas'); c.width = 64; c.height = 64; var x = c.getContext('2d');
    if (kind === 'brick'){
      x.fillStyle = night ? '#000' : '#b85c43'; x.fillRect(0, 0, 64, 64);
      if (!night){ x.fillStyle = 'rgba(70,25,15,.35)'; for (var y = 0; y < 64; y += 8){ x.fillRect(0, y, 64, 1.5); for (var k = (y / 8) % 2 ? 8 : 0; k < 64; k += 16) x.fillRect(k, y, 1.5, 8); } }
      x.fillStyle = night ? '#fff' : '#8fa9b8'; x.beginPath(); x.moveTo(22, 52); x.lineTo(22, 26); x.arc(32, 26, 10, Math.PI, 0); x.lineTo(42, 52); x.fill();
      if (!night){ x.strokeStyle = '#f4efe6'; x.lineWidth = 2; x.stroke(); }
    } else {
      x.fillStyle = night ? '#000' : '#a3adb3'; x.fillRect(0, 0, 64, 64);
      if (!night){ x.fillStyle = 'rgba(0,0,0,.16)'; for (var i = 0; i < 64; i += 8) x.fillRect(i, 0, 3, 64); }
      x.fillStyle = night ? '#fff' : '#8fa9b8'; x.fillRect(6, 6, 52, 9);
    }
    var t = new T3.CanvasTexture(c); t.wrapS = t.wrapT = T3.RepeatWrapping; t.anisotropy = 4;
    t.colorSpace = night ? T3.NoColorSpace : T3.SRGBColorSpace; return t;
  }
  return (texCache[kind] = {map:mk(false), emi:mk(true)});
}
function patternMat(kind, cols, rows){
  var w = patternTex(kind), map = w.map.clone(), emi = w.emi.clone();
  map.repeat.set(cols, rows); emi.repeat.set(cols, rows); map.needsUpdate = emi.needsUpdate = true;
  return std('#ffffff', {map:map, emissive:'#ffd27a', emissiveMap:emi, emissiveIntensity:0});
}
function muralTex(z, hv){                                          // 側牆的抽象彩繪（程式自繪的原創圖案）
  return canvasTex(128, 96, function(x, w, h){
    var C2 = [z.color, '#ffd23f', '#4f9dff', '#ef6b8a', '#2ec4b6', '#9d8cf2'];
    x.fillStyle = '#f4efe6'; x.fillRect(0, 0, w, h);
    x.fillStyle = C2[(hv + 1) % 6]; x.beginPath(); x.arc(w * (.25 + (hv % 3) * .1), h * .55, 30, 0, 7); x.fill();
    x.fillStyle = C2[(hv + 3) % 6]; x.beginPath(); x.moveTo(w * .45, h); x.lineTo(w * .8, h * .15); x.lineTo(w, h); x.fill();
    x.strokeStyle = C2[0]; x.lineWidth = 7; x.beginPath(); for (var i = 0; i <= 8; i++) x.lineTo(i * 16, h * .3 + Math.sin(i + hv) * 10); x.stroke();
  });
}
function numberTex(n){
  return canvasTex(64, 40, function(x, w, h){ x.fillStyle = '#f4efe6'; x.fillRect(0, 0, w, h); x.fillStyle = '#3b2f3a'; x.font = '700 28px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.fillText(n, w / 2, 30); });
}
function wallMat(color, cols, rows){
  var w = windowTextures(), map = w.map.clone(), emi = w.emi.clone();
  map.repeat.set(cols, rows); emi.repeat.set(cols, rows); map.needsUpdate = emi.needsUpdate = true;
  return std(color, {map:map, emissive:'#ffd27a', emissiveMap:emi, emissiveIntensity:0, roughness:.7});
}
function gable(w, d, rh, mat){
  var sh = new T3.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, rh); sh.lineTo(-w / 2, 0);
  var g = new T3.ExtrudeGeometry(sh, {depth:d, bevelEnabled:false}); g.translate(0, 0, -d / 2);
  return new T3.Mesh(g, mat);
}
function pyramid(w, rh, mat){ var g = new T3.ConeGeometry(w * .74, rh, 4); g.rotateY(Math.PI / 4); var m = new T3.Mesh(g, mat); m.position.y = rh / 2; return m; }

function buildBuilding(t){
  var z = zoneById[t.zone], st = t.style, w = t.s * 2, h = t.h * HK, rh = t.roof * HK, hv = hash(t.id);
  var base = Math.min(landY(t.gx, t.gy), landY(t.gx - t.s, t.gy - t.s), landY(t.gx + t.s, t.gy - t.s), landY(t.gx - t.s, t.gy + t.s), landY(t.gx + t.s, t.gy + t.s));
  var g = new T3.Group(); g.position.set(t.gx, base, t.gy);
  var wall = CREAM[st] ? '#f3ead9' : hexMix(z.color, '#ffffff', .5), accent = hexMix(z.color, '#14303d', .3);
  var roofM = std(z.color, {roughness:.6}), accM = std(accent), wallPlain = std(wall);
  var cols = Math.max(1, Math.round(w / .26)), rows = Math.max(1, Math.round(h / .42));
  var wm = st === 'pavilion' || st === 'civic' || st === 'lighthouse' || st === 'container' ? null
         : st === 'brick' || st === 'shop' ? patternMat('brick', cols, st === 'brick' ? 1 : Math.max(1, rows))
         : st === 'warehouse' ? patternMat('steel', Math.max(2, cols * 2), 1)
         : wallMat(wall, cols, st === 'house' ? 1 : rows);
  if (st === 'brick' || st === 'shop') wallPlain = std('#b85c43');
  if (st === 'brick' || st === 'warehouse') roofM = std(hexMix('#66737c', z.color, .3));
  var foot = new T3.Mesh(new T3.BoxGeometry(w + .12, .4, w + .12), std('#cfc6b4')); foot.position.y = -.17; g.add(foot);
  var top = h;

  function body(height, mat, width){ var bw = width || w, m = new T3.Mesh(new T3.BoxGeometry(bw, height, bw), mat); m.position.y = height / 2; g.add(m); return m; }
  if (st === 'pavilion'){
    var floor = new T3.Mesh(new T3.CylinderGeometry(w * .7, w * .74, .08, 8), std('#e8dcc6')); floor.position.y = .04; g.add(floor);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(p){ var post = new T3.Mesh(new T3.CylinderGeometry(.035, .035, h, 8), std('#9a6b3f')); post.position.set(p[0] * w * .38, h / 2, p[1] * w * .38); g.add(post); });
    var lantern = new T3.Mesh(new T3.SphereGeometry(.07, 12, 10), std('#fff1c9', {emissive:'#ffc35c', emissiveIntensity:0})); lantern.position.y = h - .12; g.add(lantern);
    t.emis = [lantern.material];
    var r = pyramid(w * 1.25, rh, roofM); r.position.y += h; g.add(r); top = h + rh;
  } else if (st === 'container'){                               // 兩個錯開疊起來的貨櫃
    var BOXC = ['#e05a47', '#f4b942', '#4f9dff', '#2ec4b6', '#9d8cf2', '#ef6b8a', '#6bbf59'];
    var c2 = BOXC[hv % 7] === z.color ? BOXC[(hv + 1) % 7] : BOXC[hv % 7], hb = h / 2;
    function ribTex(cc){ return canvasTex(64, 32, function(x, w2, h2){ x.fillStyle = cc; x.fillRect(0, 0, w2, h2); x.fillStyle = 'rgba(0,0,0,.18)'; for (var i = 0; i < w2; i += 6) x.fillRect(i, 0, 2, h2); }); }
    var b1 = new T3.Mesh(new T3.BoxGeometry(w, hb, w * .72), std('#ffffff', {map:ribTex(z.color)})); b1.position.y = hb / 2; g.add(b1);
    var b2 = new T3.Mesh(new T3.BoxGeometry(w * .9, hb, w * .6), std('#ffffff', {map:ribTex(c2)})); b2.position.set(hv % 2 ? .1 : -.1, hb * 1.5, .05); g.add(b2);
    var glassM = std('#8fb6c8', {emissive:'#ffd27a', emissiveIntensity:0});
    [[0, hb * .5, w * .36 + .006, w * .5], [b2.position.x, hb * 1.5, .05 + w * .3 + .006, w * .4]].forEach(function(q){ var gl = new T3.Mesh(new T3.PlaneGeometry(q[3], hb * .5), glassM); gl.position.set(q[0], q[1], q[2]); gl.userData.noInk = true; g.add(gl); });
    t.emis = [glassM]; top = h;
  } else if (st === 'lighthouse'){
    var tower = new T3.Mesh(new T3.CylinderGeometry(.17, .27, h, 18), wallPlain); tower.position.y = h / 2; g.add(tower);
    [.25, .6].forEach(function(f){ var band = new T3.Mesh(new T3.CylinderGeometry(.27 - f * .1 + .006, .27 - (f + .12) * .1 + .006, h * .12, 18), std('#e05a47')); band.position.y = h * (f + .06); g.add(band); });
    var lampM = std('#fff6d0', {emissive:'#ffd36b', emissiveIntensity:.3, transparent:true, opacity:.9});
    var lamp = new T3.Mesh(new T3.CylinderGeometry(.15, .15, .2, 12), lampM); lamp.position.y = h + .1; g.add(lamp);
    var cap = new T3.Mesh(new T3.ConeGeometry(.2, rh + .1, 12), std('#e05a47')); cap.position.y = h + .2 + (rh + .1) / 2; g.add(cap);
    var beam = new T3.Mesh(new T3.ConeGeometry(.9, 6, 20, 1, true), new T3.MeshBasicMaterial({color:'#ffe9a3', transparent:true, opacity:0, depthWrite:false, side:T3.DoubleSide, blending:T3.AdditiveBlending}));
    beam.geometry.translate(0, -3, 0); beam.rotation.z = Math.PI / 2; beam.userData.noInk = true;
    var pivot = new T3.Group(); pivot.position.y = h + .1; pivot.add(beam); g.add(pivot);
    O.beam = {pivot:pivot, mat:beam.material}; t.emis = [lampM]; top = h + rh + .3;
  } else {
    var main = body(h, wm ? [wm, wm, wallPlain, wallPlain, wm, wm] : wallPlain);
    if (wm) t.emis = [wm];
    if (st === 'house' || st === 'warehouse' || st === 'brick'){
      var gr = gable(w + .14, w + .14, rh || .3, roofM); gr.position.y = h; g.add(gr); top = h + (rh || .3);
      var big = st !== 'house';
      var door = new T3.Mesh(new T3.BoxGeometry(big ? w * .42 : .16, big ? h * .62 : .26, .02), std(big ? z.color : '#8a5a34'));
      door.position.set(0, (big ? h * .62 : .26) / 2, w / 2 + .011); g.add(door);
      if (big){ var trim = new T3.Mesh(new T3.BoxGeometry(w + .16, .04, .04), std(z.color)); trim.position.set(0, h + .01, w / 2 + .07); g.add(trim); }
      if (st === 'brick'){
        var mu = new T3.Mesh(new T3.PlaneGeometry(w * .82, h * .78), std('#ffffff', {map:muralTex(z, hv)})); mu.rotation.y = Math.PI / 2; mu.position.set(w / 2 + .012, h * .45, 0); mu.userData.noInk = true; g.add(mu);
        var nn = String(TOOLS.indexOf(t) + 1); if (nn.length < 2) nn = '0' + nn;
        var plate = new T3.Mesh(new T3.PlaneGeometry(.24, .15), std('#ffffff', {map:numberTex(nn)})); plate.position.set(0, h + (rh || .3) * .42, w / 2 + .075); plate.userData.noInk = true; g.add(plate);
      }
      if (st === 'house'){ var ch = new T3.Mesh(new T3.BoxGeometry(.1, .25, .1), std('#9b6b4b')); ch.position.set(w * .25, h + .22, -w * .15); g.add(ch); }
    } else if (st === 'school'){
      var slab = new T3.Mesh(new T3.BoxGeometry(w + .1, .07, w + .1), roofM); slab.position.y = h + .035; g.add(slab);
      var pole = new T3.Mesh(new T3.CylinderGeometry(.015, .015, .8, 6), std('#3c4a52')); pole.position.set(-w / 2 + .08, h + .4, -w / 2 + .08); g.add(pole);
      var flag = new T3.Mesh(new T3.PlaneGeometry(.32, .2), std(z.color, {side:T3.DoubleSide})); flag.position.set(-w / 2 + .25, h + .68, -w / 2 + .08); flag.userData.noInk = true; g.add(flag);
      O.anim.push(function(tm){ flag.rotation.y = Math.sin(tm * 3 + hv) * .25; });
      var clockM = new T3.Mesh(new T3.CylinderGeometry(.11, .11, .02, 20), std('#ffffff')); clockM.rotation.x = Math.PI / 2; clockM.position.set(0, h - .2, w / 2 + .012); g.add(clockM);
      top = h + .9;
    } else if (st === 'civic'){
      main.scale.set(.82, 1, .82);
      var podium = new T3.Mesh(new T3.BoxGeometry(w + .2, .1, w + .2), std('#e8e1d2')); podium.position.y = .05; g.add(podium);
      var colM = std('#ffffff'), face = w * .41 + .06;
      [-.36, -.12, .12, .36].forEach(function(f){
        [[f * w, face], [face, f * w]].forEach(function(p){ var c2 = new T3.Mesh(new T3.CylinderGeometry(.045, .05, h - .1, 10), colM); c2.position.set(p[0], h / 2, p[1]); g.add(c2); });
      });
      var roof = new T3.Mesh(new T3.BoxGeometry(w + .16, .1, w + .16), accM); roof.position.y = h + .05; g.add(roof);
      var ped = gable(w + .16, w + .16, .22, roofM); ped.position.y = h + .1; g.add(ped);
      top = h + .35;
    } else if (st === 'shop'){
      var roofS = new T3.Mesh(new T3.BoxGeometry(w + .04, .05, w + .04), accM); roofS.position.y = h + .025; g.add(roofS);
      [0, 1].forEach(function(side){
        for (var i = 0; i < 6; i++){
          var stripe = new T3.Mesh(new T3.BoxGeometry(w / 6, .02, .26), std(i % 2 ? '#ffffff' : z.color));
          var a = new T3.Group(); a.add(stripe); stripe.position.z = .13;
          a.position.set(-w / 2 + w / 12 + i * w / 6, .48, w / 2); a.rotation.x = .45;
          var holder = new T3.Group(); holder.add(a); holder.rotation.y = side ? Math.PI / 2 : 0; g.add(holder);
        }
      });
      top = h + .05;
    } else if (st === 'observatory'){
      var dome = new T3.Mesh(new T3.SphereGeometry(w * .45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#eef2f4', {roughness:.35, metalness:.3}));
      dome.position.y = h; g.add(dome);
      var slit = new T3.Mesh(new T3.BoxGeometry(.06, .02, w * .9), accM); slit.position.y = h + w * .44; g.add(slit);
      top = h + w * .45;
    } else if (st === 'spire'){
      main.scale.set(.8, 1, .8);
      var step2 = new T3.Mesh(new T3.BoxGeometry(w * .55, .35, w * .55), std(z.color, {roughness:.5})); step2.position.y = h + .175; g.add(step2);
      var ant = new T3.Mesh(new T3.CylinderGeometry(.012, .02, .9, 6), std('#14303d')); ant.position.y = h + .8; g.add(ant);
      var orbM = std('#ff6f59', {emissive:'#ff6f59', emissiveIntensity:1});
      var orb = new T3.Mesh(new T3.SphereGeometry(.07, 14, 10), orbM); orb.position.y = h + 1.27; g.add(orb);
      O.anim.push(function(tm){ orbM.emissiveIntensity = .6 + .6 * Math.abs(Math.sin(tm * 2.2)); });
      top = h + 1.35;
    } else {                                                   // office、tower
      var cap2 = new T3.Mesh(new T3.BoxGeometry(w + .04, .06, w + .04), roofM); cap2.position.y = h + .03; g.add(cap2);
      if (hv % 2){ var rb = .22 + (hv % 3) * .1, box = new T3.Mesh(new T3.BoxGeometry(w * .42, rb, w * .42), accM); box.position.y = h + rb / 2; g.add(box); top = h + rb; }
      if (st === 'tower' && hv % 3 === 0){ var ant2 = new T3.Mesh(new T3.CylinderGeometry(.01, .01, .5, 5), std('#14303d')); ant2.position.y = top + .25; g.add(ant2); top += .5; }
    }
  }
  // 探索過的小旗
  var fl = new T3.Group(); fl.position.set(w * .3, top + .02, w * .3);
  var fp = new T3.Mesh(new T3.CylinderGeometry(.01, .01, .45, 5), std('#14303d')); fp.position.y = .22; fl.add(fp);
  var ff = new T3.Mesh(new T3.PlaneGeometry(.22, .13), std('#ff6f59', {side:T3.DoubleSide})); ff.position.set(.11, .38, 0); ff.userData.noInk = true; fl.add(ff);
  fl.visible = false; g.add(fl);
  shadowAll(g);
  g.traverse(function(m){ if (m.isMesh){ m.userData.id = t.id; O.pick.push(m); } });
  scene.add(g);
  var mats = [];
  g.traverse(function(m){ if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach(function(mt){ if (mats.indexOf(mt) < 0){ mt.userData.op = mt.opacity; mats.push(mt); } }); });
  inkAll(g, .016);
  O.blds[t.id] = {t:t, g:g, flag:fl, base:base, top:base + top, mats:mats, lines:g.userData.inks, fade:1, box:new T3.Box3().setFromObject(g)};
}

function buildDecor(){
  // 學校操場
  // 創作學院的露天舞台：木舞台＋三層半圓座位
  var tc = [11.0, 1.3], ty = landY(tc[0], tc[1]), stage = new T3.Group(); stage.position.set(tc[0], ty, tc[1]);
  var deck2 = new T3.Mesh(new T3.CylinderGeometry(.42, .44, .12, 28), std('#b07a4a')); deck2.position.y = .06; stage.add(deck2);
  [.95, .78, .61].forEach(function(r, i){ var seat = new T3.Mesh(new T3.CylinderGeometry(r, r, .06 * (3 - i), 28, 1, false, 0, Math.PI), std(i % 2 ? '#d8cbb3' : '#c4b393')); seat.position.y = .03 * (3 - i); stage.add(seat); });
  stage.rotation.y = Math.PI * .75; scene.add(inkAll(shadowAll(stage), .012));
  // 噴水池
  var f = WATERS[1], fy = SEA;
  var rim = new T3.Mesh(new T3.TorusGeometry(f.r + .05, .07, 8, 32), std('#d8d0bd')); rim.rotation.x = Math.PI / 2; rim.position.set(f.at[0], LAND - .02, f.at[1]); shadowAll(rim); scene.add(rim);
  var basin = new T3.Mesh(new T3.CylinderGeometry(f.r, f.r, .4, 28), std('#3ea3c4', {transparent:true, opacity:.85, roughness:.15})); basin.position.set(f.at[0], LAND - .22, f.at[1]); scene.add(basin);
  var col2 = new T3.Mesh(new T3.CylinderGeometry(.05, .08, .4, 10), std('#e9e3d6')); col2.position.set(f.at[0], LAND + .1, f.at[1]); scene.add(col2);
  var NJ = 90, jp = new Float32Array(NJ * 3), jv = [];
  for (var i = 0; i < NJ; i++) jv.push({a:Math.random() * Math.PI * 2, t:Math.random()});
  var jg = new T3.BufferGeometry(); jg.setAttribute('position', new T3.BufferAttribute(jp, 3));
  var jets = new T3.Points(jg, new T3.PointsMaterial({color:'#e8fbff', size:.06, transparent:true, opacity:.85, depthWrite:false}));
  scene.add(jets);
  O.anim.push(function(tm, dt){
    for (var i = 0; i < NJ; i++){
      var p = jv[i]; p.t += dt * .8; if (p.t > 1) { p.t -= 1; p.a = Math.random() * Math.PI * 2; }
      var r = p.t * (f.r * .8), y = LAND + .3 + p.t * 1.1 - p.t * p.t * 1.3;
      jp[i * 3] = f.at[0] + Math.cos(p.a) * r; jp[i * 3 + 1] = y; jp[i * 3 + 2] = f.at[1] + Math.sin(p.a) * r;
    }
    jg.attributes.position.needsUpdate = true;
  });
  // 公園池塘的荷葉
  var w0 = WATERS[0];
  for (var k = 0; k < 4; k++){ var pad = new T3.Mesh(new T3.CircleGeometry(.09 + k * .015, 14), std('#6fb85c', {side:T3.DoubleSide})); pad.rotation.x = -Math.PI / 2; pad.position.set(w0.at[0] - .25 + k * .17, SEA + .01, w0.at[1] + .1 - (k % 2) * .25); scene.add(pad); }
  buildHarbor();
  // 場地邊框旗桿＋地塊外框淡淡的彩色緣石
  ZONES.forEach(function(z){
    if (z.id === 'strategy') return;
    var b = z.box, pts3 = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
    for (var i = 0; i < 4; i++){
      var a = pts3[i], c = pts3[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      var curb = new T3.Mesh(new T3.BoxGeometry(len, .05, .06), std(z.color, {roughness:.6}));
      curb.position.set((a[0] + c[0]) / 2, landY((a[0] + c[0]) / 2, (a[1] + c[1]) / 2) + .025, (a[1] + c[1]) / 2);
      curb.rotation.y = -Math.atan2(c[1] - a[1], c[0] - a[0]); curb.receiveShadow = true; scene.add(curb);
    }
  });
}

/* ---------- 場地特色：每區一座主題地標＋寫著名字的入口拱門 ---------- */
function roundRect(x, a, b, w, h, r){ x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function canvasTex(w, h, draw){
  var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  var t = new T3.CanvasTexture(c); t.colorSpace = T3.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signTex(z){
  return canvasTex(512, 176, function(x){
    x.fillStyle = z.color; roundRect(x, 8, 8, 496, 160, 36); x.fill();
    x.lineWidth = 10; x.strokeStyle = INK; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.22)'; roundRect(x, 26, 20, 460, 44, 22); x.fill();
    x.textAlign = 'center'; x.lineJoin = 'round';
    x.font = '400 80px Huninn, "Noto Sans TC", sans-serif'; x.lineWidth = 12; x.strokeStyle = hexMix(z.color, '#14303d', .55);
    x.strokeText(z.name, 256, 108); x.fillStyle = '#ffffff'; x.fillText(z.name, 256, 108);
    x.font = '700 24px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(255,255,255,.92)'; x.fillText(z.en, 256, 150);
  });
}
function blockWalk(gx, gy, r){ if (walkCells) blockArea(gx, gy, r + BODY * .6); }   // 地標擋路：角色會繞過去（平面地圖也一樣）
function freeSpot(z, avoid){
  var b = z.box, best = null, bs = -9, M = 1.4;                  // 場地裡太擠時，可以放在場地外緣的空地
  for (var gx = b[0] - M; gx <= b[2] + M; gx += .15) for (var gy = b[1] - M; gy <= b[3] + M; gy += .15){
    var oz = zoneOfPoint(gx, gy); if (oz && oz !== z) continue;
    var out = Math.max(b[0] - gx, gx - b[2], b[1] - gy, gy - b[3], 0);
    var sc = 9 - out * .5;
    TOOLS.forEach(function(t){ var d = Math.max(Math.abs(gx - t.gx), Math.abs(gy - t.gy)) - t.s; if (d < sc) sc = d; });
    sc = Math.min(sc, minDist(ROAD_S, gx, gy) - .25, riverDist(gx, gy) - .85, -edgeD(gx, gy) - .6);
    WATERS.forEach(function(w){ sc = Math.min(sc, Math.hypot(gx - w.at[0], gy - w.at[1]) - w.r - .25); });
    (avoid || []).forEach(function(a){ sc = Math.min(sc, Math.hypot(gx - a[0], gy - a[1]) - .9); });
    (O.markSpots || []).forEach(function(m){ sc = Math.min(sc, Math.hypot(gx - m[0], gy - m[1]) - m[2] - .3); });
    if (z.id === 'school') sc = Math.min(sc, Math.hypot(gx - 11, gy - 1.3) - .95);
    if (z.id === 'brand' && gx > 6.8 && gx < 7.8) sc -= 1;
    if (sc > bs){ bs = sc; best = [gx, gy]; }
  }
  return {at:best, room:bs};
}
// 看板畫面：上方主色標題列、副標、三行內容、底部提示；背景淡淡的損益兩平圖
function fitText(x, text, maxW, size, weight, family){
  var sz = size; x.font = weight + ' ' + sz + 'px ' + family;
  while (x.measureText(text).width > maxW && sz > size * .55){ sz -= 1; x.font = weight + ' ' + sz + 'px ' + family; }
  return sz;
}
function drawBoardCanvas(cv){
  var x = cv.getContext('2d'), W = cv.width, H = cv.height, c = board.color || '#2ec4b6', F = '"Noto Sans TC", sans-serif', HF = 'Huninn, "Noto Sans TC", sans-serif';
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.globalAlpha = .14;                                            // 淡淡的長條圖＋上升線當背景
  [60, 95, 130, 170, 215].forEach(function(v, i){ x.fillStyle = c; x.fillRect(360 + i * 52, H - 60 - v, 34, v); });
  x.strokeStyle = '#ff6f59'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.moveTo(360, H - 110); x.lineTo(470, H - 170); x.lineTo(610, H - 285); x.stroke();
  x.globalAlpha = 1;
  x.fillStyle = c; x.fillRect(0, 0, W, 104);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
  fitText(x, board.title, W - 50, 70, '400', HF); x.lineWidth = 8; x.strokeStyle = mix(c, '#14303d', .45); x.lineJoin = 'round'; x.strokeText(board.title, W / 2, 56); x.fillText(board.title, W / 2, 56);
  x.fillStyle = mix(c, '#14303d', .55); fitText(x, board.sub, W - 50, 34, '700', F); x.fillText(board.sub, W / 2, 140);
  x.textAlign = 'left'; x.fillStyle = '#3b2f3a';
  ['l1', 'l2', 'l3'].filter(function(k){ return board[k]; }).forEach(function(k, i){
    var y = 196 + i * 50;
    x.fillStyle = c; x.beginPath(); x.arc(44, y, 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3b2f3a'; fitText(x, board[k], W - 100, 34, '700', F); x.fillText(board[k], 64, y + 1);
  });
  x.fillStyle = mix(c, '#ffffff', .82); x.fillRect(0, H - 52, W, 52);
  x.textAlign = 'center'; x.fillStyle = mix(c, '#14303d', .5); fitText(x, board.foot, W - 40, 26, '700', F); x.fillText(board.foot, W / 2, H - 26);
  x.lineWidth = 10; x.strokeStyle = '#3b2f3a'; x.strokeRect(5, 5, W - 10, H - 10);
}
function glow(color, day, night){ var m = std(color, {emissive:color, emissiveIntensity:day}); O.glows.push({m:m, day:day, night:night}); return m; }
function mesh(geo, mat, x, y, z, parent){ var m = new T3.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(m); return m; }

var MARKS = {
  idea:function(g, z){                                            // 大燈泡：點子亮了
    mesh(new T3.CylinderGeometry(.2, .24, .16, 16), std('#e9e1d0'), 0, .08, 0, g);
    var base = mesh(new T3.CylinderGeometry(.1, .11, .16, 16), std('#b9c2c8'), 0, .24, 0, g);
    [.2, .26].forEach(function(y){ mesh(new T3.TorusGeometry(.105, .012, 6, 18), std('#8d979e'), 0, y, 0, g).rotation.x = Math.PI / 2; });
    var bulb = mesh(new T3.SphereGeometry(.24, 24, 18), glow('#ffe066', .35, 1.8), 0, .52, 0, g); bulb.scale.set(1, 1.08, 1);
    var neck = mesh(new T3.CylinderGeometry(.11, .14, .1, 16), bulb.material, 0, .34, 0, g);
    var fil = mesh(new T3.TorusGeometry(.06, .01, 6, 16, Math.PI), new T3.MeshBasicMaterial({color:'#ff9a3c'}), 0, .5, 0, g); fil.userData.noInk = true;
    for (var i = 0; i < 6; i++){ var ray = mesh(new T3.BoxGeometry(.025, .1, .025), glow('#fff3a8', .6, 2), 0, 0, 0, g); var a = i / 6 * Math.PI * 2; ray.position.set(Math.cos(a) * .36, .56 + Math.sin(a) * .36, 0); ray.rotation.z = a - Math.PI / 2; ray.userData.noInk = true; }
    var FL = ['#ff9ec4', '#ffe066', '#ffffff', '#c7a6ff', '#ff8f8f'];
    for (var k = 0; k < 14; k++){ var b = k / 14 * Math.PI * 2; mesh(new T3.SphereGeometry(.035, 8, 6), std(FL[k % 5]), Math.cos(b) * .3, .17, Math.sin(b) * .3, g); }
    O.anim.push(function(tm){ g.rotation.y = tm * .4; });
    return .38;
  },
  strategy:function(g, z){                                        // 大對話泡泡：跟 AI 說清楚你要什麼
    var bm = std('#ffffff'), bub = new T3.Group(); bub.position.y = .78; g.add(bub);
    var body = mesh(new T3.SphereGeometry(.36, 24, 18), bm, 0, 0, 0, bub); body.scale.set(1.25, .82, .5);
    var tail = mesh(new T3.ConeGeometry(.1, .26, 12), bm, -.2, -.3, 0, bub); tail.rotation.z = -.5;
    var dots = [];
    [-.17, 0, .17].forEach(function(x, i){ var d = mesh(new T3.SphereGeometry(.055, 12, 10), glow(z.color, .3, 1.4), x, 0, .17, bub); d.userData.noInk = true; dots.push(d); });
    var pole = mesh(new T3.CylinderGeometry(.02, .02, .5, 6), std('#3c4a52'), 0, .25, 0, g);
    mesh(new T3.CylinderGeometry(.16, .2, .06, 16), std(hexMix(z.color, '#14303d', .3)), 0, .03, 0, g);
    O.anim.push(function(tm){ bub.position.y = .78 + Math.sin(tm * 1.6) * .03; dots.forEach(function(d, i){ d.position.y = Math.max(0, Math.sin(tm * 4 - i * .9)) * .06; }); });
    return .45;
  },
  school:function(g, z){                                          // 大鉛筆＋鞦韆
    var p = new T3.Group(); p.rotation.z = .12; g.add(p);
    mesh(new T3.CylinderGeometry(.075, .075, .62, 6), std('#ffd23f'), 0, .38, 0, p);
    mesh(new T3.CylinderGeometry(.078, .078, .06, 6), std('#c9ced3'), 0, .72, 0, p);
    mesh(new T3.CylinderGeometry(.075, .075, .09, 16), std('#ff8fab'), 0, .8, 0, p);
    var tip = mesh(new T3.ConeGeometry(.075, .14, 6), std('#f3d4a5'), 0, 0, 0, p); tip.rotation.x = Math.PI; tip.position.y = .0;
    var lead = mesh(new T3.ConeGeometry(.026, .05, 6), std('#3b2f3a'), 0, -.05, 0, p); lead.rotation.x = Math.PI;
    p.position.y = .07;
    var sw = new T3.Group(); sw.position.set(.42, 0, 0); g.add(sw);
    var wood = std('#e07a5f');
    [-1, 1].forEach(function(s){ [-1, 1].forEach(function(k){ var leg = mesh(new T3.CylinderGeometry(.015, .015, .5, 6), wood, s * .2, .23, k * .08, sw); leg.rotation.x = k * .3; }); });
    mesh(new T3.CylinderGeometry(.015, .015, .44, 6), wood, 0, .47, 0, sw).rotation.z = Math.PI / 2;
    var seat = new T3.Group(); seat.position.y = .46; sw.add(seat);
    [-1, 1].forEach(function(s){ mesh(new T3.BoxGeometry(.006, .3, .006), std('#5a4632'), s * .06, -.15, 0, seat); });
    mesh(new T3.BoxGeometry(.16, .02, .07), std(z.color), 0, -.3, 0, seat);
    O.anim.push(function(tm){ seat.rotation.x = Math.sin(tm * 1.8) * .45; });
    return .55;
  },
  calc:function(g, z){                                            // 公布欄：文字來自 Google 試算表（board，見 index.html）
    var cv = document.createElement('canvas'); cv.width = 640; cv.height = 392;
    var tex = new T3.CanvasTexture(cv); tex.colorSpace = T3.SRGBColorSpace; tex.anisotropy = 4;
    O.boardDraw = function(){ drawBoardCanvas(cv); tex.needsUpdate = true; };
    O.boardDraw();
    [-1, 1].forEach(function(s){ mesh(new T3.CylinderGeometry(.025, .025, .9, 8), std('#5b6770'), s * .45, .45, 0, g); });
    mesh(new T3.BoxGeometry(1.06, .68, .05), std(hexMix(z.color, '#14303d', .3)), 0, .95, 0, g);
    var face = mesh(new T3.PlaneGeometry(.98, .6), std('#ffffff', {map:tex, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.05}), 0, .95, .027, g); face.userData.noInk = true;
    O.glows.push({m:face.material, day:.05, night:.9});
    var back = face.clone(); back.rotation.y = Math.PI; back.position.z = -.027; g.add(back);
    var star = mesh(new T3.OctahedronGeometry(.09, 0), glow('#ffd23f', .5, 1.6), 0, 1.45, 0, g);   // 頂上轉動的星星：一眼找到看板
    O.anim.push(function(tm){ star.rotation.y = tm * 2; star.position.y = 1.45 + Math.sin(tm * 2.4) * .04; });
    g.userData.board = true;
    return .5;
  },
  fund:function(g, z){                                            // 大音符＋喇叭
    var gold = glow('#ffd23f', .12, 1.1), note = new T3.Group(); note.position.set(-.12, 0, 0); g.add(note);
    [[0, .3], [.34, .38]].forEach(function(q){
      var h = mesh(new T3.SphereGeometry(.11, 18, 14), gold, q[0], q[1], 0, note); h.scale.set(1.3, .9, .8);
      mesh(new T3.BoxGeometry(.04, .62, .04), gold, q[0] + .12, q[1] + .3, 0, note);
    });
    var beam = mesh(new T3.BoxGeometry(.4, .09, .05), gold, .29, .98, 0, note); beam.rotation.z = .24;
    var sp = new T3.Group(); sp.position.set(.5, 0, .25); g.add(sp);
    mesh(new T3.BoxGeometry(.3, .44, .26), std('#3c4a52'), 0, .22, 0, sp);
    [.3, .1].forEach(function(y, i){ var c = mesh(new T3.CylinderGeometry(i ? .08 : .06, i ? .08 : .06, .03, 18), std(z.color), 0, y, .135, sp); c.rotation.x = Math.PI / 2; });
    O.anim.push(function(tm){ note.rotation.y = Math.sin(tm * .9) * .5; note.position.y = Math.abs(Math.sin(tm * 2.2)) * .06; sp.scale.setScalar(1 + Math.max(0, Math.sin(tm * 6)) * .04); });
    return .5;
  },
  brand:function(g, z){                                           // 愛心氣球
    var heart = new T3.Shape(); heart.moveTo(0, -.12); heart.bezierCurveTo(-.24, .02, -.14, .2, 0, .09); heart.bezierCurveTo(.14, .2, .24, .02, 0, -.12);
    var hg = new T3.ExtrudeGeometry(heart, {depth:.08, bevelEnabled:true, bevelSize:.03, bevelThickness:.03, bevelSegments:3}); hg.translate(0, 0, -.04);
    var balloons = [];
    [[0, '#ff6f91', 1], [.2, '#ffb3c6', .8], [-.18, '#ff8fa8', .85]].forEach(function(b, i){
      var h = mesh(hg, std(b[1]), b[0], .95 + i * .08, 0, g); h.scale.setScalar(b[2] * 1.3); balloons.push(h);
      var str = mesh(new T3.CylinderGeometry(.004, .004, .8, 4), std('#ffffff'), b[0] * .5, .45, 0, g); str.rotation.z = -b[0] * .4; str.userData.noInk = true;
    });
    mesh(new T3.BoxGeometry(.2, .1, .14), std(hexMix(z.color, '#14303d', .2)), 0, .05, 0, g);
    O.anim.push(function(tm){ balloons.forEach(function(h, i){ h.position.y = .95 + i * .08 + Math.sin(tm * 1.4 + i) * .04; h.rotation.y = Math.sin(tm * .8 + i) * .5; }); });
    return .35;
  },
  ecom:function(g, z){                                            // 畫架＋調色盤
    var wood = std('#b07a4a'), ea = new T3.Group(); g.add(ea);
    [[-.22, .12], [.22, .12]].forEach(function(q){ var leg = mesh(new T3.BoxGeometry(.04, 1.1, .04), wood, q[0], .52, q[1], ea); leg.rotation.x = -.12; leg.rotation.z = q[0] > 0 ? -.08 : .08; });
    var back = mesh(new T3.BoxGeometry(.04, 1.0, .04), wood, 0, .48, -.2, ea); back.rotation.x = .3;
    mesh(new T3.BoxGeometry(.6, .04, .08), wood, 0, .42, .14, ea);
    var art = canvasTex(128, 96, function(x, w, h){
      x.fillStyle = '#fffaf0'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#9fd8ef'; x.fillRect(0, 0, w, h * .6);
      x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(w * .75, h * .25, 12, 0, 7); x.fill();
      x.fillStyle = '#7cc36a'; x.beginPath(); x.moveTo(0, h * .7); x.quadraticCurveTo(w * .3, h * .35, w * .6, h * .65); x.quadraticCurveTo(w * .8, h * .5, w, h * .62); x.lineTo(w, h); x.lineTo(0, h); x.fill();
      x.fillStyle = '#ef6b8a'; x.beginPath(); x.arc(w * .3, h * .8, 6, 0, 7); x.fill();
    });
    var cvs = mesh(new T3.BoxGeometry(.62, .48, .03), std('#ffffff', {map:art}), 0, .7, .12, ea); cvs.rotation.x = -.12;
    var pal = new T3.Group(); pal.position.set(.55, .05, .2); g.add(pal);
    var pm = mesh(new T3.CylinderGeometry(.2, .2, .03, 24), std('#e6c79a'), 0, 0, 0, pal); pm.scale.set(1.3, 1, 1);
    ['#ef6b8a', '#4f9dff', '#ffd23f', '#6bbf59', '#9d8cf2'].forEach(function(c, i){ var a = i / 5 * Math.PI * 1.4 - .4; mesh(new T3.SphereGeometry(.04, 10, 8), std(c), Math.cos(a) * .17, .03, Math.sin(a) * .11, pal).userData.noInk = true; });
    var brush = mesh(new T3.CylinderGeometry(.015, .02, .5, 8), std('#e85d5d'), .55, .3, .2, g); brush.rotation.z = .5;
    O.anim.push(function(tm){ brush.rotation.z = .5 + Math.sin(tm * 2) * .2; });
    return .6;
  },
  ops:function(g, z){                                             // 攤開的大書＋鋼筆
    var page = std('#fffaf0'), cover = std(hexMix(z.color, '#14303d', .25)), bk = new T3.Group(); bk.position.y = .1; g.add(bk);
    [-1, 1].forEach(function(s){
      var c = mesh(new T3.BoxGeometry(.46, .03, .62), cover, s * .24, 0, 0, bk); c.rotation.z = s * -.18;
      var pg = mesh(new T3.BoxGeometry(.42, .05, .56), page, s * .22, .04, 0, bk); pg.rotation.z = s * -.18;
      var lines = canvasTex(64, 80, function(x, w, h){ x.fillStyle = '#fffaf0'; x.fillRect(0, 0, w, h); x.fillStyle = '#b8c4cc'; for (var y = 10; y < h - 6; y += 9) x.fillRect(6, y, w - 12 - (y % 27 ? 0 : 18), 3); });
      var tp = mesh(new T3.PlaneGeometry(.4, .54), std('#ffffff', {map:lines}), s * .22, .066 + .0, 0, bk); tp.rotation.x = -Math.PI / 2; tp.rotation.y = s * -.18; tp.userData.noInk = true;
    });
    var pen = new T3.Group(); pen.position.set(.1, .55, 0); g.add(pen);
    mesh(new T3.CylinderGeometry(.04, .04, .5, 12), std('#2b2b3a'), 0, 0, 0, pen);
    mesh(new T3.CylinderGeometry(.042, .042, .05, 12), std('#ffd23f'), 0, .12, 0, pen);
    var nib = mesh(new T3.ConeGeometry(.04, .12, 12), std('#d9d9e0'), 0, -.31, 0, pen); nib.rotation.x = Math.PI;
    O.anim.push(function(tm){ pen.rotation.z = .5 + Math.sin(tm * 1.5) * .15; pen.position.x = .1 + Math.sin(tm * 1.5) * .12; pen.position.y = .5 + Math.abs(Math.sin(tm * 3)) * .04; });
    return .45;
  }
};
// 港區：輕軌鐵道（枕木＋鋼軌，過運河處有鋼梁橋）、輕軌列車、碼頭起重機
function buildHarbor(){
  O.glows = O.glows || [];
  var a = TRACK[0], b = TRACK[1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
  var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], railM = std('#8d969c'), slM = std('#6b5a48');
  var rails = new T3.Group(); rails.position.set(mid[0], LAND + .02, mid[1]); rails.rotation.y = ang;
  [-.09, .09].forEach(function(x){ var r = new T3.Mesh(new T3.BoxGeometry(.025, .03, len), railM); r.position.set(x, .03, 0); rails.add(r); });
  var NS = Math.floor(len / .22), sl = new T3.InstancedMesh(new T3.BoxGeometry(.3, .02, .07), slM, NS), m4 = new T3.Matrix4();
  for (var i = 0; i < NS; i++){ m4.makeTranslation(0, .01, -len / 2 + (i + .5) * len / NS); sl.setMatrixAt(i, m4); }
  rails.add(sl); scene.add(rails);
  var best = null;                                                // 鐵道和運河交會處：鋼梁橋
  for (var u = 11.2; u <= 20; u += .05){ var d = riverDist(u, TRACK_SUM - u); if (!best || d < best[1]) best = [u, d]; }
  if (best && best[1] < .4){
    var br = new T3.Group(); br.position.set(best[0], LAND - .03, TRACK_SUM - best[0]); br.rotation.y = ang;
    br.add(new T3.Mesh(new T3.BoxGeometry(.42, .08, 1.7), std('#4f7699')));
    [-.2, .2].forEach(function(x){ var tr = new T3.Mesh(new T3.BoxGeometry(.03, .16, 1.7), std('#4f7699')); tr.position.set(x, .12, 0); br.add(tr); });
    scene.add(inkAll(shadowAll(br), .012));
  }
  // 輕軌列車（兩節）
  var tg = new T3.Group(), white = std('#fbfaf6'), glass = std('#8fb6c8', {emissive:'#ffe3a0', emissiveIntensity:0}), stripe = std('#e05a47'), dark = std('#3c4248');
  [-.3, .3].forEach(function(x){
    var car = new T3.Group(); car.position.x = x; tg.add(car);
    var bd = new T3.Mesh(new T3.BoxGeometry(.56, .26, .24), white); bd.position.y = .2; car.add(bd);
    [.125, -.125].forEach(function(z2){ var gl = new T3.Mesh(new T3.PlaneGeometry(.48, .09), glass); gl.position.set(0, .25, z2 + (z2 > 0 ? .002 : -.002)); if (z2 < 0) gl.rotation.y = Math.PI; gl.userData.noInk = true; car.add(gl); });
    var st2 = new T3.Mesh(new T3.BoxGeometry(.57, .035, .245), stripe); st2.position.y = .12; car.add(st2);
    var rf = new T3.Mesh(new T3.BoxGeometry(.3, .05, .16), dark); rf.position.y = .355; car.add(rf);
  });
  var panto = new T3.Mesh(new T3.BoxGeometry(.02, .14, .02), dark); panto.position.set(-.3, .44, 0); panto.rotation.z = .5; tg.add(panto);
  O.tram = tg; O.tramGlass = glass; scene.add(inkAll(shadowAll(tg), .012));
  // 起重機：四支腳跨在岸壁上，吊臂收起朝天
  CRANES.forEach(function(q, ci){
    var g = new T3.Group(), red = std('#d9533b'), wh = std('#f2f2ee'), H = 2.1;
    g.position.set(q[0], LAND, q[1]); g.rotation.y = ang;
    [[-.35, -.28], [.35, -.28], [-.35, .28], [.35, .28]].forEach(function(p2){ var leg = new T3.Mesh(new T3.BoxGeometry(.06, H, .06), red); leg.position.set(p2[1], H / 2, p2[0]); g.add(leg); });
    [[-.35], [.35]].forEach(function(p2){ var cb = new T3.Mesh(new T3.BoxGeometry(.62, .07, .07), red); cb.position.set(0, H, p2[0]); g.add(cb); var lb = new T3.Mesh(new T3.BoxGeometry(.62, .05, .05), red); lb.position.set(0, H * .45, p2[0]); g.add(lb); });
    var top2 = new T3.Mesh(new T3.BoxGeometry(.66, .08, .8), red); top2.position.y = H + .06; g.add(top2);
    var house = new T3.Mesh(new T3.BoxGeometry(.3, .22, .3), wh); house.position.set(-.1, H + .21, 0); g.add(house);
    var boom = new T3.Group(); boom.position.set(.25, H + .1, 0); boom.rotation.z = 1.25 + (ci % 2) * .12; g.add(boom);
    var bm = new T3.Mesh(new T3.BoxGeometry(1.9, .07, .1), red); bm.position.x = .95; boom.add(bm);
    var tip = new T3.Mesh(new T3.SphereGeometry(.05, 10, 8), glow('#ff5a4a', .4, 1.8)); tip.position.x = 1.92; tip.userData.noInk = true; boom.add(tip);
    [-.3, .3].forEach(function(zz, k){ var pb = perch3(); pb.position.set(.2 * (k ? 1 : -1), H + .1, zz); g.add(pb); });
    scene.add(inkAll(shadowAll(g), .012));
  });
  buildFish3();
}
function perch3(){                                                // 停著的海鷗
  var b = new T3.Group(), wm = std('#fbfbf8'), gm = std('#7d858c');
  var body = new T3.Mesh(new T3.SphereGeometry(.06, 10, 8), wm); body.scale.set(1.5, 1, 1); body.position.y = .07; b.add(body);
  var head = new T3.Mesh(new T3.SphereGeometry(.035, 8, 6), wm); head.position.set(.08, .12, 0); b.add(head);
  var beak = new T3.Mesh(new T3.ConeGeometry(.012, .04, 5), std('#f4a73b')); beak.rotation.z = -Math.PI / 2; beak.position.set(.12, .12, 0); b.add(beak);
  var wing = new T3.Mesh(new T3.BoxGeometry(.1, .02, .1), gm); wing.position.set(-.02, .1, 0); b.add(wing);
  var ph = Math.random() * 6;
  O.anim.push(function(tm){ var k = (tm * .25 + ph) % 1; head.position.y = k > .85 && k < .92 ? .09 : .12; });
  return b;
}
function buildFish3(){                                            // 港裡的魚：不定時跳出水面，濺起水花
  var COLS = ['#c9d6de', '#f4a259', '#9fc4d6', '#e8e1c7'];
  O.fish3 = FISH.map(function(f, i){
    var g = new T3.Group(), m = std(COLS[i % 4]);
    var body = new T3.Mesh(new T3.SphereGeometry(.09, 12, 8), m); body.scale.set(1.7, .8, .55); g.add(body);
    var tail = new T3.Mesh(new T3.ConeGeometry(.07, .12, 4), m); tail.rotation.z = Math.PI / 2; tail.scale.set(1, 1, .3); tail.position.x = -.19; g.add(tail);
    var eye = new T3.Mesh(new T3.SphereGeometry(.014, 6, 5), new T3.MeshBasicMaterial({color:INK})); eye.position.set(.1, .02, .045); eye.userData.noInk = true; g.add(eye);
    inkAll(g, .008); g.visible = false; scene.add(g);
    var ring = new T3.Mesh(new T3.TorusGeometry(.1, .012, 4, 20), new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:0, depthWrite:false}));
    ring.rotation.x = Math.PI / 2; ring.userData.noInk = true; scene.add(ring);
    return {f:f, g:g, ring:ring};
  });
  O.anim.push(function(){
    O.fish3.forEach(function(o){
      var f = o.f, D = 1.1, x0 = f.u, z0 = f.lane - f.u;
      if (f.t < 0 || f.t > D + .6){ o.g.visible = false; o.ring.material.opacity = 0; return; }
      var k = Math.min(1, f.t / D), dx = (k - .5) * .9 * f.dir;
      o.g.visible = f.t < D;
      o.g.position.set(x0 + dx * .707, SEA + 4 * .55 * k * (1 - k), z0 - dx * .707);
      o.g.rotation.set(0, f.dir > 0 ? Math.PI / 4 : Math.PI * 1.25, Math.atan2(4 * .55 * (1 - 2 * k), .9));
      var sp = f.t < .35 ? f.t / .35 : f.t > D ? (f.t - D) / .6 : -1, sx = (f.t < .35 ? -.45 : .45) * f.dir;
      if (sp >= 0 && sp <= 1){ o.ring.position.set(x0 + sx * .707, SEA + .02, z0 - sx * .707); o.ring.scale.setScalar(.6 + sp * 2.2); o.ring.material.opacity = (1 - sp) * .8; }
      else o.ring.material.opacity = 0;
    });
  });
}
function buildFarBridge(){                                        // 跨海大橋（立體）：橋面、欄杆、橋墩，角色走在橋面上
  var a = FAR.bridge[0], b = FAR.bridge[1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) + .5;
  var g = new T3.Group(); g.position.set((a[0] + b[0]) / 2, LAND + .04, (a[1] + b[1]) / 2); g.rotation.y = Math.atan2(dx, dy);
  var deckM = std('#eef1f3'), beamM = std('#4f7699');
  g.add(new T3.Mesh(new T3.BoxGeometry(.56, .08, len), deckM));
  var n = Math.max(2, Math.round(len / .9));
  for (var i = 1; i < n; i++){ var pier = new T3.Mesh(new T3.BoxGeometry(.18, 1.9, .18), beamM); pier.position.set(0, -.98, -len / 2 + len * i / n); g.add(pier); }
  [-.27, .27].forEach(function(x){
    var rail = new T3.Mesh(new T3.BoxGeometry(.035, .035, len), beamM); rail.position.set(x, .24, 0); g.add(rail);
    for (var z = -len / 2 + .1; z <= len / 2; z += .3){ var post = new T3.Mesh(new T3.BoxGeometry(.04, .22, .04), beamM); post.position.set(x, .12, z); g.add(post); }
    if (FAR.self === 'creator'){ var ar = new T3.Mesh(new T3.TorusGeometry(len / 2, .03, 6, 32, Math.PI), deckM); ar.rotation.y = Math.PI / 2; ar.scale.set(1, .3, 1); ar.position.set(x, .04, 0); g.add(ar); }
  });
  g.traverse(function(m){ if (m.isMesh) m.userData.noPickWalk = true; });
  scene.add(inkAll(shadowAll(g), .013));
}
function buildFar(){
  buildFarBridge();                                              // 海的另一端：迷你創業島，點了切到創業島網站
  var a = FAR.at, r = FAR.r, g = new T3.Group(); g.position.set(a[0], 0, a[1]);
  var sand = mesh(new T3.CylinderGeometry(r + .38, r + .75, 2.2, 36), std('#f3d798'), 0, LAND - .08 - 1.1, 0, g);
  mesh(new T3.CylinderGeometry(r, r + .1, .16, 36), std('#9edb6f'), 0, LAND, 0, g);
  [[-.4, -.1, '#ff6f59'], [.3, .5, '#4f9dff']].forEach(function(h){
    mesh(new T3.BoxGeometry(.5, .38, .5), std('#f3ead9'), h[0], LAND + .27, h[1], g);
    var rf = pyramid(.62, .3, std(h[2])); rf.position.set(h[0], LAND + .46, h[1]); g.add(rf);
  });
  mesh(new T3.CylinderGeometry(.12, .17, 1.1, 14), std('#faf4e8'), .9, LAND + .6, -.2, g);
  mesh(new T3.CylinderGeometry(.13, .15, .14, 14), std('#e05a47'), .9, LAND + .5, -.2, g);
  mesh(new T3.ConeGeometry(.17, .28, 14), std('#e05a47'), .9, LAND + 1.3, -.2, g);
  mesh(new T3.SphereGeometry(.09, 12, 10), glow('#ffe08a', .5, 2), .9, LAND + 1.12, -.2, g);
  [[-.9, -.6], [.2, -1.1], [-.9, .7], [1.0, .8], [-.2, -.7]].forEach(function(t){ mesh(new T3.ConeGeometry(.2, .55, 9), std('#5cc45a'), t[0], LAND + .36, t[1], g); });
  g.traverse(function(m){ if (m.isMesh){ m.userData.id = '__far'; O.pick.push(m); } });
  scene.add(inkAll(shadowAll(g), .012));
  farLabel('🏝️ 創業島 →', 1.9);
}
function farLabel(text, y){
  var d = document.createElement('button'); d.type = 'button'; d.className = 'tag3 board3'; d.textContent = text; d.title = '點一下前往' + FAR.name;
  d.addEventListener('click', function(e){ e.stopPropagation(); farGoClick(); }); d.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  labRoot.appendChild(d); O.zoneTags.push({el:d, x:FAR.at[0], z:FAR.at[1], y:LAND + y});
}
function buildZoneMarks(){
  O.glows = O.glows || []; O.markSpots = [];
  var hub = zoneById.hub, gates = [];
  ZONES.forEach(function(z){
    if (z.id === 'hub') return;
    // 入口拱門：場地中心往指揮塔方向，和地塊邊界的交點（就是道路出口）
    var dx = hub.cx - z.cx, dy = hub.cy - z.cy, b = z.box;
    var tx = dx ? ((dx > 0 ? b[2] : b[0]) - z.cx) / dx : 1e9, ty = dy ? ((dy > 0 ? b[3] : b[1]) - z.cy) / dy : 1e9, t = Math.min(tx, ty);
    var gx = z.cx + dx * t, gy = z.cy + dy * t, gate = new T3.Group();
    gate.position.set(gx, Math.min(landY(gx - .5, gy), landY(gx + .5, gy), landY(gx, gy)) - .03, gy); gate.rotation.y = Math.atan2(dx, dy);
    var postM = std(hexMix(z.color, '#ffffff', .2)), beamM = std(hexMix(z.color, '#14303d', .3));
    [-1, 1].forEach(function(s){
      mesh(new T3.CylinderGeometry(.045, .055, 1.05, 10), postM, s * .52, .52, 0, gate);
      mesh(new T3.SphereGeometry(.06, 12, 10), O.bulbMat, s * .52, 1.1, 0, gate);
    });
    mesh(new T3.BoxGeometry(1.3, .08, .1), beamM, 0, .98, 0, gate);
    var tex = signTex(z), sm = std('#ffffff', {map:tex});
    mesh(new T3.BoxGeometry(1.0, .34, .05), beamM, 0, 1.22, 0, gate);
    var f1 = mesh(new T3.PlaneGeometry(.96, .33), sm, 0, 1.22, .027, gate), f2 = mesh(new T3.PlaneGeometry(.96, .33), sm, 0, 1.22, -.027, gate);
    f2.rotation.y = Math.PI; f1.userData.noInk = f2.userData.noInk = true;
    scene.add(inkAll(shadowAll(gate), .012));
    gates.push([gx, gy]);
    [-1, 1].forEach(function(s){ var c = Math.cos(gate.rotation.y), sn = Math.sin(gate.rotation.y); blockWalk(gx + s * .52 * c, gy - s * .52 * sn, .12); });
    // 地標
    var mk = MARKS[z.id]; if (!mk) return;
    var spot = z.id === 'calc' ? {at:BOARD_AT, room:.55} : freeSpot(z, gates); if (!spot.at || spot.room < .05) return;   // 看板位置固定，平面地圖和小地圖才對得上
    var g = new T3.Group(); scene.add(g);
    var r = mk(g, z), k = Math.max(1.1, Math.min(2.1, (spot.room + .2) / r));
    g.scale.setScalar(k); g.position.set(spot.at[0], landY(spot.at[0], spot.at[1]) - .01, spot.at[1]);
    g.rotation.y = Math.atan2(C[0] - spot.at[0], C[1] - spot.at[1]) - Math.PI / 2 + (z.id === 'calc' || z.id === 'ops' ? Math.PI / 2 : 0);
    if (z.id === 'idea') g.rotation.y = 0;
    inkAll(shadowAll(g), .012);
    if (g.userData.board) g.traverse(function(m){ if (m.isMesh && !m.userData.ink){ m.userData.id = '__board'; O.pick.push(m); } });
    O.markSpots.push([spot.at[0], spot.at[1], r * k + .25]);
    blockWalk(spot.at[0], spot.at[1], r * k * .85);
  });
  // 品牌商店街：街道上方掛三角旗
  var bz = zoneById.brand, FLG = ['#ff6f91', '#ffd23f', '#4f9dff', '#6fcf5a', '#ffffff', '#c7a6ff'];
  var tri = new T3.Shape(); tri.moveTo(-.05, 0); tri.lineTo(.05, 0); tri.lineTo(0, -.1); tri.lineTo(-.05, 0);
  var tg = new T3.ShapeGeometry(tri);
  for (var gy = bz.box[1] + .6; gy < bz.box[3] - .3; gy += 1.1){
    var y0 = landY(7.3, gy) + .95;
    [6.75, 7.85].forEach(function(x){ var pole = mesh(new T3.CylinderGeometry(.015, .015, 1, 6), std('#3c4a52'), x, y0 - .45, gy); pole.castShadow = true; scene.add(pole); });
    for (var i = 0; i <= 10; i++){
      var u = i / 10, x = 6.75 + u * 1.1, sag = Math.sin(u * Math.PI) * .12;
      var f = mesh(tg, std(FLG[i % FLG.length], {side:T3.DoubleSide}), x, y0 - sag, gy); scene.add(f);
    }
    var line = mesh(new T3.CylinderGeometry(.004, .004, 1.12, 4), std('#3b2f3a'), 7.3, y0 - .06, gy); line.rotation.z = Math.PI / 2; scene.add(line);
  }
  // 指揮塔：繞塔旋轉的光環
  var sp = O.blds['content-workflow-studio-cf'];
  if (sp){
    O.rings = [];
    [[.45, '#ff6f59', .7], [.85, '#2ec4b6', -.5], [1.25, '#ffd23f', .35]].forEach(function(q){
      var ring = mesh(new T3.TorusGeometry(.5 - q[0] * .1, .018, 8, 40), glow(q[1], .6, 1.8), sp.t.gx, sp.base + q[0] * 2.2, sp.t.gy);
      ring.rotation.x = Math.PI / 2 + .25; ring.userData.sp = q[2]; ring.raycast = noPick; scene.add(ring); O.rings.push(ring);
    });
    O.anim.push(function(tm){ O.rings.forEach(function(r2, i){ r2.rotation.z = tm * r2.userData.sp; r2.rotation.x = Math.PI / 2 + Math.sin(tm * .7 + i) * .25; }); });
  }
}

function mergeGeo(list){                          // 簡易合併（全部轉成非索引）
  var pos = [], nor = [];
  list.forEach(function(g){ g = g.index ? g.toNonIndexed() : g; pos.push.apply(pos, g.attributes.position.array); nor.push.apply(nor, g.attributes.normal.array); });
  var out = new T3.BufferGeometry(); out.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T3.Float32BufferAttribute(nor, 3));
  return out;
}
function blob(r, x, y, z){ var g = new T3.IcosahedronGeometry(r, 2); g.translate(x, y, z); return g; }
function buildTrees(){
  var list = (L.trees || []).filter(function(t){ return landY(t.gx, t.gy) > SEA + .15 && !O.markSpots.some(function(m){ return Math.hypot(t.gx - m[0], t.gy - m[1]) < m[2]; }); });
  var roundG = mergeGeo([blob(.2, 0, .44, 0), blob(.15, .13, .36, .04), blob(.14, -.12, .37, -.03), blob(.13, .02, .6, -.02)]);
  var pt = new T3.CylinderGeometry(.028, .045, .8, 7); pt.translate(0, .4, 0);
  var trunkG = mergeGeo([pt]);                                    // 棕櫚樹幹（圓冠樹也用，縮短）
  var fronds = [];
  for (var fi = 0; fi < 7; fi++){ var fr = new T3.ConeGeometry(.06, .5, 4); fr.scale(1, 1, .25); fr.translate(0, .25, 0); fr.rotateZ(-1.95); fr.rotateY(fi / 7 * Math.PI * 2); fr.translate(0, .82, 0); fronds.push(fr); }
  fronds.push(blob(.05, 0, .8, 0));
  var pineG = mergeGeo(fronds);
  var pines = list.filter(function(t){ return isPalm(t); }), rounds = list.filter(function(t){ return pines.indexOf(t) < 0; });
  var trunk = new T3.InstancedMesh(trunkG, std('#8a6a48'), list.length);
  var pineM = new T3.InstancedMesh(pineG, std('#ffffff'), pines.length);
  var roundM = new T3.InstancedMesh(roundG, std('#ffffff'), rounds.length);
  var m = new T3.Matrix4(), q = new T3.Quaternion(), s = new T3.Vector3(), p = new T3.Vector3(), c = new T3.Color(), e = new T3.Euler();
  function place(t, k){ var sc = (t.big ? 1.3 : 1) * k; e.set(0, (t.gx * 7 + t.gy * 3) % 6.28, 0); q.setFromEuler(e); s.set(sc, sc, sc); p.set(t.gx, landY(t.gx, t.gy) - .02, t.gy); m.compose(p, q, s); return m; }
  list.forEach(function(t, i){ trunk.setMatrixAt(i, place(t, 1)); if (!isPalm(t)){ var mm = new T3.Matrix4(); trunk.getMatrixAt(i, mm); mm.multiply(new T3.Matrix4().makeScale(1, .35, 1)); trunk.setMatrixAt(i, mm); } });
  var LEAF = ['#4fae55', '#3f9a4c', '#62bb58', '#459f52', '#7cc95f', '#e8a33d'];   // 偶爾一棵開花的樹
  pines.forEach(function(t, i){ pineM.setMatrixAt(i, place(t, 1)); pineM.setColorAt(i, c.set(LEAF[hash(i + 'p') % 4])); });
  rounds.forEach(function(t, i){ roundM.setMatrixAt(i, place(t, .95)); roundM.setColorAt(i, c.set(LEAF[hash(i + 'r') % 11 === 0 ? 5 : hash(i + 'r') % 5])); });
  [trunk, pineM, roundM].forEach(function(o){ o.castShadow = true; o.receiveShadow = true; scene.add(o); inkMesh(o, .014); });
  // 記下每棵樹在哪個 InstancedMesh 的第幾個，擋到視線時暫時縮成 0
  O.trees = list.map(function(t, i){
    var isPine = pines.indexOf(t) >= 0, mesh = isPine ? pineM : roundM, k = isPine ? pines.indexOf(t) : rounds.indexOf(t);
    var a = new T3.Matrix4(), b = new T3.Matrix4(); trunk.getMatrixAt(i, a); mesh.getMatrixAt(k, b);
    return {gx:t.gx, gy:t.gy, y:landY(t.gx, t.gy), parts:[[trunk, i, a], [mesh, k, b]], hidden:false};
  });
}
function buildFlowers(){
  var pts = [], r = rng(7), tries = 0;
  while (pts.length < 520 && tries++ < 9000){
    var a = r() * Math.PI * 2, d = Math.sqrt(r()) * 12, gx = C[0] + Math.cos(a) * d, gy = C[1] + Math.sin(a) * d;
    if (edgeD(gx, gy) > -.8 || landY(gx, gy) < LAND - .05 || riverDist(gx, gy) < 1.0 || minDist(ROAD_S, gx, gy) < .35) continue;
    var z = zoneOfPoint(gx, gy); if (z && z.id !== 'idea') continue;
    if (TOOLS.some(function(t){ return Math.abs(gx - t.gx) < t.s + .2 && Math.abs(gy - t.gy) < t.s + .2; })) continue;
    pts.push([gx, gy]);
  }
  var g = new T3.IcosahedronGeometry(.02, 0), mesh = new T3.InstancedMesh(g, new T3.MeshBasicMaterial({color:'#ffffff'}), pts.length);
  var stem = new T3.Matrix4(), c = new T3.Color(), FL = ['#ff9ec4', '#ffe066', '#ffffff', '#c7a6ff', '#ff8f8f', '#ffd1e3'];
  pts.forEach(function(q, i){ stem.makeTranslation(q[0], landY(q[0], q[1]) + .018, q[1]); mesh.setMatrixAt(i, stem); mesh.setColorAt(i, c.set(FL[i % FL.length])); });
  scene.add(mesh);
}
function buildSkyStuff(){
  // 雲
  O.clouds = [];
  for (var i = 0; i < 7; i++){
    var g = new T3.Group(), cm = std('#ffffff', {transparent:true, opacity:.96});
    for (var k = 0; k < 7; k++){ var b = new T3.Mesh(new T3.IcosahedronGeometry(.45 + (k % 3) * .22, 2), cm); b.position.set((k - 3) * .45, Math.abs(3 - k) < 2 ? .25 : 0, Math.cos(k * 1.7) * .3); b.scale.y = .78; b.castShadow = true; g.add(b); }
    g.position.set(-8 + i * 5, 9 + (i % 3) * .9, -2 + ((i * 7) % 22));
    g.userData.sp = .25 + (i % 3) * .1; scene.add(g); O.clouds.push(g);
  }
  // 地平線的積雨雲（入道雲）：不受霧影響，遠遠就看得到
  O.farClouds = [];
  var fm = std('#ffffff', {fog:false});
  for (var fc = 0; fc < 11; fc++){
    var fgp = new T3.Group(), ang = fc / 11 * Math.PI * 2 + .3, rad = 72 + (fc % 3) * 8;
    for (var kk = 0; kk < 9; kk++){
      var bb = new T3.Mesh(new T3.IcosahedronGeometry(1, 2), fm), up = kk < 3 ? 0 : kk < 6 ? 1 : 2;
      var sz = (3.2 - up * .7) * (1 + (fc % 2) * .3);
      bb.scale.set(sz, sz * .85, sz); bb.position.set((kk % 3 - 1) * sz * 1.1 + up * .6, up * sz * 1.25, (kk % 2) * 1.2);
      fgp.add(bb);
    }
    fgp.position.set(C[0] + Math.cos(ang) * rad, -1.5, C[1] + Math.sin(ang) * rad); fgp.lookAt(C[0], -1.5, C[1]);
    scene.add(fgp); O.farClouds.push(fgp);
  }
  O.farMat = fm;
  // 星星
  var N = 500, sp = new Float32Array(N * 3);
  for (var j = 0; j < N; j++){ var a = Math.random() * Math.PI * 2, el2 = Math.random() * 1.3 + .1, r = 80; sp[j * 3] = C[0] + Math.cos(a) * Math.cos(el2) * r; sp[j * 3 + 1] = Math.sin(el2) * r; sp[j * 3 + 2] = C[1] + Math.sin(a) * Math.cos(el2) * r; }
  var sg = new T3.BufferGeometry(); sg.setAttribute('position', new T3.BufferAttribute(sp, 3));
  O.stars = new T3.Points(sg, new T3.PointsMaterial({color:'#ffffff', size:.45, transparent:true, opacity:0, depthWrite:false, fog:false}));
  scene.add(O.stars);
  // 螢火蟲（夜晚在公園與綠地）
  var NF = 70, fp = new Float32Array(NF * 3), seeds = [];
  for (var f = 0; f < NF; f++){ var G = f % 2 ? {at:[1.0, 9.6], r:2.6} : GREENS[0]; var a2 = Math.random() * 6.28, r2 = Math.sqrt(Math.random()) * G.r; seeds.push([G.at[0] + Math.cos(a2) * r2, G.at[1] + Math.sin(a2) * r2, Math.random() * 6.28]); }
  var fg = new T3.BufferGeometry(); fg.setAttribute('position', new T3.BufferAttribute(fp, 3));
  O.flies = new T3.Points(fg, new T3.PointsMaterial({color:'#e8ff8a', size:.09, transparent:true, opacity:0, depthWrite:false, blending:T3.AdditiveBlending}));
  scene.add(O.flies);
  O.anim.push(function(tm){
    if (O.flies.material.opacity < .02) return;
    for (var f = 0; f < NF; f++){ var s = seeds[f]; fp[f * 3] = s[0] + Math.sin(tm * .6 + s[2]) * .3; fp[f * 3 + 1] = landY(s[0], s[1]) + .35 + Math.sin(tm * 1.3 + s[2] * 2) * .15; fp[f * 3 + 2] = s[1] + Math.cos(tm * .5 + s[2]) * .3; }
    fg.attributes.position.needsUpdate = true;
  });
  // 小船
  var BOXC = ['#e05a47', '#f4b942', '#4f9dff', '#2ec4b6', '#9d8cf2', '#ef6b8a', '#6bbf59'];
  O.boats = boats.map(function(b, bi){
    var g = new T3.Group();
    if (b.kind === 'tug'){
      var th = new T3.Mesh(new T3.BoxGeometry(.7, .2, .3), std('#d9533b')); th.position.y = .1; g.add(th);
      var tc2 = new T3.Mesh(new T3.BoxGeometry(.26, .2, .22), std('#fbfaf6')); tc2.position.set(-.05, .3, 0); g.add(tc2);
    } else {
      var hull = new T3.Mesh(new T3.BoxGeometry(3.2, .34, .62), std('#2f3e4c')); hull.position.y = .14; g.add(hull);
      var red = new T3.Mesh(new T3.BoxGeometry(3.21, .1, .63), std('#b8402f')); red.position.y = .02; g.add(red);
      for (var k = 0; k < 8; k++) for (var r = 0; r < 2; r++) for (var c3 = 0; c3 < 2; c3++){
        var bx = new T3.Mesh(new T3.BoxGeometry(.28, .14, .26), std(BOXC[(k * 3 + r + c3 + bi) % 7])); bx.position.set(-1.05 + k * .3, .38 + r * .145, -.14 + c3 * .28); g.add(bx);
      }
      var br2 = new T3.Mesh(new T3.BoxGeometry(.3, .5, .5), std('#fbfaf6')); br2.position.set(1.35, .55, 0); g.add(br2);
    }
    b.g3 = g; inkAll(shadowAll(g), .014); scene.add(g); return b;
  });
  // 海鷗
  O.birds = [];
  for (var bi = 0; bi < 12; bi++){
    var bg = new T3.Group(), wm = std('#ffffff', {side:T3.DoubleSide});
    var wl = new T3.Mesh(new T3.PlaneGeometry(.28, .08), wm), wr = wl.clone(); wl.geometry.translate(-.14, 0, 0); wr.geometry = wl.geometry.clone(); wr.geometry.translate(.28, 0, 0);
    wl.rotation.x = wr.rotation.x = -Math.PI / 2; var pl = new T3.Group(), pr = new T3.Group(); pl.add(wl); pr.add(wr); bg.add(pl); bg.add(pr);
    var bb = new T3.Mesh(new T3.SphereGeometry(.05, 8, 6), wm); bb.scale.set(1.6, .8, .8); bg.add(bb);
    bg.userData = {pl:pl, pr:pr, a:bi * .55, r:2.5 + (bi % 4) * 1.4, y:2.4 + (bi % 3) * .7, sp:.22 + (bi % 3) * .06};
    scene.add(bg); O.birds.push(bg);
  }
}

/* ---------- 接力線 ---------- */
function buildLinks(){
  if (!built) return;
  if (O.links) { scene.remove(O.links); O.links.traverse(function(m){ if (m.geometry) m.geometry.dispose(); }); }
  O.links = new T3.Group(); O.flows = [];
  if (state.links){
    var rel = {}; LINKS.forEach(function(x){ rel[x.id] = x; });
    EDGES.forEach(function(e){
      if (!state.rels[e.rel]) return;
      var A = O.blds[e.a], B = O.blds[e.b], touches = state.sel && (e.a === state.sel || e.b === state.sel);
      var p = new T3.Vector3(A.t.gx, A.top + .1, A.t.gy), q = new T3.Vector3(B.t.gx, B.top + .1, B.t.gy), d = p.distanceTo(q);
      var mid = p.clone().add(q).multiplyScalar(.5); mid.y += .8 + d * .32;
      var curve = new T3.QuadraticBezierCurve3(p, mid, q), op = state.sel ? (touches ? 1 : .1) : .75;
      var tube = new T3.Mesh(new T3.TubeGeometry(curve, 30, touches ? .035 : .02, 5, false), new T3.MeshBasicMaterial({color:rel[e.rel].color, transparent:true, opacity:op}));
      O.links.add(tube);
      var dot = new T3.Mesh(new T3.SphereGeometry(touches ? .08 : .055, 10, 8), new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:op}));
      O.links.add(dot); O.flows.push({c:curve, m:dot, o:Math.random()});
    });
  }
  scene.add(O.links);
}

/* ---------- 人物 ---------- */
// 人物專用材質：四段色階＋邊緣光（rim light），比建築的三段色階更有體積感
var AV_GRAD = null, RIM_U = {value:.24};
function avGrad(){
  if (AV_GRAD) return AV_GRAD;
  AV_GRAD = new T3.DataTexture(new Uint8Array([105, 168, 222, 255]), 4, 1, T3.RedFormat);
  AV_GRAD.minFilter = AV_GRAD.magFilter = T3.NearestFilter; AV_GRAD.generateMipmaps = false; AV_GRAD.needsUpdate = true;
  return AV_GRAD;
}
function avStd(c){
  var m = new T3.MeshToonMaterial({color:c, gradientMap:avGrad()});
  m.onBeforeCompile = function(sh){
    sh.uniforms.rimK = RIM_U;
    sh.fragmentShader = 'uniform float rimK;\n' + sh.fragmentShader.replace(/#include <(opaque|output)_fragment>/, function(s){
      return 'float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);\n' +
             'outgoingLight += vec3(1.0, .97, .9) * smoothstep(.68, .88, rimF) * rimK;\n' + s;
    });
  };
  m.customProgramCacheKey = function(){ return 'avrim'; };
  return m;
}
var SHADOW_TEX = null;
function blobTex(){
  if (SHADOW_TEX) return SHADOW_TEX;
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(30,20,40,.55)'); gr.addColorStop(.6, 'rgba(30,20,40,.22)'); gr.addColorStop(1, 'rgba(30,20,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (SHADOW_TEX = new T3.CanvasTexture(c));
}
function makeAv(A, shirt, mine){
  shirt = shirt || '#ff6f59';
  var g = new T3.Group(), body = new T3.Group(); g.add(body);
  var furM = avStd(A.fur), lightM = avStd(A.light), innerM = avStd(A.inner), darkM = avStd(A.dark || INK), noseM = avStd(A.nose);
  var shirtM = avStd(shirt), trimM = avStd(hexMix(shirt, '#3b2f3a', .3)), whiteM = avStd('#fbf8f2');
  var pantsM = avStd('#3f5f8f'), shoeM = avStd(hexMix(shirt, '#3b2f3a', .45)), bagM = avStd('#c98a4b'), bagDarkM = avStd('#8f5a2c');
  var noInk = [];
  function M(geo, mat, x, y, z, parent){ var m = new T3.Mesh(geo, mat); m.position.set(x, y, z); (parent || body).add(m); return m; }
  function S(r, a, b){ return new T3.SphereGeometry(r, a || 20, b || 16); }
  // 腳：短褲管＋球鞋（鞋面＋白色鞋底＋鞋帶）
  function leg(x){
    var p = new T3.Group(); p.position.set(x, .125, 0); body.add(p);
    M(new T3.CapsuleGeometry(.034, .045, 6, 14), pantsM, 0, -.03, 0, p);
    var shoe = M(S(.042), shoeM, 0, -.083, .016, p); shoe.scale.set(1, .72, 1.4);
    var sole = M(S(.044), whiteM, 0, -.1, .016, p); sole.scale.set(1.02, .3, 1.45);
    var lace = M(new T3.BoxGeometry(.03, .006, .012), whiteM, 0, -.06, .05, p); lace.rotation.x = -.5; noInk.push(lace);
    return p;
  }
  var legL = leg(-.045), legR = leg(.045);
  // 身體：T 恤＋白領口＋下擺滾邊＋口袋，下面是短褲
  var pants = M(new T3.CylinderGeometry(.074, .08, .05, 24), pantsM, 0, .115, 0); pants.scale.z = .9;
  var torso = M(new T3.CapsuleGeometry(.075, .05, 8, 24), shirtM, 0, .19, 0); torso.scale.set(1, 1, .9);
  var hem = M(new T3.TorusGeometry(.073, .01, 8, 28), trimM, 0, .128, 0); hem.rotation.x = Math.PI / 2; hem.scale.y = .9; noInk.push(hem);
  var collar = M(new T3.TorusGeometry(.052, .013, 8, 28), whiteM, 0, .272, .004); collar.rotation.x = Math.PI / 2 - .25; noInk.push(collar);
  var pocket = M(new T3.BoxGeometry(.034, .03, .008), trimM, -.03, .2, .066); pocket.rotation.y = -.35; noInk.push(pocket);
  [.215, .175].forEach(function(y){ noInk.push(M(S(.007, 8, 6), whiteM, .02, y, .069)); });
  // 背包：創業者的小背包＋肩帶
  var bag = M(new T3.CapsuleGeometry(.045, .03, 6, 16), bagM, 0, .21, -.082); bag.scale.set(1.05, 1, .55);
  var flap = M(S(.047, 16, 10), bagDarkM, 0, .245, -.084); flap.scale.set(1.02, .45, .6);
  var bpk = M(new T3.BoxGeometry(.04, .026, .012), bagDarkM, 0, .185, -.112); noInk.push(bpk);
  [-1, 1].forEach(function(s){
    var st = M(new T3.TorusGeometry(.06, .007, 6, 18, Math.PI * .9), bagDarkM, s * .045, .215, -.01); st.rotation.set(0, Math.PI / 2, Math.PI * .55); noInk.push(st);
  });
  // 手：袖口＋毛色小手（含大拇指）
  function arm(s){
    var p = new T3.Group(); p.position.set(s * .088, .25, 0); body.add(p);
    M(new T3.CapsuleGeometry(.027, .025, 6, 14), shirtM, 0, -.018, 0, p);
    var cuff = M(new T3.TorusGeometry(.024, .006, 6, 16), trimM, 0, -.042, 0, p); cuff.rotation.x = Math.PI / 2; noInk.push(cuff);
    M(new T3.CapsuleGeometry(.018, .03, 4, 10), furM, 0, -.06, 0, p);
    var hand = M(S(.029, 16, 12), furM, 0, -.088, .004, p); hand.scale.set(1, .92, .95);
    var th = M(S(.011, 10, 8), furM, -s * .004, -.078, .026, p); noInk.push(th);
    p.rotation.z = s * .26;
    return p;
  }
  var armL = arm(-1), armR = arm(1);
  // 尾巴（從短褲後面長出來）
  if (A.tail === 'long'){ var tl = M(new T3.CapsuleGeometry(.018, .16, 6, 10), furM, 0, .15, -.1); tl.rotation.x = -.9; M(S(.022, 12, 10), A.mark === 'tiger' ? darkM : lightM, 0, .21, -.165); }
  else if (A.tail === 'fluffy'){ var tf = M(S(.06), furM, 0, .16, -.125); tf.scale.set(.8, 1.5, .8); tf.rotation.x = -.8; M(S(.032, 12, 10), lightM, 0, .245, -.19); }
  else if (A.tail === 'puff'){ M(S(.036, 14, 12), lightM, 0, .12, -.078); }
  else if (A.tail === 'short'){ var ts = M(new T3.CapsuleGeometry(.016, .06, 4, 8), furM, 0, .15, -.085); ts.rotation.x = -1.1; }
  else if (A.tail === 'curl'){ var tc = M(new T3.TorusGeometry(.022, .008, 8, 18, Math.PI * 1.6), noseM, 0, .13, -.085); tc.rotation.y = Math.PI / 2; }
  // 頭
  var head = new T3.Group(); head.position.y = .39; body.add(head);
  var face = M(S(.14, 40, 30), furM, 0, 0, 0, head); face.scale.set(1, .94, .96);
  var e = A.ear;
  if (e === 'cat' || e === 'fox' || e === 'pig'){
    var eh = e === 'fox' ? .12 : e === 'pig' ? .06 : .09;
    [-1, 1].forEach(function(s){
      var ear = M(new T3.ConeGeometry(.05, eh, 12), furM, s * .085, .12 + eh / 3, 0, head); ear.rotation.set(e === 'pig' ? .5 : 0, 0, -s * .35); ear.scale.z = .6;
      if (e !== 'pig'){ var inn = M(new T3.ConeGeometry(.03, eh * .7, 12), innerM, s * .083, .113 + eh / 3, .018, head); inn.rotation.set(0, 0, -s * .35); inn.scale.z = .35; noInk.push(inn); }
      if (e === 'fox'){ var tip = M(new T3.ConeGeometry(.022, eh * .32, 12), darkM, s * (.085 + .028), .12 + eh * .78, 0, head); tip.rotation.z = -s * .35; tip.scale.z = .6; noInk.push(tip); }
    });
  } else if (e === 'long'){
    [-1, 1].forEach(function(s){
      var ear = M(new T3.CapsuleGeometry(.032, .17, 6, 14), furM, s * .05, .24, -.02, head); ear.rotation.z = -s * .15; ear.scale.z = .6;
      var inn = M(new T3.CapsuleGeometry(.016, .13, 6, 10), innerM, s * .05, .235, .002, head); inn.rotation.z = -s * .15; inn.scale.z = .4; noInk.push(inn);
    });
  } else if (e === 'round' || e === 'koala'){
    var er = e === 'koala' ? .065 : .045, ex = e === 'koala' ? .13 : .1, ey = e === 'koala' ? .08 : .115;
    [-1, 1].forEach(function(s){
      var ear = M(S(er), A.mark === 'panda' ? darkM : furM, s * ex, ey, -.01, head); ear.scale.z = .6;
      var inn = M(S(er * .58, 14, 10), innerM, s * ex, ey, er * .32, head); inn.scale.z = .3; noInk.push(inn);
      if (e === 'koala') [0, 1, 2].forEach(function(k){ noInk.push(M(S(.018, 8, 6), lightM, s * (ex + .05), ey + .03 - k * .03, 0, head)); });
    });
  } else if (e === 'floppy'){
    [-1, 1].forEach(function(s){ var ear = M(new T3.CapsuleGeometry(.038, .09, 6, 14), innerM, s * .135, 0, -.01, head); ear.rotation.z = s * .3; ear.scale.z = .55; });
  } else if (e === 'tuft'){
    [-.025, 0, .025].forEach(function(x, i){ var f = M(S(.022, 10, 8), furM, x, .15 + (i === 1 ? .015 : 0), .01, head); f.scale.y = 1.6; f.rotation.z = -x * 12; });
  } else if (e === 'frog'){
    [-1, 1].forEach(function(s){ M(S(.055), furM, s * .062, .105, .05, head); });
  }
  // 瀏海毛（有毛的動物額頭多一撮）
  if (['cat', 'dog', 'bear', 'fox', 'tiger', 'koala', 'rabbit', 'panda'].indexOf(A.id) >= 0){
    [[-.03, .118, .055, .03], [.012, .126, .05, .034], [.045, .112, .05, .026]].forEach(function(q){ var f = M(S(q[3], 12, 10), furM, q[0], q[1], q[2], head); f.scale.set(1, .8, .9); noInk.push(f); });
  }
  // 臉頰兩側的毛
  if (A.id === 'cat' || A.id === 'fox' || A.id === 'tiger'){
    [-1, 1].forEach(function(s){ [0, 1].forEach(function(k){ var c = M(new T3.ConeGeometry(.022, .05, 8), furM, s * (.132 + k * .004), -.03 - k * .028, .01, head); c.rotation.z = s * (Math.PI / 2 + .25 - k * .5); c.scale.z = .6; noInk.push(c); }); });
  }
  if (A.mark === 'face'){ var fc = M(S(.11), lightM, 0, -.015, .045, head); fc.scale.set(1.05, .95, .9); }
  if (A.mark === 'panda') [-1, 1].forEach(function(s){ var pt = M(S(.038), darkM, s * .055, -.008, .112, head); pt.scale.set(.85, 1.15, .4); pt.rotation.z = s * .4; noInk.push(pt); });
  if (A.mark === 'tiger'){
    [-.05, 0, .05].forEach(function(x){ var st = M(new T3.BoxGeometry(.012, .05, .02), darkM, x, .1, .085, head); st.rotation.x = -.6; noInk.push(st); });
    [-1, 1].forEach(function(s){ [0, 1].forEach(function(k){ var st = M(new T3.BoxGeometry(.045, .01, .02), darkM, s * .12, .01 - k * .03, .05, head); st.rotation.set(0, s * .7, -s * .2); noInk.push(st); }); });
  }
  if (A.snout === 'muzzle'){ var mz = M(S(.06), lightM, 0, -.05, .1, head); mz.scale.set(1.15, .75, .7); }
  // 眼睛：深色眼框＋有顏色的虹膜（下方較亮）＋大小兩顆高光，眨眼時整顆一起壓扁
  var eyes = [], pale = A.fur === '#fbfbf7' || A.fur === '#fbf7f2', irisC = hexMix(pale ? '#6a5acd' : A.fur, '#2b2140', .45);
  [-.052, .052].forEach(function(x){
    var y = e === 'frog' ? .115 : -.012, z = e === 'frog' ? .1 : .124;
    var eye = M(S(.028, 18, 14), new T3.MeshBasicMaterial({color:'#2b2140'}), x * (e === 'frog' ? 1.2 : 1), y, z, head);
    eye.scale.set(.82, 1.25, .5); eyes.push(eye); noInk.push(eye);
    var iris = M(S(.02, 14, 10), new T3.MeshBasicMaterial({color:irisC}), 0, -.005, .018, eye); iris.scale.z = .6; noInk.push(iris);
    var low = M(S(.012, 10, 8), new T3.MeshBasicMaterial({color:hexMix(irisC, '#ffffff', .4)}), 0, -.012, .024, eye); low.scale.set(1.2, .7, .5); noInk.push(low);
    var pup = M(S(.009, 10, 8), new T3.MeshBasicMaterial({color:'#1a1226'}), 0, -.001, .026, eye); pup.scale.z = .5; noInk.push(pup);
    noInk.push(M(S(.008, 10, 8), new T3.MeshBasicMaterial({color:'#ffffff'}), .008, .011, .03, eye));
    noInk.push(M(S(.0038, 8, 6), new T3.MeshBasicMaterial({color:'#ffffff'}), -.009, -.013, .03, eye));
    if (e !== 'frog'){ var br = M(new T3.CapsuleGeometry(.0045, .022, 4, 8), new T3.MeshBasicMaterial({color:hexMix(A.fur, '#2b2140', .6)}), x * 1.02, .042, .126, head); br.rotation.z = Math.PI / 2 + (x < 0 ? -.18 : .18); noInk.push(br); }
    var blush = M(S(.024, 14, 10), new T3.MeshBasicMaterial({color:'#ff8fa8', transparent:true, opacity:.55, depthWrite:false}), x * 1.5, -.055, .11, head);
    blush.scale.set(1.1, .5, .35); noInk.push(blush);
  });
  // 鼻子、嘴
  if (A.snout === 'beak'){ var bk = M(new T3.ConeGeometry(.03, .07, 16), noseM, 0, -.045, .15, head); bk.rotation.x = Math.PI / 2; }
  else if (A.snout === 'pig'){ var sn = M(new T3.CylinderGeometry(.04, .042, .035, 24), noseM, 0, -.045, .135, head); sn.rotation.x = Math.PI / 2; [-1, 1].forEach(function(s){ noInk.push(M(S(.007, 8, 6), new T3.MeshBasicMaterial({color:INK}), s * .014, -.045, .153, head)); }); }
  else if (A.snout === 'bignose'){ var bn = M(S(.038), noseM, 0, -.035, .13, head); bn.scale.set(.8, 1.05, .6); noInk.push(M(S(.008, 8, 6), new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.7}), -.01, -.015, .152, head)); }
  else if (A.snout !== 'none'){
    var mzl = A.snout === 'muzzle';
    var ns = M(S(.016, 12, 10), noseM, 0, mzl ? -.035 : -.04, mzl ? .158 : .136, head); ns.scale.set(1.3, .9, .9); noInk.push(ns);
    noInk.push(M(S(.005, 6, 6), new T3.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.75}), -.006, mzl ? -.03 : -.035, mzl ? .17 : .149, head));
  }
  if (A.snout !== 'beak' && A.snout !== 'pig' && A.snout !== 'bignose'){
    var mz2 = A.snout === 'muzzle';
    var mouth = M(new T3.TorusGeometry(.014, .004, 6, 14, Math.PI), new T3.MeshBasicMaterial({color:'#a24a52'}), 0, mz2 ? -.068 : -.062, mz2 ? .152 : .132, head);
    mouth.rotation.z = Math.PI; noInk.push(mouth);
    var tongue = M(S(.007, 8, 6), new T3.MeshBasicMaterial({color:'#ff7f95'}), 0, mz2 ? -.074 : -.068, mz2 ? .15 : .13, head); tongue.scale.set(1.2, .7, .6); noInk.push(tongue);
  }
  if (A.mark === 'whisker') [-1, 1].forEach(function(s){ [0, 1].forEach(function(k){ var w = M(new T3.BoxGeometry(.06, .003, .003), new T3.MeshBasicMaterial({color:INK}), s * .1, -.05 - k * .015, .1, head); w.rotation.z = s * (k ? -.12 : .12); noInk.push(w); }); });
  noInk.forEach(function(m){ m.userData.noInk = true; });
  // 腳下的柔和接觸陰影，讓角色「站」在地上
  var blob = new T3.Mesh(new T3.PlaneGeometry(.34, .34), new T3.MeshBasicMaterial({map:blobTex(), transparent:true, depthWrite:false}));
  blob.rotation.x = -Math.PI / 2; blob.position.y = .012; blob.userData.noInk = true; blob.raycast = noPick; g.add(blob);
  g.scale.setScalar(1.05);
  shadowAll(g); noInk.forEach(function(m){ m.castShadow = false; }); blob.castShadow = blob.receiveShadow = false;
  inkAll(g, .008); scene.add(g);
  var tag = document.createElement('div'); tag.className = 'av3' + (mine ? ' mine' : '');
  if (mine){ tag.title = '點一下換動物、改名字'; tag.addEventListener('click', function(ev){ ev.stopPropagation(); openNamePop(); }); tag.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); }); }
  labRoot.appendChild(tag);
  var bub = document.createElement('div'); bub.className = 'bub3'; bub.style.display = 'none'; labRoot.appendChild(bub);   // 聊天對話泡泡（內容在 index.html 的 BUBBLES）
  return {g:g, body:body, torso:torso, head:head, eyes:eyes, legL:legL, legR:legR, armL:armL, armR:armR, shirt:shirtM, trim:trimM, shoe:shoeM, tag:tag, bub:bub, bubText:'', animal:A.id, last:'', px:null, pz:null, yaw:0, blink:2 + Math.random() * 3, t:0};
}
function dropAv(a){ scene.remove(a.g); a.tag.remove(); a.bub.remove(); a.g.traverse(function(m){ if (m.geometry && !m.userData.ink) m.geometry.dispose(); }); }
function poseAv(a, o, name, shirt, dt){
  var x = o.gx, z = o.gy, moving = false;
  if (a.px !== null){ var dx = x - a.px, dz = z - a.pz; if (dx * dx + dz * dz > 1e-6){ moving = true; var want = Math.atan2(dx, dz), d = ((want - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.yaw += d * Math.min(1, dt * 12); } }
  if (!moving){ var ft = faceTarget(o); if (ft){ var fw = Math.atan2(ft.gx - x, ft.gy - z), fd = ((fw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; if (Math.abs(fd) > .02) a.yaw += fd * Math.min(1, dt * 8); } }   // 說話時轉頭面向對方
  a.px = x; a.pz = z;
  a.g.position.set(x, standY(x, z), z); a.g.rotation.y = a.yaw;
  var sw = moving ? Math.sin(o.phase) * .7 : 0;
  a.legL.rotation.x = sw; a.legR.rotation.x = -sw; a.armL.rotation.x = -sw * 1.1; a.armR.rotation.x = sw * 1.1;
  a.t += dt;
  var hop = moving ? Math.abs(Math.sin(o.phase)) : 0;
  a.body.position.y = hop * .04;                                                        // 走路一蹦一蹦（影子留在地上）
  a.body.scale.set(1 + (moving ? (1 - hop) * .04 : 0), 1 - (moving ? (1 - hop) * .05 : 0), 1);   // 落地時微微壓扁
  a.body.rotation.x = moving ? .1 : 0;                                                  // 往前傾
  a.torso.rotation.y = moving ? Math.sin(o.phase) * .18 : 0;                           // 跟著步伐扭腰
  a.head.rotation.z = moving ? Math.sin(o.phase) * .07 : Math.sin(a.t * 1.6) * .04;   // 走路晃頭、站著輕輕搖
  a.head.position.y = .39 + (moving ? 0 : Math.sin(a.t * 2.4) * .006);                // 站著時的呼吸
  a.blink -= dt;
  var lid = a.blink < 0 ? .12 : 1.25; if (a.blink < -.12) a.blink = 2 + Math.random() * 3.5;
  a.eyes.forEach(function(e){ e.scale.y = lid; });
  var label = (hasBadWord(name) ? '旅人' : name) + (a.tag.classList.contains('mine') ? '（你）✎' : '');
  if (label !== a.last){ a.tag.textContent = label; a.last = label; }
  if (shirt && a.shirtHex !== shirt){ a.shirt.color.set(shirt); a.trim.color.set(hexMix(shirt, '#3b2f3a', .3)); a.shoe.color.set(hexMix(shirt, '#3b2f3a', .45)); a.tag.style.background = shirt; a.shirtHex = shirt; }
}
function syncAvatars(dt){
  var A = animalOf(me);
  if (O.avs.me && O.avs.me.animal !== A.id){ var keep = O.avs.me; dropAv(keep); O.avs.me = null; }
  if (!O.avs.me){ O.avs.me = makeAv(A, me.shirt, true); if (keep){ O.avs.me.yaw = keep.yaw; } }
  poseAv(O.avs.me, walker, me.name, me.shirt, dt);
  Object.keys(PEERS).forEach(function(id){
    var p = PEERS[id], d = p.av.data || {}, PA = animalOf(d, id);
    if (O.avs[id] && O.avs[id].animal !== PA.id){ dropAv(O.avs[id]); delete O.avs[id]; }
    if (!O.avs[id]){
      O.avs[id] = makeAv(PA, d.shirt, false);
      var tg = O.avs[id].tag; tg.classList.add('peer'); tg.title = '點一下跟他說話';     // 點別人的名牌開始對話
      tg.addEventListener('click', function(ev){ ev.stopPropagation(); openTalk(id); }); tg.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); });
    }
    poseAv(O.avs[id], p, p.name, d.shirt, dt);
  });
  Object.keys(O.avs).forEach(function(id){
    if (id !== 'me' && !PEERS[id]){ dropAv(O.avs[id]); delete O.avs[id]; }
  });
}

/* ---------- 標籤（HTML 疊在畫布上） ---------- */
function buildLabels(){
  TOOLS.forEach(function(t){
    var d = document.createElement('button'); d.type = 'button'; d.className = 'tag3';
    d.innerHTML = (t.lic ? '<i class="lic-dot sm"></i>' : '') + t.short;
    d.title = t.name + (t.lic ? '（需序號）' : '');
    d.addEventListener('click', function(e){ e.stopPropagation(); openTool(t.id); });
    d.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    labRoot.appendChild(d); O.tags.push({el:d, b:O.blds[t.id]});
  });
  ZONES.forEach(function(z){
    var d = document.createElement('div'); d.className = 'zone3';
    d.innerHTML = '<b>' + z.name + '</b><small>' + z.en + '</small>'; d.style.setProperty('--zc', mix(z.color, '#14303d', .55));
    labRoot.appendChild(d); O.zoneTags.push({el:d, x:z.cx, z:z.cy, y:landY(z.cx, z.cy) + 1.6});
  });
  GREENS.concat(HILLS.filter(function(H){ return H.name; })).forEach(function(G){
    var d = document.createElement('div'); d.className = 'zone3 decor'; d.innerHTML = '<b>' + G.name + '</b>';
    labRoot.appendChild(d); O.zoneTags.push({el:d, x:G.label[0], z:G.label[1], y:landY(G.label[0], G.label[1]) + .9});
  });
  var bd = document.createElement('button'); bd.type = 'button'; bd.className = 'tag3 board3'; bd.textContent = '📋 公布欄';   // 看板的醒目標籤
  bd.addEventListener('click', function(e){ e.stopPropagation(); openBoard(); }); bd.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
  labRoot.appendChild(bd); O.zoneTags.push({el:bd, x:BOARD_AT[0], z:BOARD_AT[1], y:landY(BOARD_AT[0], BOARD_AT[1]) + 2.5});
  var rv = document.createElement('div'); rv.className = 'zone3 decor'; rv.innerHTML = '<b>倉庫運河</b>'; labRoot.appendChild(rv);
  O.zoneTags.push({el:rv, x:RIVER[4][0] + .2, z:RIVER[4][1] - .9, y:.9});
}
var V = null;
function project(x, y, z){
  V.set(x, y, z).project(camera);
  return {x:(V.x * .5 + .5) * world.clientWidth, y:(-V.y * .5 + .5) * world.clientHeight, ok:V.z < 1 && V.z > -1};
}
function placeLabels(){
  var cp = camera.position, wv = world.clientWidth, hv = world.clientHeight;
  function put(el, x, y, z, near, far, minS){
    var p = project(x, y, z), d = Math.hypot(cp.x - x, cp.y - y, cp.z - z);
    var op = 1 - smooth(near, far, d);
    if (!p.ok || op < .03 || p.x < -80 || p.x > wv + 80 || p.y < -40 || p.y > hv + 40){ el.style.display = 'none'; return; }
    var s = Math.max(minS, Math.min(1.1, 9 / d));
    el.style.display = ''; el.style.opacity = op.toFixed(2);
    el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%) scale(' + s.toFixed(3) + ')';
    el.style.zIndex = String(1000 - Math.round(d * 10));
  }
  O.tags.forEach(function(o){
    if (!state.tags){ o.el.style.display = 'none'; return; }
    var dim = state.sel && state.sel !== o.b.t.id;
    put(o.el, o.b.t.gx, o.b.top + .15, o.b.t.gy, 13, 30, .55);
    o.el.classList.toggle('sel', state.sel === o.b.t.id); o.el.classList.toggle('dim', !!dim);
  });
  O.zoneTags.forEach(function(o){ put(o.el, o.x, o.y, o.z, 30, 60, .7); });
  var nowMs = Date.now();
  Object.keys(O.avs).forEach(function(id){
    var a = O.avs[id], x = a.g.position.x, y = a.g.position.y + .7, z = a.g.position.z;
    put(a.tag, x, y, z, 18, 40, .6);
    var b = window.BUBBLES && BUBBLES[id], txt = b && b.until > nowMs && a.tag.style.display !== 'none' ? b.text : '';
    if (txt !== a.bubText){ a.bub.textContent = txt; a.bubText = txt; }
    if (txt) put(a.bub, x, y, z, 18, 40, .6); else a.bub.style.display = 'none';
  });
}

/* ---------- 天色：跟本機時間同步，或手動切白天／黃昏／夜晚 ---------- */
var SKY_LABEL = {now:'現在', day:'白天', dusk:'黃昏', night:'夜晚'}, SKY_HOUR = {day:10.5, dusk:18.1, night:22};
function skyHour(){ return prefs.sky === 'now' ? nowHour() : SKY_HOUR[prefs.sky]; }
function updateSky(force){
  var h = skyHour(), dk = darkness(h);
  if (!force && Math.abs(dk - sky.dk) < .002 && sky.h === Math.floor(h * 4)) return;
  sky.dk = dk; sky.h = Math.floor(h * 4);
  var dusk = dk > 0 && dk < 1 ? 1 - Math.abs(dk - .5) * 2 : 0;
  var topC = col('#2f86e0').lerp(col('#060c26'), dk).lerp(col('#5b5fb0'), dusk * .7);
  var horC = col('#c6ecfa').lerp(col('#1b2c58'), dk).lerp(col('#ffb48a'), dusk * .8);
  O.dome.material.uniforms.top.value.copy(topC); O.dome.material.uniforms.hor.value.copy(horC);
  scene.fog.color.copy(horC);
  var day = h >= 5 && h < 19.5, az = (h - 6) / 13.5 * Math.PI;
  var elev = day ? Math.max(.12, Math.sin(Math.max(.05, Math.min(Math.PI - .05, az)))) : .7;
  var dir = day ? Math.cos(Math.max(.05, Math.min(Math.PI - .05, az))) : -.4;
  sun.position.set(C[0] + dir * 18, 4 + elev * 20, C[1] - 10 + dir * 4);
  sun.target.position.set(C[0], 0, C[1]);
  sun.color.copy(col('#fff4e0').lerp(col('#ffb06b'), dusk).lerp(col('#9db8ff'), dk * (1 - dusk)));
  sun.intensity = 1.9 * (1 - dk) + .75 * dk;
  hemi.intensity = 1.25 * (1 - dk) + .7 * dk;
  hemi.color.copy(col('#dff3ff').lerp(col('#3a4f88'), dk)); hemi.groundColor.copy(col('#8a9a6a').lerp(col('#1a2238'), dk));
  RIM_U.value = .24 * (1 - dk) + .1 * dk;                                             // 人物邊緣光：夜裡收斂
  O.water.material.color.copy(col('#47c6e6').lerp(col('#1d4f86'), dk).lerp(col('#f0a58f'), dusk * .35));
  O.stars.material.opacity = Math.max(0, dk - .25) * 1.2;
  O.flies.material.opacity = Math.max(0, dk - .4) * 1.4;
  O.bulbMat.emissiveIntensity = dk > .3 ? 2.2 * dk : 0;
  O.clouds.forEach(function(c){ c.children[0].material.color.copy(col('#ffffff').lerp(col('#5a6a8a'), dk).lerp(col('#ffd2b0'), dusk * .5)); });
  O.farMat.color.copy(col('#ffffff').lerp(col('#2a3766'), dk).lerp(col('#ffc0a0'), dusk * .7));
  TOOLS.forEach(function(t){
    var on = h >= t.hour[0] && h < t.hour[1];
    var v = dk > .15 && on ? 1.6 * Math.min(1, dk * 1.5) : dk > .5 ? .12 : 0;
    (t.emis || []).forEach(function(m){ m.emissiveIntensity = v; });
  });
  if (O.beam) O.beam.mat.opacity = dk > .3 ? .16 * dk : 0;
  (O.glows || []).forEach(function(g){ g.m.emissiveIntensity = g.day + (g.night - g.day) * dk; });
  $('tbSky').innerHTML = '<span class="dot"></span>天色：' + SKY_LABEL[prefs.sky];
}

/* ---------- 環境音（WebAudio 合成：浪聲、白天鳥叫、夜晚蟲鳴） ---------- */
var AU = null;
function startSound(){
  try {
    if (!AU){
      var ctx = new (window.AudioContext || window.webkitAudioContext)(), len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++){ var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      var gain = ctx.createGain(); gain.gain.value = .0;
      var master = ctx.createGain(); master.gain.value = .55;
      src.connect(lp); lp.connect(gain); gain.connect(master); master.connect(ctx.destination); src.start();
      AU = {ctx:ctx, wave:gain, master:master, next:0};
    }
    AU.ctx.resume(); AU.master.gain.setTargetAtTime(.55, AU.ctx.currentTime, .3);
  } catch(e){ AU = null; }
}
function stopSound(){ if (AU) AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, .2); }
function chirp(night){
  var ctx = AU.ctx, t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(AU.master); o.type = 'sine';
  if (night){ o.frequency.value = 4200 + Math.random() * 600; for (var i = 0; i < 3; i++){ g.gain.setValueAtTime(.0, t0 + i * .07); g.gain.linearRampToValueAtTime(.025, t0 + i * .07 + .02); g.gain.linearRampToValueAtTime(0, t0 + i * .07 + .05); } o.start(t0); o.stop(t0 + .25); }
  else { var f = 2200 + Math.random() * 1400; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + .08); o.frequency.exponentialRampToValueAtTime(f * .9, t0 + .16); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.04, t0 + .02); g.gain.linearRampToValueAtTime(0, t0 + .18); o.start(t0); o.stop(t0 + .2); }
}
function soundTick(tm){
  if (!AU || !prefs.sound) return;
  var near = Math.max(0, 1 - Math.max(0, edgeD(walker.gx, walker.gy) + 4) / 8);   // 越靠海岸浪聲越大
  var swell = .5 + .5 * Math.sin(tm * .8) * Math.sin(tm * .31);
  AU.wave.gain.setTargetAtTime((.05 + near * .25) * (.5 + swell * .5) + (cam.overview ? .1 : 0), AU.ctx.currentTime, .4);
  if (tm > AU.next){ AU.next = tm + (sky.dk > .6 ? .7 + Math.random() * 1.2 : 1.5 + Math.random() * 4); chirp(sky.dk > .6); }
}

/* ---------- 鏡頭與操作 ---------- */
function camApply(dt){
  var tx, ty, tz, k = Math.min(1, dt * 4);
  if (cam.overview){
    if (!state.paused) cam.yaw += dt * .05;
    tx = C[0]; ty = 0; tz = C[1];
  } else { tx = walker.gx; ty = standY(walker.gx, walker.gy) + .35; tz = walker.gy; }
  cam.tx += (tx - cam.tx) * k; cam.ty += (ty - cam.ty) * k; cam.tz += (tz - cam.tz) * k;
  var cp = Math.cos(cam.pitch), x = cam.tx + Math.sin(cam.yaw) * cp * cam.dist, z = cam.tz + Math.cos(cam.yaw) * cp * cam.dist, y = cam.ty + Math.sin(cam.pitch) * cam.dist;
  y = Math.max(y, Math.max(SEA, landY(x, z)) + .25);
  camera.position.set(x, y, z); camera.lookAt(cam.tx, cam.ty, cam.tz);
}
function setOverview(on){
  cam.overview = on;
  if (on){ cam.dist = Math.max(cam.dist, 24); cam.pitch = Math.max(cam.pitch, .78); }
  else if (cam.dist > 14){ cam.dist = 8.5; cam.pitch = .55; }
}
function keyMove(dt){
  var f = 0, r = 0;
  if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1;
  if (keys.d || keys.arrowright) r += 1; if (keys.a || keys.arrowleft) r -= 1;
  if (!f && !r) return false;
  if (cam.overview) setOverview(false);
  var fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  var dx = fx * f + rx * r, dz = fz * f + rz * r, l = Math.hypot(dx, dz); dx /= l; dz /= l;
  var here = [walker.gx, walker.gy], nx, nz, L3 = [.35, .22, .12, .06];
  function ok(x, z){ return fineOK(x, z) && los(here, [x, z]); }
  var k, st;
  for (k = 0; k < L3.length && nx === undefined; k++){         // 前面有牆就縮短步伐，貼近牆邊才停
    st = L3[k]; if (ok(walker.gx + dx * st, walker.gy + dz * st)){ nx = walker.gx + dx * st; nz = walker.gy + dz * st; }
  }
  for (k = 0; k < L3.length && nx === undefined; k++){         // 正前方完全走不了：沿著牆滑
    st = L3[k];
    if (Math.abs(dx) > .2 && ok(walker.gx + Math.sign(dx) * st, walker.gy)){ nx = walker.gx + Math.sign(dx) * st; nz = walker.gy; }
    else if (Math.abs(dz) > .2 && ok(walker.gx, walker.gy + Math.sign(dz) * st)){ nx = walker.gx; nz = walker.gy + Math.sign(dz) * st; }
  }
  if (nx === undefined){ walker.path = []; return true; }
  walker.goal = null; walker.pending = null; walker.path = [[nx, nz]];
  return true;
}
var ptr = {}, drag = null, hoverId = null, lastHover = 0;
function pickAt(cx, cy, list){
  var r = canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(list, false);
  return hit.length ? hit[0] : null;
}
function peerAt(cx, cy){
  var r = canvas.getBoundingClientRect(), hit = null, hd = 1e9;
  Object.keys(O.avs).forEach(function(id){
    if (id === 'me' || !PEERS[id]) return;
    var g = O.avs[id].g.position, p = project(g.x, g.y + .3, g.z); if (!p.ok) return;
    var d = Math.hypot(cx - r.left - p.x, cy - r.top - p.y), tol = Math.max(18, 40 / Math.max(1, camera.position.distanceTo(g) / 4));
    if (d < tol && d < hd){ hd = d; hit = id; }
  });
  return hit;
}
function bindInput(){
  canvas.addEventListener('pointerdown', function(e){
    ptr[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(ptr);
    if (ids.length === 1) drag = {x:e.clientX, y:e.clientY, yaw:cam.yaw, pitch:cam.pitch, moved:false};
    if (ids.length === 2){ var a = ptr[ids[0]], b = ptr[ids[1]]; drag = {pinch:Math.hypot(a.x - b.x, a.y - b.y), dist:cam.dist, moved:true}; }
  });
  canvas.addEventListener('pointermove', function(e){
    if (!(e.pointerId in ptr)){
      var now = performance.now(); if (now - lastHover < 60) return; lastHover = now;
      var h = pickAt(e.clientX, e.clientY, O.pick), id = h ? h.object.userData.id : null;
      hoverId = id; canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id === '__far') showFarTip(e.clientX, e.clientY - 12); else if (id === '__board') showBoardTip(e.clientX, e.clientY - 12); else if (id) showTip(toolById[id], e.clientX, e.clientY - 12); else $('tip').classList.remove('show');
      return;
    }
    ptr[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(ptr);
    if (ids.length === 2 && drag && drag.pinch){
      var a = ptr[ids[0]], b = ptr[ids[1]];
      cam.dist = Math.max(1.6, Math.min(40, drag.dist * drag.pinch / Math.hypot(a.x - b.x, a.y - b.y))); return;
    }
    if (!drag || drag.pinch) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved){ drag.moved = true; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
    cam.yaw = drag.yaw - dx * .0065; cam.pitch = Math.max(.08, Math.min(1.42, drag.pitch + dy * .005));
  });
  function end(e){
    var d = drag; delete ptr[e.pointerId];
    if (Object.keys(ptr).length) return;
    drag = null; canvas.style.cursor = hoverId ? 'pointer' : 'grab';
    if (e.type !== 'pointerup' || !d || d.moved) return;
    var pid = peerAt(e.clientX, e.clientY); if (pid){ openTalk(pid); return; }   // 點到別人的動物
    var hb = pickAt(e.clientX, e.clientY, O.pick);
    if (hb){ if (hb.object.userData.id === '__far') farGoClick(); else if (hb.object.userData.id === '__board') openBoard(); else openTool(hb.object.userData.id); return; }
    var hg = pickAt(e.clientX, e.clientY, [O.terrain]);
    if (hg){ if (cam.overview) setOverview(false); walker.goal = null; walkTo(hg.point.x, hg.point.z); }
  }
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', function(){ $('tip').classList.remove('show'); });
  canvas.addEventListener('wheel', function(e){ e.preventDefault(); cam.dist = Math.max(1.6, Math.min(40, cam.dist * Math.pow(1.0012, e.deltaY))); }, {passive:false});
  window.addEventListener('keydown', function(e){
    if (!active || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    var k = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k) >= 0){ keys[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function(){ keys = {}; });
  window.addEventListener('resize', resize);
}
function resize(){
  if (!renderer || !active) return;
  var w = world.clientWidth, h = world.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

/* ---------- 每一格 ---------- */
var tm = 0;
function frame(ts){
  if (!active) return;
  rafId = requestAnimationFrame(frame);
  var dt = Math.min(.05, Math.max(0, (ts - lastT) / 1000) || 0); lastT = ts;
  if (!state.paused) tm += dt;
  keyMove(dt);
  // 水面波浪
  if (!state.paused){
    var pa = O.water.geometry.attributes.position, arr = pa.array, b0 = O.waterBase;
    for (var i = 1; i < arr.length; i += 3){ var x = b0[i - 1], z = b0[i + 1]; arr[i] = SEA + Math.sin(x * .9 + tm * 1.3) * .025 + Math.cos(z * 1.1 - tm * 1.1) * .02; }
    pa.needsUpdate = true;
    if ((Math.floor(tm * 30) & 1) === 0) O.water.geometry.computeVertexNormals();
    O.foam.material.opacity = .35 + .25 * Math.sin(tm * 1.6);
    O.clouds.forEach(function(c){ c.position.x += c.userData.sp * dt; if (c.position.x > 28) c.position.x = -12; });
    O.birds.forEach(function(bd){ var u = bd.userData; u.a += u.sp * dt; bd.position.set(17.4 + Math.cos(u.a) * u.r, u.y + Math.sin(u.a * 3) * .3, 17.4 + Math.sin(u.a) * u.r); bd.rotation.y = -u.a; var fl = Math.sin(tm * 9 + u.r) * .5; u.pl.rotation.z = fl; u.pr.rotation.z = -fl; bd.visible = sky.dk < .6; });
    if (O.beam) O.beam.pivot.rotation.y += dt * .9;
    O.anim.forEach(function(f){ f(tm, dt); });
  }
  O.boats.forEach(function(b){ b.g3.position.set(b.u, SEA + Math.sin(tm * 1.6 + b.lane) * .02, b.lane - b.u); b.g3.rotation.y = Math.PI / 4 + (b.s > 0 ? Math.PI : 0); b.g3.rotation.x = Math.sin(tm * 1.3 + b.lane) * .02; });
  if (O.tram){ O.tram.position.set(tram.u, LAND + .04, TRACK_SUM - tram.u); O.tram.rotation.y = Math.PI / 4 + (tram.s > 0 ? 0 : Math.PI); }
  if (O.flows) O.flows.forEach(function(f){ f.m.position.copy(f.c.getPoint((tm * .32 + f.o) % 1)); });
  // 選取的建築：光圈；探索過的：小旗
  if (state.sel && O.blds[state.sel]){ var sb = O.blds[state.sel]; O.ring.visible = true; O.ring.position.set(sb.t.gx, sb.base + .04, sb.t.gy); var s = 1 + Math.sin(tm * 4) * .06; O.ring.scale.set(sb.t.s * 2.2 * s, sb.t.s * 2.2 * s, 1); }
  else O.ring.visible = false;
  TOOLS.forEach(function(t){ O.blds[t.id].flag.visible = !!state.seen[t.id]; });
  syncAvatars(dt);
  camApply(dt);
  O.dome.position.copy(camera.position);
  fadeOccluders(dt);
  hideTrees();
  updateSky(false);
  soundTick(tm);
  renderer.render(scene, camera);
  placeLabels();
  zoneBanner(ts);
}
// 擋在鏡頭和自己之間的建築變半透明，走到高樓後面也看得到人
var ray3 = null, seg3 = null;
function fadeOccluders(dt){
  if (!ray3){ ray3 = new T3.Ray(); seg3 = new T3.Vector3(); }
  var me3 = O.avs.me.g.position, hit = new T3.Vector3();
  seg3.set(me3.x, me3.y + .3, me3.z);
  var len = camera.position.distanceTo(seg3);
  ray3.origin.copy(camera.position); ray3.direction.copy(seg3).sub(camera.position).normalize();
  TOOLS.forEach(function(t){
    var b = O.blds[t.id], block = !cam.overview && ray3.intersectBox(b.box, hit) && camera.position.distanceTo(hit) < len - .15;
    var want = block ? .22 : 1;
    if (Math.abs(b.fade - want) < .01) return;
    b.fade += (want - b.fade) * Math.min(1, dt * 8); if (Math.abs(b.fade - want) < .01) b.fade = want;
    b.mats.forEach(function(m){ var o = m.userData.op * b.fade; m.transparent = o < .999 || m.userData.op < 1; m.opacity = o; m.depthWrite = o > .9; m.needsUpdate = true; });
    b.g.traverse(function(m){ if (m.isMesh && !m.userData.ink) m.castShadow = b.fade > .9; });
    b.lines.forEach(function(l){ l.visible = b.fade > .6; });
  });
}
var ZERO_M = null;
function hideTrees(){
  if (!ZERO_M) ZERO_M = new T3.Matrix4().makeScale(0, 0, 0);
  var c = camera.position, me3 = O.avs.me.g.position, dx = me3.x - c.x, dz = me3.z - c.z, L2 = dx * dx + dz * dz, dirty = {};
  O.trees.forEach(function(t){
    var u = L2 ? ((t.gx - c.x) * dx + (t.gy - c.z) * dz) / L2 : 0, hide = false;
    if (!cam.overview && u > 0 && u < 1.02){
      var px = c.x + dx * u, pz = c.z + dz * u, py = c.y + (me3.y + .3 - c.y) * u;
      hide = Math.hypot(t.gx - px, t.gy - pz) < .42 && py < t.y + 1;
    }
    if (hide === t.hidden) return;
    t.hidden = hide;
    t.parts.forEach(function(pt){ pt[0].setMatrixAt(pt[1], hide ? ZERO_M : pt[2]); dirty[pt[0].uuid] = pt[0]; });
  });
  Object.keys(dirty).forEach(function(k){ dirty[k].instanceMatrix.needsUpdate = true; });
}
function zoneBanner(ts){
  var z = zoneAt(walker.gx, walker.gy), el2 = $('zoneBanner');
  if (z && z !== lastZone){
    el2.innerHTML = '<small>' + z.en + '</small><b style="color:' + z.color + '">' + z.name + '</b><span>' + z.desc + '</span>';
    el2.classList.add('show'); bannerT = ts;
  }
  lastZone = z;
  if (bannerT && ts - bannerT > 3600){ el2.classList.remove('show'); bannerT = 0; }
}

/* ---------- 載入與切換 ---------- */
function webglOK(){ try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch(e){ return false; } }
function build(){
  var small = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer = new T3.WebGLRenderer({canvas:canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.outputColorSpace = T3.SRGBColorSpace; renderer.toneMapping = T3.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
  scene = new T3.Scene(); scene.fog = new T3.Fog('#c6ecfa', 34, 95);
  O.dome = new T3.Mesh(new T3.SphereGeometry(160, 32, 16), new T3.ShaderMaterial({
    side:T3.BackSide, depthWrite:false, fog:false,
    uniforms:{top:{value:new T3.Color('#2f86e0')}, hor:{value:new T3.Color('#c6ecfa')}},
    vertexShader:'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.55)), 1.0);\n#include <colorspace_fragment>\n}'
  }));
  O.dome.renderOrder = -1; O.dome.raycast = noPick;
  scene.add(O.dome);
  camera = new T3.PerspectiveCamera(48, 1, .05, 220);
  hemi = new T3.HemisphereLight('#dff3ff', '#8a9a6a', 1); scene.add(hemi);
  sun = new T3.DirectionalLight('#fff4e0', 2.6); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  var sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70; sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scene.add(sun); scene.add(sun.target);
  raycaster = new T3.Raycaster(); ndc = new T3.Vector2(); V = new T3.Vector3();
  buildTerrain(); buildWater(); buildRoads(); TOOLS.forEach(buildBuilding); buildDecor(); buildZoneMarks(); buildTrees(); buildFlowers(); buildSkyStuff(); buildLabels(); buildFar();
  O.ring = new T3.Mesh(new T3.RingGeometry(.42, .5, 40), new T3.MeshBasicMaterial({color:'#ff6f59', transparent:true, opacity:.9, side:T3.DoubleSide, depthWrite:false}));
  O.ring.rotation.x = -Math.PI / 2; scene.add(O.ring);
  built = true;
  buildLinks();
  bindInput();
  cam.tx = walker.gx; cam.ty = LAND; cam.tz = walker.gy;
  if (world.clientWidth < world.clientHeight) cam.dist = 10.5;            // 手機直向畫面窄，鏡頭退後一點
  updateSky(true);
}
function load(){
  if (loading) return loading;
  loading = Promise.all([import(THREE_URL), document.fonts && document.fonts.ready]).then(function(r){ T3 = r[0]; build(); });   // 等字型好了，招牌字才不會用到備用字型
  return loading;
}
function enter(){
  active = true;
  world.classList.add('on');
  if (prefs.hint !== false) $('hint3d').hidden = false;
  if (!webglOK()){ fail('你的瀏覽器或裝置沒有開啟 WebGL，無法顯示立體小鎮。'); return; }
  $('load3d').hidden = built;
  load().then(function(){
    $('load3d').hidden = true;
    if (!active) return;
    resize(); lastT = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(frame);
    if (prefs.sound) startSound();
  }).catch(function(err){
    loading = null; fail('立體引擎載入失敗（需要網路連線）。');
    if (window.console) console.warn('[creator-town 3d]', err);
  });
}
function fail(msg){
  failed = true; $('load3d').hidden = false; $('load3d').querySelector('p').textContent = msg + '先帶你回到地圖。';
  setTimeout(function(){ $('load3d').hidden = true; $('load3d').querySelector('p').textContent = '小鎮正在立起來…'; if (state.view === '3d') setView('map'); }, 2600);
}
function leave(){
  active = false; cancelAnimationFrame(rafId); keys = {};
  world.classList.remove('on'); $('tip').classList.remove('show');
  stopSound();
}

$('tbSky').addEventListener('click', function(){
  var order = ['now', 'day', 'dusk', 'night'];
  prefs.sky = order[(order.indexOf(prefs.sky) + 1) % order.length]; lsSet(KEY_3D, prefs);
  if (built) updateSky(true); else this.innerHTML = '<span class="dot"></span>天色：' + SKY_LABEL[prefs.sky];
});
$('tbSound').addEventListener('click', function(){
  prefs.sound = !prefs.sound; lsSet(KEY_3D, prefs); this.setAttribute('aria-pressed', String(prefs.sound));
  if (prefs.sound) startSound(); else stopSound();
});
$('tbSound').setAttribute('aria-pressed', String(!!prefs.sound));
$('tbSky').innerHTML = '<span class="dot"></span>天色：' + SKY_LABEL[prefs.sky];
$('hint3dClose').addEventListener('click', function(){ $('hint3d').hidden = true; prefs.hint = false; lsSet(KEY_3D, prefs); });
document.addEventListener('visibilitychange', function(){ if (document.hidden) stopSound(); else if (active && prefs.sound) startSound(); });

/* ---------- 小地圖：立體裡隨時看全島、自己和其他訪客在哪；也能彈出成瀏覽器的子母畫面（PiP）視窗 ---------- */
var mini = {cv:$('miniCv'), on:prefs.mini !== false, pip:false, base:null, k:1, ox:0, oy:0};
function miniP(gx, gy){ var p = iso(gx, gy); return [mini.ox + p[0] * mini.k, mini.oy + p[1] * mini.k]; }
function miniSetup(){
  var W = mini.cv.width, H = mini.cv.height, xs = [], ys = [];
  for (var a = 0; a < Math.PI * 2; a += .1){ var rr = islandR(a) + .7, p = iso(C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr); xs.push(p[0]); ys.push(p[1]); }
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  mini.k = Math.min(W / (x1 - x0), H / (y1 - y0)) * .96;
  mini.ox = W / 2 - (x0 + x1) / 2 * mini.k; mini.oy = H / 2 - (y0 + y1) / 2 * mini.k;
  var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
  function path(list, close){ x.beginPath(); list.forEach(function(q, i){ var p = miniP(q[0], q[1]); if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); if (close) x.closePath(); }
  function circle(cx, cy, r){ var o = []; for (var i = 0; i < 40; i++){ var b = i / 40 * Math.PI * 2; o.push([cx + Math.cos(b) * r, cy + Math.sin(b) * r]); } return o; }
  var sea = x.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, '#6fd0e8'); sea.addColorStop(1, '#3a9fcc'); x.fillStyle = sea; x.fillRect(0, 0, W, H);
  var ring = [], beach = [];
  for (var i = 0; i < 96; i++){ var b = i / 96 * Math.PI * 2, r = islandR(b); ring.push([C[0] + Math.cos(b) * r, C[1] + Math.sin(b) * r]); beach.push([C[0] + Math.cos(b) * (r + .3), C[1] + Math.sin(b) * (r + .3)]); }
  path(beach, true); x.fillStyle = '#d6cfc0'; x.fill();
  path(ring, true); x.fillStyle = '#a6d47a'; x.fill();
  GREENS.forEach(function(G){ path(circle(G.at[0], G.at[1], G.r), true); x.fillStyle = '#7fd35e'; x.fill(); });
  HILLS.forEach(function(H2){ H2.layers.forEach(function(Ly, j){ path(circle(H2.at[0], H2.at[1], Ly[0]), true); x.fillStyle = j ? '#aee07f' : '#86c25c'; x.fill(); }); });
  ZONES.forEach(function(z){
    var b = z.box; path([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], true);
    if (z.id !== 'strategy'){ x.fillStyle = mix(z.color, '#ffffff', .5); x.fill(); }
    x.strokeStyle = z.color; x.lineWidth = 2; x.stroke();
  });
  x.lineCap = x.lineJoin = 'round';
  for (var s = 0; s + 48 < ROAD_S.length; s += 49){ path(ROAD_S.slice(s, s + 49)); x.strokeStyle = '#f5eedb'; x.lineWidth = 9 * mini.k * 1.4; x.stroke(); }
  path(RIVER_S.filter(inLand)); x.strokeStyle = '#3d97b3'; x.lineWidth = 27 * mini.k; x.stroke();
  path(TRACK); x.strokeStyle = '#6b5a48'; x.lineWidth = 6 * mini.k; x.stroke();
  WATERS.forEach(function(w){ path(circle(w.at[0], w.at[1], w.r), true); x.fillStyle = '#47c6e6'; x.fill(); });
  TOOLS.forEach(function(t){
    var e = t.s; path([[t.gx - e, t.gy - e], [t.gx + e, t.gy - e], [t.gx + e, t.gy + e], [t.gx - e, t.gy + e]], true);
    x.fillStyle = zoneById[t.zone].color; x.fill(); x.strokeStyle = INK; x.lineWidth = 1; x.stroke();
  });
  x.textAlign = 'center'; x.font = '400 19px Huninn, "Noto Sans TC", sans-serif'; x.lineJoin = 'round';
  ZONES.forEach(function(z){
    var p = miniP(z.cx, z.cy); x.lineWidth = 4; x.strokeStyle = mix(z.color, '#14303d', .55); x.strokeText(z.name, p[0], p[1] + 6); x.fillStyle = '#ffffff'; x.fillText(z.name, p[0], p[1] + 6);
  });
  mini.base = c;
}
function drawMini(){
  if (!((active && mini.on) || mini.pip)) return;
  if (!mini.base) miniSetup();
  var x = mini.cv.getContext('2d'), now = performance.now() / 1000;   // 畫布 560×336，顯示成 280×168（2 倍解析度，彈出子母畫面也清楚）
  x.drawImage(mini.base, 0, 0);
  var bp = miniP(BOARD_AT[0], BOARD_AT[1]), bob = Math.sin(now * 3) * 2;            // 看板：黃色標籤
  x.beginPath(); x.arc(bp[0], bp[1], 9 + Math.sin(now * 4) * 2, 0, Math.PI * 2); x.fillStyle = 'rgba(255,210,63,.45)'; x.fill();
  x.fillStyle = '#ffd23f'; x.strokeStyle = INK; x.lineWidth = 2; roundRect(x, bp[0] - 30, bp[1] - 44 + bob, 60, 26, 12); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(bp[0] - 5, bp[1] - 19 + bob); x.lineTo(bp[0], bp[1] - 11 + bob); x.lineTo(bp[0] + 5, bp[1] - 19 + bob); x.fill();
  x.fillStyle = INK; x.font = '700 15px "Noto Sans TC", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('📋 公布欄', bp[0], bp[1] - 31 + bob); x.textBaseline = 'alphabetic';
  if (state.sel && toolById[state.sel]){ var t = toolById[state.sel], sp = miniP(t.gx, t.gy); x.beginPath(); x.arc(sp[0], sp[1], 11 + Math.sin(now * 5) * 2, 0, Math.PI * 2); x.strokeStyle = '#ff6f59'; x.lineWidth = 3; x.stroke(); }
  if (active && !cam.overview){                                   // 鏡頭看的方向（扇形）
    var me0 = miniP(walker.gx, walker.gy), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    x.beginPath(); x.moveTo(me0[0], me0[1]);
    for (var a = -.55; a <= .56; a += .11){ var c = Math.cos(a), s = Math.sin(a), q = miniP(walker.gx + (fx * c - fz * s) * 4.5, walker.gy + (fx * s + fz * c) * 4.5); x.lineTo(q[0], q[1]); }
    x.closePath(); x.fillStyle = 'rgba(255,255,255,.35)'; x.fill();
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  Object.keys(PEERS).forEach(function(id){
    var p = PEERS[id], d = p.av.data || {}, q = miniP(p.gx, p.gy);
    x.beginPath(); x.arc(q[0], q[1], 9, 0, Math.PI * 2); x.fillStyle = d.shirt || '#ffffff'; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.stroke();
    x.font = '13px sans-serif'; x.fillText(animalOf(d, id).emoji, q[0], q[1] + 1);
  });
  var m = miniP(walker.gx, walker.gy), pulse = 17 + Math.sin(now * 4) * 3;
  x.beginPath(); x.arc(m[0], m[1], pulse, 0, Math.PI * 2); x.fillStyle = 'rgba(255,111,89,.28)'; x.fill();
  x.beginPath(); x.arc(m[0], m[1], 13, 0, Math.PI * 2); x.fillStyle = me.shirt; x.fill(); x.strokeStyle = '#ffffff'; x.lineWidth = 3; x.stroke();
  x.font = '19px sans-serif'; x.fillText(animalOf(me).emoji, m[0], m[1] + 1);
  x.font = '700 13px "Noto Sans TC", sans-serif'; x.lineWidth = 3; x.strokeStyle = '#14303d'; x.strokeText('你', m[0], m[1] - 24); x.fillStyle = '#ffffff'; x.fillText('你', m[0], m[1] - 24);
  x.textBaseline = 'alphabetic';
}
setInterval(drawMini, 80);
function setMini(on){
  mini.on = on; prefs.mini = on; lsSet(KEY_3D, prefs);
  $('mini3d').hidden = !on; $('tbMini').setAttribute('aria-pressed', String(on));
  if (on) drawMini();
}
mini.cv.addEventListener('click', function(e){                    // 點小地圖：走過去
  var r = mini.cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * mini.cv.width, py = (e.clientY - r.top) / r.height * mini.cv.height;
  var ix = (px - mini.ox) / mini.k, iy = (py - mini.oy) / mini.k, gx = (ix / HW + iy / HH) / 2, gy = (iy / HH - ix / HW) / 2;
  if (cam.overview) setOverview(false);
  walker.goal = null; walkTo(gx, gy);
});
$('miniClose').addEventListener('click', function(){ setMini(false); });
$('tbMini').addEventListener('click', function(){ setMini(!mini.on); });
// 子母畫面：把小地圖畫布變成影片串流，交給瀏覽器的 Picture-in-Picture 浮動視窗
var pipOK = !!(document.pictureInPictureEnabled && mini.cv.captureStream);
if (!pipOK) $('miniPip').hidden = true;
$('miniPip').addEventListener('click', function(){
  if (document.pictureInPictureElement){ document.exitPictureInPicture(); return; }
  var v = mini.video;
  if (!v){
    v = mini.video = document.createElement('video'); v.muted = true; v.playsInline = true;
    v.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    v.srcObject = mini.cv.captureStream(15);
    v.addEventListener('enterpictureinpicture', function(){ mini.pip = true; $('miniPip').textContent = '⧉ 收回'; });
    v.addEventListener('leavepictureinpicture', function(){ mini.pip = false; $('miniPip').textContent = '⧉ 子母畫面'; });
  }
  mini.pip = true; drawMini();
  v.play().then(function(){ return v.requestPictureInPicture(); }).catch(function(err){ mini.pip = false; if (window.console) console.warn('[startup-island pip]', err); });
});
setMini(mini.on);

window.Island3D = {
  enter:enter, leave:leave, links:buildLinks,
  overview:function(){ setOverview(!cam.overview); },
  get active(){ return active; }, get built(){ return built; }, cam:cam, prefs:prefs, O:O, mini:mini, board:function(){ if (O.boardDraw) O.boardDraw(); }, get renderer(){ return renderer; }
};
})();
