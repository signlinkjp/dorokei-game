// DOROKEI 3D renderer — 明るいポップな街・キャラ・牢屋・お宝・脱出ゲート
import * as THREE from '../vendor/three.module.js';
import { MAP, ROLE, looksLike } from './core.js';

const COL = {
  copBody: 0x2a55b8, // 紺に近い深い青のポリスユニフォーム
  copDark: 0x16264f, // 制帽・ズボンの濃紺
  thiefBody: 0x3b4157,
  thiefDark: 0x232634,
  bag: 0x34313c,
  skin: 0xf2c49c,
  mask: 0x14161d,
  gold: 0xffc63a,
  goldDark: 0xd89a12,
  red: 0xe8443f,
  beanie: 0xd8382f, // 泥棒の赤いニット帽
};

function makeSky() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3f8fdc');
  grad.addColorStop(0.34, '#74bdf2');
  grad.addColorStop(0.62, '#b9e2fb');
  grad.addColorStop(0.82, '#ffe9c4');
  grad.addColorStop(1, '#ffd9a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabel(text, color = '#ffffff', bg = 'rgba(10,16,30,0.78)', px = 62) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const r = 40;
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(r, 16);
  g.lineTo(512 - r, 16);
  g.quadraticCurveTo(496, 16, 496, 16 + r);
  g.lineTo(496, 240 - r);
  g.quadraticCurveTo(496, 240, 496 - r, 240);
  g.lineTo(r, 240);
  g.quadraticCurveTo(16, 240, 16, 240 - r);
  g.lineTo(16, 16 + r);
  g.quadraticCurveTo(16, 16, 16 + r, 16);
  g.fill();
  g.fillStyle = color;
  g.font = `bold ${px}px "Liberation Sans", "Helvetica Neue", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 130);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
}

/** 泥棒の黒×白ボーダー（横縞）テクスチャ */
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f5fa';
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = '#1d1f28';
  const bands = 5;
  const unit = 128 / (bands * 2 - 1);
  for (let i = 0; i < bands; i++) g.fillRect(0, i * unit * 2, 32, unit);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 中心が明るい光のスプライト用テクスチャ */
function glowTexture(inner = 'rgba(255,240,180,0.95)', outer = 'rgba(255,200,60,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, 'rgba(255,215,110,0.35)');
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** グループ内のマテリアルを重複なく集める（隠れ中の半透明化に使う） */
function collectMats(group) {
  const set = new Set();
  group.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) set.add(m);
  });
  return [...set];
}

const ROOF_TINT = {
  bank: 0xf2d491,
  jewelry: 0xff9fc0,
  museum: 0xa9c8f0,
  station: 0x86b0e6,
  warehouse: 0xaab6c6,
  apartment: 0x8fd0a8,
  house: 0xf0a48c,
  cafe: 0xf5b26a,
  shop: 0xf7cf7a,
  office: 0x7fa8e0,
  kiosk: 0xffd24d,
  pavilion: 0xc0392b,
  wall: 0xcbbf9e,
  police: 0x2f6fd8,
};

/**
 * 牢屋（警察署の中庭）の床テクスチャ。
 * 白いタイル＋青い目地で「警察署の中」らしく、中央に JAIL の文字を入れて
 * 上から見ても牢屋だとひと目で分かるようにする。
 */
function jailFloorTexture() {
  const W = 512;
  const H = 410;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // 下地（明るい白青）
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#ffffff');
  base.addColorStop(1, '#e8f1fc');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // タイル目地
  g.strokeStyle = 'rgba(120,160,215,0.35)';
  g.lineWidth = 2;
  const tile = 64;
  for (let x = 0; x <= W; x += tile) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += tile) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  // 外周の青い帯
  g.strokeStyle = '#2f6fd8';
  g.lineWidth = 12;
  g.strokeRect(6, 6, W - 12, H - 12);
  // 中央の JAIL
  g.fillStyle = 'rgba(47,111,216,0.30)';
  g.font = 'bold 112px "Liberation Sans", "Helvetica Neue", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('JAIL', W / 2, H / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = makeSky();
    this.scene.fog = new THREE.Fog(0xd9ecff, 95, 210);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
    this.camera.position.set(-20, 26, 60);
    this.view = 'follow';
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.t = 0;
    this.game = null;

    this.characterRoot = new THREE.Group();
    this.treasureRoot = new THREE.Group();
    this.pingRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.scene.add(this.characterRoot, this.treasureRoot, this.pingRoot, this.fxRoot);

    this.chars = new Map();
    this.treasureMeshes = [];
    this.pingMeshes = [];
    this.searchMeshes = [];
    this.charFocus = { x: 0, z: 20 };
    this.playerRing = null;
    // 牢屋・拘束中の俯瞰カメラ（スティックで街を見渡せる）
    this.lookPan = { x: MAP.jail.x, z: MAP.jail.z };
    this._inJailView = false;

    this.buildLights();
    this.buildGround();
    this.buildBuildings();
    this.buildCars();
    this.buildJail();
    this.buildGate();
    this.buildTrees();
    this.buildBushes();
    this.buildProps();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9fc6a8, 1.15));
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.55);
    sun.position.set(38, 60, 24);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.55);
    fill.position.set(-40, 26, -30);
    this.scene.add(fill);

    // 太陽の光暈
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: (() => {
          const c = document.createElement('canvas');
          c.width = c.height = 128;
          const g = c.getContext('2d');
          const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
          grad.addColorStop(0, 'rgba(255,250,220,0.95)');
          grad.addColorStop(0.5, 'rgba(255,232,170,0.35)');
          grad.addColorStop(1, 'rgba(255,232,170,0)');
          g.fillStyle = grad;
          g.fillRect(0, 0, 128, 128);
          return new THREE.CanvasTexture(c);
        })(),
        transparent: true,
        depthWrite: false,
      }),
    );
    glow.scale.set(90, 90, 1);
    glow.position.set(90, 110, -120);
    this.scene.add(glow);
  }

  buildGround() {
    const b = MAP.bounds;
    const W = 340;
    const D = 340;
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.6, D),
      new THREE.MeshLambertMaterial({ color: 0x74c96a }),
    );
    ground.position.y = -0.3;
    this.scene.add(ground);

    // 街の外周（生け垣）で世界の端を分かりやすくする
    const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4a });
    const edge = 2.6;
    for (const [x, z, w, d] of [
      [0, b.minZ - edge, b.maxX - b.minX + edge * 2, edge],
      [0, b.maxZ + edge, b.maxX - b.minX + edge * 2, edge],
      [b.minX - edge, 0, edge, b.maxZ - b.minZ],
      [b.maxX + edge, 0, edge, b.maxZ - b.minZ],
    ]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), hedgeMat);
      h.position.set(x, 0.8, z);
      this.scene.add(h);
    }

    // 道路
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xa7b6c8 });
    const curbMat = new THREE.MeshLambertMaterial({ color: 0xc9d4e2 });
    for (const r of MAP.roads) {
      const curb = new THREE.Mesh(new THREE.PlaneGeometry(r.w + 2.2, r.d + 2.2), curbMat);
      curb.rotation.x = -Math.PI / 2;
      curb.position.set(r.x, 0.015, r.z);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(r.x, 0.03, r.z);
      this.scene.add(curb, road);
    }

    // 中央線（白い破線）と横断歩道はインスタンスでまとめて描く
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xf7fbff,
      transparent: true,
      opacity: 0.75,
    });
    const flat = new THREE.Matrix4();
    const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const unit = new THREE.Vector3(1, 1, 1);
    const marks = [];
    for (let x = -74; x <= 74; x += 8) {
      for (const z of [0, -45, 45]) marks.push({ x: x + 2, z, w: 3.6, d: 0.45 });
    }
    for (let z = -74; z <= 74; z += 8) {
      for (const x of [0, -45, 45]) marks.push({ x, z: z + 2, w: 0.45, d: 3.6 });
    }
    for (const cx of [-45, 0, 45]) {
      for (const cz of [-45, 0, 45]) {
        for (let i = 0; i < 6; i++) {
          for (const side of [-1, 1]) {
            marks.push({ x: cx - 3 + i * 1.2, z: cz + side * 7.6, w: 0.7, d: 3.2 });
            marks.push({ x: cx + side * 7.6, z: cz - 3 + i * 1.2, w: 3.2, d: 0.7 });
          }
        }
      }
    }
    const markGeo = new THREE.PlaneGeometry(1, 1);
    const markMesh = new THREE.InstancedMesh(markGeo, lineMat, marks.length);
    marks.forEach((mk, i) => {
      flat.compose(
        new THREE.Vector3(mk.x, 0.04, mk.z),
        rotX,
        new THREE.Vector3(mk.w, mk.d, 1),
      );
      markMesh.setMatrixAt(i, flat);
    });
    markMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(markMesh);

    // 芝・公園・広場
    const patchMat = new THREE.MeshLambertMaterial({ color: 0x63bd5f });
    for (const p of [
      { x: -22, z: 22, r: 17 },
      { x: -62, z: -46, r: 6 },
      { x: 62, z: -46, r: 6 },
      { x: 62, z: -30, r: 6 },
      { x: -22, z: -16, r: 8 },
      { x: 18, z: -50, r: 5 },
    ]) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(p.r, 26), patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(p.x, 0.05, p.z);
      this.scene.add(patch);
    }

    // 公園の池
    for (const p of MAP.ponds) {
      const pond = new THREE.Mesh(
        new THREE.CircleGeometry(p.r, 30),
        new THREE.MeshLambertMaterial({ color: 0x6fc9e8 }),
      );
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(p.x, 0.06, p.z);
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(p.r, p.r + 0.7, 30),
        new THREE.MeshLambertMaterial({ color: 0xd9c9a3 }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(p.x, 0.055, p.z);
      this.scene.add(pond, rim);
    }

    // 駐車場の白線
    const pLine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 12), pLine);
      l.rotation.x = -Math.PI / 2;
      l.position.set(-40 + i * 4, 0.05, -62);
      this.scene.add(l);
    }

    // 脱出ゲート前の広場
    const gzone = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP.gate.w + 6, MAP.gate.d + 4),
      new THREE.MeshLambertMaterial({ color: 0x9fb0c6 }),
    );
    gzone.rotation.x = -Math.PI / 2;
    gzone.position.set(MAP.gate.x, 0.05, MAP.gate.z);
    this.scene.add(gzone);
  }

  buildBuildings() {
    const windowMats = [];
    for (const o of MAP.obstacles) {
      if (o.kind === 'car') continue;
      const mat = new THREE.MeshLambertMaterial({ color: o.color });
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat);
      box.position.set(o.x, o.h / 2, o.z);
      this.scene.add(box);

      const roofColor = ROOF_TINT[o.kind] ?? o.color;
      const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.8, 0.55, o.d + 0.8), roofMat);
      roof.position.set(o.x, o.h + 0.27, o.z);
      this.scene.add(roof);

      // 屋上の小物（ポップなアクセント）
      if (o.kind !== 'pavilion' && o.h > 4) {
        const acMat = new THREE.MeshLambertMaterial({ color: 0xdfe6ef });
        const ac = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 1.3), acMat);
        ac.position.set(o.x + o.w / 4, o.h + 0.9, o.z - o.d / 4);
        this.scene.add(ac);
      }
      if (o.kind === 'pavilion') {
        // あずまやの屋根（赤い三角）
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(o.w, o.d) * 0.78, 2.2, 4),
          new THREE.MeshLambertMaterial({ color: COL.red }),
        );
        cone.position.set(o.x, o.h + 1.3, o.z);
        cone.rotation.y = Math.PI / 4;
        this.scene.add(cone);
        continue;
      }
      if (o.kind === 'wall') continue;

      // 窓（インスタンスでまとめて描く）
      const cols = Math.max(2, Math.floor(o.w / 3));
      const rows = Math.max(1, Math.floor(o.h / 2.6));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = o.x - o.w / 2 + ((c + 0.5) * o.w) / cols;
          const y = 1.6 + r * 2.2;
          windowMats.push({ x, y, z: o.z + o.d / 2 + 0.03, ry: 0 });
          windowMats.push({ x, y, z: o.z - o.d / 2 - 0.03, ry: Math.PI });
          windowMats.push({ x: o.x + o.w / 2 + 0.03, y, z: o.z - o.d / 2 + ((c + 0.5) * o.d) / cols, ry: Math.PI / 2 });
          windowMats.push({ x: o.x - o.w / 2 - 0.03, y, z: o.z - o.d / 2 + ((c + 0.5) * o.d) / cols, ry: -Math.PI / 2 });
        }
      }

      if (o.sign && o.w >= 8) {
        // 街の景観に馴染ませた控えめなラベル（ステージ名との役割分担）
        const label = new THREE.Sprite(makeLabel(o.sign, '#f2f6ff', 'rgba(22,40,70,0.52)', 52));
        label.scale.set(Math.min(2.4, o.w * 0.2), Math.min(1.2, o.w * 0.1), 1);
        label.position.set(o.x, o.h + 0.75, o.z + o.d / 2 + 0.2);
        label.material.opacity = 0.82;
        this.scene.add(label);
      }
    }

    // 建物の接地影（ポップな見た目でも立体感が出る）
    const shadowRects = MAP.obstacles.filter((o) => o.kind !== 'car' && o.h > 1.5);
    if (shadowRects.length) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0x2c6b3c, transparent: true, opacity: 0.14 });
      const inst = new THREE.InstancedMesh(geo, mat, shadowRects.length);
      const m2 = new THREE.Matrix4();
      const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      shadowRects.forEach((o, i) => {
        m2.compose(
          new THREE.Vector3(o.x + 2.2, 0.035, o.z + 2.6),
          q2,
          new THREE.Vector3(o.w + 2.4, o.d + 2.4, 1),
        );
        inst.setMatrixAt(i, m2);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
    }

    // 窓をひとつの InstancedMesh に
    if (windowMats.length) {
      const geo = new THREE.PlaneGeometry(1.15, 0.9);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff3c8 });
      const inst = new THREE.InstancedMesh(geo, mat, windowMats.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      const v = new THREE.Vector3();
      windowMats.forEach((w, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.ry);
        v.set(w.x, w.y, w.z);
        m.compose(v, q, s);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.scene.add(inst);
    }
  }

  buildCars() {
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x22262f });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
    for (const o of MAP.obstacles) {
      if (o.kind !== 'car') continue;
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(o.w, 0.8, o.d),
        new THREE.MeshLambertMaterial({ color: o.color }),
      );
      body.position.y = 0.62;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.5, 0.55, o.d * 0.86), glassMat);
      cabin.position.set(0, 1.28, 0);
      for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 8), wheelMat);
          w.rotation.x = Math.PI / 2;
          w.position.set((dx * o.w) / 2.6, 0.28, (dz * o.d) / 2.5);
          g.add(w);
        }
      }
      g.add(body, cabin);
      if (o.color === 0xf0f2f7 || o.color === 0x2a3242) {
        // パトカー: 赤と青のランプ
        const lampR = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.22, 0.42),
          new THREE.MeshBasicMaterial({ color: COL.red }),
        );
        lampR.position.set(-0.35, 1.66, 0);
        const lampB = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.22, 0.42),
          new THREE.MeshBasicMaterial({ color: 0x2f6fd8 }),
        );
        lampB.position.set(0.35, 1.66, 0);
        g.add(lampR, lampB);
      }
      g.position.set(o.x, 0, o.z);
      this.scene.add(g);
    }
  }

  /**
   * 警察署＋牢屋（Build 3）
   * 牢屋は警察署の中庭として一体化：明るい白い床＋タイル目地、白壁＋青い帯、
   * ぐるりと囲む屋根（中央は吹き抜け）、投光照明、入口のゲートと看板。
   * 上から見ると「警察署の中の牢屋」がひと目で分かり、中の様子も明るく見える。
   */
  buildJail() {
    const jail = MAP.jail;

    // ---- 明るい牢屋の床（タイル＋JAILの文字） ----
    const floorTex = jailFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(jail.w, 0.2, jail.d),
      new THREE.MeshLambertMaterial({
        map: floorTex,
        color: 0xffffff,
        emissive: 0x8fb6e0,
        emissiveIntensity: 0.22,
      }),
    );
    floor.position.set(jail.x, 0.1, jail.z);
    this.scene.add(floor);

    // 床の明かり（牢屋の中を明るく照らす）
    this.jailLight = new THREE.PointLight(0xfff6e2, 2.6, 40, 1.5);
    this.jailLight.position.set(jail.x, 8.5, jail.z);
    this.scene.add(this.jailLight);
    const jailFill = new THREE.PointLight(0xdff0ff, 1.4, 30, 1.6);
    jailFill.position.set(jail.x, 5.5, jail.z + 5);
    this.scene.add(jailFill);

    // ---- 壁（白い警察署の壁＋青い帯） ----
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xf2f6fc });
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x2f6fd8 });
    for (const w of MAP.jailWalls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wallMat);
      m.position.set(w.x, w.h / 2, w.z);
      this.scene.add(m);
      // 外側に青い帯（警察署らしい見た目）
      const alongX = w.w > w.d;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? w.w + 0.06 : w.w + 0.12, 0.5, alongX ? w.d + 0.12 : w.d + 0.06),
        stripeMat,
      );
      stripe.position.set(w.x, w.h - 0.55, w.z);
      this.scene.add(stripe);
    }

    // ---- 屋根（中央が吹き抜けの「口」の字）で警察署の建物らしく ----
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3b5f9e });
    const roofEdge = new THREE.MeshLambertMaterial({ color: 0x27406f });
    const ring = 2.4;
    const roofY = 4.35;
    const pieces = [
      { x: jail.x, z: jail.z + jail.d / 2 - ring / 2, w: jail.w + 1.6, d: ring },
      { x: jail.x, z: jail.z - jail.d / 2 + ring / 2, w: jail.w + 1.6, d: ring },
      { x: jail.x - jail.w / 2 + ring / 2, z: jail.z, w: ring, d: jail.d + 1.6 - ring * 2 },
      { x: jail.x + jail.w / 2 - ring / 2, z: jail.z, w: ring, d: jail.d + 1.6 - ring * 2 },
    ];
    for (const p of pieces) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.45, p.d), roofMat);
      slab.position.set(p.x, roofY, p.z);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, 0.16, p.d + 0.3), roofEdge);
      lip.position.set(p.x, roofY + 0.3, p.z);
      this.scene.add(slab, lip);
    }
    // 屋上の小物（空調）
    for (const dx of [-6, 0, 6]) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.8, 1.1),
        new THREE.MeshLambertMaterial({ color: 0xdde6f2 }),
      );
      ac.position.set(jail.x + dx, roofY + 0.75, jail.z + jail.d / 2 - ring / 2);
      this.scene.add(ac);
    }

    // ---- 鉄格子（壁の上に立ち上がる） ----
    const barMat = new THREE.MeshLambertMaterial({ color: 0x39414f });
    const barGeo = new THREE.BoxGeometry(0.16, 1.5, 0.16);
    const bars = [];
    const addBars = (x0, z0, x1, z1, count) => {
      for (let i = 0; i <= count; i++) {
        const k = i / count;
        bars.push({ x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k });
      }
    };
    addBars(jail.x - 9, jail.z + 7.6, jail.x + 9, jail.z + 7.6, 12);
    addBars(jail.x - 9.6, jail.z - 7.6, jail.x - 9.6, jail.z + 7.6, 10);
    addBars(jail.x + 9.6, jail.z - 7.6, jail.x + 9.6, jail.z + 7.6, 10);
    const inst = new THREE.InstancedMesh(barGeo, barMat, bars.length);
    const m = new THREE.Matrix4();
    bars.forEach((b, i) => {
      m.makeTranslation(b.x, 3.95, b.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);

    // ---- 入口（ゲート）と看板 ----
    const door = MAP.jailDoor;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 4.2, 0.55),
        new THREE.MeshLambertMaterial({ color: 0x2f6fd8 }),
      );
      post.position.set(jail.x + side * 3.1, 2.1, door.z);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff2b8 }),
      );
      lamp.position.set(jail.x + side * 3.1, 4.4, door.z);
      this.scene.add(post, lamp);
    }
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.5, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x27406f }),
    );
    hood.position.set(jail.x, 4.5, door.z);
    this.scene.add(hood);

    const sign = new THREE.Sprite(makeLabel('POLICE', '#ffffff', 'rgba(28,74,160,0.96)', 68));
    sign.scale.set(9, 4.5, 1);
    sign.position.set(jail.x, 6.6, door.z - 1.4);
    this.scene.add(sign);
    const jailSign = new THREE.Sprite(makeLabel('JAIL', '#1b3f8f', 'rgba(255,255,255,0.95)', 74));
    jailSign.scale.set(4.6, 2.3, 1);
    jailSign.position.set(jail.x, 3.0, jail.z - 7.9);
    this.scene.add(jailSign);

    // ---- 投光照明（四隅）で牢屋の中を明るく ----
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x8f9db3 });
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const px = jail.x + dx * (jail.w / 2 + 1.4);
      const pz = jail.z + dz * (jail.d / 2 + 1.4);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 5.4, 8), poleMat);
      pole.position.set(px, 2.7, pz);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.32, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xfff8dc }),
      );
      head.position.set(px - dx * 0.5, 5.45, pz - dz * 0.35);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture('rgba(255,250,225,0.85)', 'rgba(255,240,180,0)'),
          transparent: true,
          depthWrite: false,
          opacity: 0.6,
        }),
      );
      halo.scale.set(3.4, 3.4, 1);
      halo.position.set(px - dx * 0.5, 5.45, pz - dz * 0.35);
      this.scene.add(pole, head, halo);
    }

    // ---- 牢屋の中のベンチ（収容された泥棒の目印） ----
    const benchMat = new THREE.MeshLambertMaterial({ color: 0xb98a5c });
    for (const s of [
      { x: -68, z: 58 },
      { x: -62, z: 58 },
      { x: -56, z: 58 },
      { x: -68, z: 65 },
      { x: -62, z: 65 },
      { x: -56, z: 65 },
    ]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.7), benchMat);
      seat.position.set(s.x, 0.55, s.z);
      this.scene.add(seat);
    }
  }

  buildGate() {
    const g = MAP.gate;
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2f6fd8 });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.4, 1.1), frameMat);
      pillar.position.set(g.x + side * (g.w / 2 + 0.5), 2.7, g.z);
      this.scene.add(pillar);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 14, 10),
        new THREE.MeshBasicMaterial({ color: COL.gold }),
      );
      cap.position.set(g.x + side * (g.w / 2 + 0.5), 5.7, g.z);
      this.scene.add(cap);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(g.w + 3.2, 0.9, 1.2),
      new THREE.MeshLambertMaterial({ color: COL.red }),
    );
    beam.position.set(g.x, 5.6, g.z);
    this.scene.add(beam);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(g.w, 5),
      new THREE.MeshBasicMaterial({
        color: 0x9dffc8,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
      }),
    );
    glow.position.set(g.x, 2.7, g.z);
    this.scene.add(glow);
    this.gateGlow = glow;

    this.gateRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.16, 8, 30),
      new THREE.MeshBasicMaterial({ color: 0xc9ffe2 }),
    );
    this.gateRing.position.set(g.x, 2.9, g.z);
    this.scene.add(this.gateRing);

    const sign = new THREE.Sprite(makeLabel('EXIT', '#d6ffe8', 'rgba(20,110,70,0.95)', 72));
    sign.scale.set(7, 3.5, 1);
    sign.position.set(g.x, 7.6, g.z);
    this.scene.add(sign);

    // ゴールドの地面サークル
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(g.w / 2 - 0.4, g.w / 2, 34),
      new THREE.MeshBasicMaterial({ color: COL.gold, transparent: true, opacity: 0.55 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(g.x, 0.07, g.z);
    this.scene.add(ring);
  }

  buildTrees() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6240 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e57 });
    const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x63c46f });
    const n = MAP.trees.length;
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.26, 0.34, 1.8, 6),
      trunkMat,
      n,
    );
    const leaf1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 2.4, 8), leafMat, n);
    const leaf2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 2.0, 8), leafMat2, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    MAP.trees.forEach((t, i) => {
      s.set(t.s, t.s, t.s);
      q.identity();
      m.compose(new THREE.Vector3(t.x, 0.9 * t.s, t.z), q, s);
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, 2.5 * t.s, t.z), q, s);
      leaf1.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, 3.7 * t.s, t.z), q, s);
      leaf2.setMatrixAt(i, m);
    });
    [trunk, leaf1, leaf2].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    });
  }

  buildBushes() {
    // 茂み（隠れ場所）: 半透明になる緑の塊＋足元のリング
    this.bushMeshes = [];
    this.bushMats = [];
    for (const b of MAP.bushes) {
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0x2f8f4a, transparent: true });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r * 0.72, 0), mat);
        blob.position.set(Math.cos(a) * b.r * 0.42, b.r * 0.62, Math.sin(a) * b.r * 0.42);
        blob.scale.y = 0.8;
        g.add(blob);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(b.r * 0.92, b.r * 1.02, 24),
        new THREE.MeshBasicMaterial({ color: 0x9dfbb0, transparent: true, opacity: 0.35 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      g.add(ring);
      g.position.set(b.x, 0, b.z);
      this.scene.add(g);
      this.bushMeshes.push(g);
      this.bushMats.push({ mat, ring: ring.material });
    }
  }

  buildProps() {
    // 街灯（インスタンス）
    const pts = [];
    for (const z of [-45, 0, 45]) {
      for (let x = -70; x <= 70; x += 20) pts.push({ x: x + 3.5, z: z + (z === 0 ? 7.6 : 6.6) });
      for (let x = -70; x <= 70; x += 20) pts.push({ x: x + 3.5, z: z - (z === 0 ? 7.6 : 6.6) });
    }
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x54607a });
    const pole = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6),
      poleMat,
      pts.length,
    );
    const bulb = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.8, 0.3, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xfff4c8 }),
      pts.length,
    );
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, 2.6, p.z);
      pole.setMatrixAt(i, m);
      m.makeTranslation(p.x, 5.3, p.z);
      bulb.setMatrixAt(i, m);
    });
    pole.instanceMatrix.needsUpdate = true;
    bulb.instanceMatrix.needsUpdate = true;
    this.scene.add(pole, bulb);

    // ベンチ
    const benchMat = new THREE.MeshLambertMaterial({ color: 0xa87448 });
    for (const p of [
      { x: -18, z: 26 }, { x: -26, z: 14 }, { x: -14, z: 20 },
      { x: 8, z: -30 }, { x: 62, z: -40 }, { x: -62, z: -40 },
    ]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.7), benchMat);
      seat.position.set(p.x, 0.6, p.z);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.16), benchMat);
      back.position.set(p.x, 0.95, p.z - 0.28);
      this.scene.add(seat, back);
    }

    // 街路樹のプランター（広場の彩り）
    const planterMat = new THREE.MeshLambertMaterial({ color: 0xe7d7b4 });
    for (const p of [
      { x: -62, z: -47 }, { x: 62, z: -47 }, { x: 0, z: 62 }, { x: -22, z: -18 },
    ]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 10), planterMat);
      pot.position.set(p.x, 0.35, p.z);
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 8, 6),
        new THREE.MeshLambertMaterial({ color: COL.red }),
      );
      flower.position.set(p.x, 1.15, p.z);
      this.scene.add(pot, flower);
    }
  }

  // ---- キャラクター -------------------------------------------------------
  setGame(game) {
    this.game = game;
    this.chars.clear();
    while (this.characterRoot.children.length) {
      const c = this.characterRoot.children.pop();
      c.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose?.();
      });
    }
    this.treasureRoot.clear();
    this.pingRoot.clear();
    this.fxRoot.clear();
    this.pingMeshes = [];
    this.searchMeshes = [];
    this.treasureMeshes = [];

    for (const a of game.agents) this.chars.set(a.id, this.buildCharacter(a));
    for (const t of game.treasures) {
      const mesh = this.buildTreasure();
      mesh.userData.id = t.id;
      this.treasureRoot.add(mesh);
      this.treasureMeshes.push(mesh);
    }
  }

  /**
   * キャラクター（Build 2 の世界基準ルック）
   *  警察 = 紺のポリスユニフォーム＋金バッジ＋つば付き制帽＋赤青のパトライト
   *  泥棒 = 黒×白のボーダー＋目出しマスク＋赤いニット帽＋背中のお宝袋
   * シルエット（制帽のつば／ニット帽の丸み＋袋）と色（紺／ボーダー＋赤）で
   * 遠目でも一発で見分けられることを優先している。
   */
  buildCharacter(a) {
    const isCop = looksLike(a.role) === 'cop';
    const g = new THREE.Group();
    const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
    const flat = (color) => new THREE.MeshBasicMaterial({ color });
    const parts = {};

    const skinMat = mat(COL.skin);
    const shoeMat = mat(0x191b23);

    // ---- 脚（股関節を軸に振る） ----
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.15, 0.66, 0);
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.54, 0.24),
        mat(isCop ? 0x16234a : 0x22252f),
      );
      leg.position.y = -0.27;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.34), shoeMat);
      shoe.position.set(0, -0.6, 0.05);
      hip.add(leg, shoe);
      g.add(hip);
      parts[side < 0 ? 'legL' : 'legR'] = hip;
    }

    // ---- 胴体 ----
    const torsoMat = isCop
      ? mat(COL.copBody)
      : new THREE.MeshLambertMaterial({ map: stripeTexture() });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.58, 0.36), torsoMat);
    torso.position.y = 0.95;
    g.add(torso);

    // 首
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), skinMat);
    neck.position.y = 1.27;
    g.add(neck);

    // 頭
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skinMat);
    head.position.y = 1.47;
    g.add(head);

    // 目（警官・泥棒とも、正面から表情が分かるように）
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), flat(0xffffff));
      eye.position.set(side * 0.09, 1.53, 0.195);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.02), flat(0x14161d));
      pupil.position.set(side * 0.09, 1.53, 0.21);
      g.add(eye, pupil);
    }

    // ---- 腕（肩を軸に振る） ----
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.36, 1.18, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.16), torsoMat);
      arm.position.y = -0.23;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.14), skinMat);
      hand.position.y = -0.47;
      shoulder.add(arm, hand);
      g.add(shoulder);
      parts[side < 0 ? 'armL' : 'armR'] = shoulder;
    }

    if (isCop) {
      // 胸のシャツ（明るい青）＋反射帯
      const shirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.26, 0.03),
        mat(0x7fb0f0, { emissive: 0x0b1f4a, emissiveIntensity: 0.3 }),
      );
      shirt.position.set(0, 1.09, 0.185);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.05, 0.38),
        flat(0xd8e8ff),
      );
      band.position.y = 1.18;
      // ベルト＋金のバックル
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.1, 0.39), mat(0x141824));
      belt.position.y = 0.73;
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.04), flat(COL.gold));
      buckle.position.set(0, 0.73, 0.2);
      // 肩章（金）
      for (const side of [-1, 1]) {
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.19), flat(COL.gold));
        ep.position.set(side * 0.26, 1.265, 0);
        g.add(ep);
      }
      // 胸の金バッジ
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 6), flat(COL.gold));
      badge.rotation.x = Math.PI / 2;
      badge.position.set(-0.14, 1.1, 0.2);
      g.add(shirt, band, belt, buckle, badge);

      // 制帽：クラウン＋天板＋つば＋金帯＋帽章
      const capCrown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.27, 0.17, 18),
        mat(COL.copDark),
      );
      capCrown.position.y = 1.75;
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.27, 0.05, 18), mat(COL.copDark));
      capTop.position.y = 1.855;
      const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.272, 0.045, 18), flat(COL.gold));
      capBand.position.y = 1.685;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.26), mat(0x0d1730));
      visor.position.set(0, 1.655, 0.245);
      visor.rotation.x = 0.24;
      const capBadge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), flat(COL.gold));
      capBadge.position.set(0, 1.755, 0.25);
      g.add(capCrown, capTop, capBand, visor, capBadge);

      // パトランプ（赤・青）— 常に点滅
      const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), flat(COL.red));
      lampR.position.set(-0.11, 1.915, 0);
      const lampB = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), flat(0x4cc2ff));
      lampB.position.set(0.11, 1.915, 0);
      g.add(lampR, lampB);
      parts.lampR = lampR;
      parts.lampB = lampB;
    } else {
      // 黒×白ボーダーの胴に、黒のベルト
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.1, 0.39), mat(0x14161d));
      belt.position.y = 0.73;
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.1), mat(0x3a3742));
      pouch.position.set(0.22, 0.7, 0.2);
      g.add(belt, pouch);

      // 目出しマスク（黒）— 目の白はマスクの上に重ねる
      const mask = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.4), mat(COL.mask));
      mask.position.y = 1.535;
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), flat(0xffffff));
        eye.position.set(side * 0.09, 1.535, 0.205);
        const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), flat(0x11131a));
        pupil.position.set(side * 0.09, 1.535, 0.22);
        g.add(eye, pupil);
      }
      g.add(mask);

      // 赤いニット帽（白い折り返し＋ポンポン）
      const beanie = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.235, 0.17, 16), mat(COL.beanie));
      beanie.position.y = 1.75;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 16), mat(0xf1f3f8));
      brim.position.y = 1.68;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0xf1f3f8));
      pom.position.y = 1.87;
      g.add(beanie, brim, pom);

      // 背中のお宝袋（唐草風の紐＋金貨）
      const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat(0x34313c));
      sack.scale.set(1, 1.12, 0.85);
      sack.position.set(0, 0.98, -0.34);
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 8), flat(COL.gold));
      tie.position.set(0, 1.24, -0.34);
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), flat(COL.gold));
      coin.rotation.x = Math.PI / 2;
      coin.position.set(0.16, 0.95, -0.5);
      g.add(sack, tie, coin);
    }

    // ---- お宝を運搬中は背中に光る宝箱 ----
    const carry = new THREE.Group();
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.36, 0.3),
      new THREE.MeshLambertMaterial({
        color: COL.gold,
        emissive: 0x8a5200,
        emissiveIntensity: 0.7,
      }),
    );
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.09, 0.33),
      new THREE.MeshLambertMaterial({ color: COL.goldDark, emissive: 0x5a3500, emissiveIntensity: 0.6 }),
    );
    lid.position.y = 0.22;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,214,90,0.95)', 'rgba(255,190,40,0)'),
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      }),
    );
    glow.scale.set(1.15, 1.15, 1);
    glow.material.blending = THREE.AdditiveBlending;
    carry.add(chest, lid, glow);
    carry.position.set(0, 1.1, -0.46);
    carry.visible = false;
    g.add(carry);

    // 足元の影
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 18),
      new THREE.MeshBasicMaterial({ color: 0x0d1a10, transparent: true, opacity: 0.2 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.07;

    // 正体発覚マーク
    const alert = new THREE.Sprite(makeLabel('!', '#ffffff', 'rgba(214,40,40,0.96)', 120));
    alert.scale.set(1.4, 1.4, 1);
    alert.position.set(0, 2.5, 0);
    alert.visible = false;

    g.add(shadow, alert);

    g.userData = {
      parts,
      carry,
      alert,
      look: isCop ? 'cop' : 'thief',
      mats: collectMats(g),
    };
    g.position.set(a.x, 0, a.z);
    this.characterRoot.add(g);
    return g;
  }

  buildTreasure() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshLambertMaterial({ color: COL.gold, emissive: 0x8a5c00, emissiveIntensity: 0.4 }),
    );
    box.position.y = 0.6;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.16, 0.86),
      new THREE.MeshLambertMaterial({ color: COL.goldDark }),
    );
    lid.position.y = 1.02;
    const spark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0 }),
    );
    spark.position.y = 1.6;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe58a, transparent: true, opacity: 0.45 }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.08;
    g.add(box, lid, spark, halo);
    g.userData.spark = spark;
    return g;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setView(v) {
    this.view = v;
  }

  toggleView() {
    this.view = this.view === 'follow' ? 'top' : 'follow';
    return this.view;
  }

  update(game, dt) {
    if (game !== this.game) this.setGame(game);
    this.t += dt;

    // 俯瞰（マップ全体）ではフォグを切って街の色をそのまま見せる
    const playerNow = game.player;
    const jailView =
      !!playerNow && (playerNow.state === 'jailed' || playerNow.state === 'detained');
    if (jailView && !this._inJailView) {
      // 牢屋に入った瞬間は牢屋の真上から見始める
      this.centerJailView();
      this.snapCamera();
    }
    this._inJailView = jailView;
    if (this.view === 'map') {
      this.scene.fog.near = 420;
      this.scene.fog.far = 900;
    } else if (jailView) {
      this.scene.fog.near = 120;
      this.scene.fog.far = 320;
    } else {
      this.scene.fog.near = 95;
      this.scene.fog.far = 215;
    }

    const player = game.player;
    for (const a of game.agents) {
      const g = this.chars.get(a.id);
      if (!g) continue;
      g.position.set(a.x, 0, a.z);
      g.rotation.y = a.dir;
      const parts = g.userData.parts;
      const swing = a.moving ? Math.sin(this.t * 11 + a.id) * 0.62 : 0;
      const bob = a.moving
        ? Math.sin(this.t * 22 + a.id) * 0.05
        : Math.sin(this.t * 2.2 + a.id) * 0.012;
      // 牢屋の中は床が少し高いので、収容中（拘束中）は足元を床の上に乗せる
      const confined = a.state === 'jailed' || a.state === 'detained';
      g.position.y = (confined ? 0.2 : 0) + Math.abs(bob);
      if (parts.legL) parts.legL.rotation.x = swing;
      if (parts.legR) parts.legR.rotation.x = -swing;
      if (parts.armL) parts.armL.rotation.x = -swing * 0.8;
      if (parts.armR) parts.armR.rotation.x = swing * 0.8;
      if (parts.lampR && parts.lampB) {
        const on = Math.sin(this.t * (a.isPlayer ? 7 : 5) + a.id) > 0;
        parts.lampR.material.color.setHex(on ? COL.red : 0x5c1b18);
        parts.lampB.material.color.setHex(on ? 0x16264f : 0x4cc2ff);
      }
      const jailed = confined;
      g.rotation.z = jailed ? 0.12 : 0;
      const carry = g.userData.carry;
      carry.visible = a.carrying != null;
      if (a.carrying != null) {
        carry.rotation.y += dt * 1.1;
        carry.position.y = 1.1 + Math.sin(this.t * 5 + a.id) * 0.04;
        const halo = carry.children[2];
        if (halo?.material) halo.material.opacity = 0.62 + Math.sin(this.t * 6 + a.id) * 0.22;
      }
      g.userData.alert.visible = !!a.exposed;
      g.scale.setScalar(jailed ? 0.92 : 1);

      // 隠れている泥棒は、近くに来ないと見えない（プレイヤー自身は半透明）
      let opacity = 1;
      if (a.hidden) {
        const d = player ? Math.hypot(player.x - a.x, player.z - a.z) : 0;
        if (a !== player && d > game.cfg.hideReveal) {
          g.visible = false;
          continue;
        }
        opacity = 0.4;
      }
      g.visible = true;
      for (const m of g.userData.mats) {
        const wantTransparent = opacity < 1;
        if (m.transparent !== wantTransparent) {
          m.transparent = wantTransparent;
          m.needsUpdate = true;
        }
        m.opacity = opacity;
      }
    }

    // お宝
    for (const t of game.treasures) {
      const mesh = this.treasureMeshes[t.id];
      if (!mesh) continue;
      if (t.state === 'vault') {
        mesh.visible = true;
        mesh.position.set(t.x, 0, t.z);
      } else {
        mesh.visible = false;
      }
      if (mesh.userData.spark) {
        mesh.userData.spark.rotation.y += dt * 3;
        mesh.userData.spark.position.y = 1.6 + Math.sin(this.t * 3 + t.id) * 0.1;
      }
    }

    // 密告ピン
    while (this.pingMeshes.length < game.pings.length) {
      const p = new THREE.Group();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 2.4, 12),
        new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.6 }),
      );
      cone.position.y = 2.6;
      cone.rotation.x = Math.PI;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.0, 20),
        new THREE.MeshBasicMaterial({
          color: 0xff4d6d,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      p.add(cone, ring);
      this.pingRoot.add(p);
      this.pingMeshes.push(p);
    }
    this.pingMeshes.forEach((mesh, i) => {
      const ping = game.pings[i];
      mesh.visible = !!ping;
      if (ping) {
        mesh.position.set(ping.x, 0, ping.z);
        mesh.children[1].scale.setScalar(1 + Math.sin(this.t * 8) * 0.12);
      }
    });

    // 捜索の波紋（足元から広がるリング）
    const searches = (game.effects || []).filter((e) => e.type === 'search');
    while (this.searchMeshes.length < searches.length) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xa8ecff,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      this.fxRoot.add(ring);
      this.searchMeshes.push(ring);
    }
    this.searchMeshes.forEach((mesh, i) => {
      const e = searches[i];
      mesh.visible = !!e;
      if (!e) return;
      const k = Math.min(1, e.age / e.ttl);
      const ease = 1 - Math.pow(1 - k, 3);
      mesh.position.set(e.x, 0.12, e.z);
      mesh.scale.setScalar(Math.max(0.25, e.radius * ease));
      mesh.material.opacity = 0.85 * (1 - k);
      mesh.rotation.z += dt * 0.5;
    });

    // プレイヤーが茂みに隠れている間は、その茂みを透かして自分の位置を見せる
    if (this.bushMats) {
      const p = game.player;
      for (let i = 0; i < this.bushMeshes.length; i++) {
        const b = MAP.bushes[i];
        const inside = p && p.hidden && Math.hypot(p.x - b.x, p.z - b.z) < b.r + 1.0;
        const opacity = inside ? 0.42 : 1;
        const entry = this.bushMats[i];
        if (entry.mat.opacity !== opacity) entry.mat.opacity = opacity;
        entry.mat.depthWrite = opacity >= 1;
      }
    }

    // プレイヤーリング
    if (player) {
      if (!this.playerRing) {
        this.playerRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.95, 0.07, 8, 28),
          new THREE.MeshBasicMaterial({ color: 0xffe066 }),
        );
        this.playerRing.rotation.x = -Math.PI / 2;
        this.scene.add(this.playerRing);
      }
      const inJail = player.state === 'jailed' || player.state === 'detained';
      this.playerRing.position.set(player.x, inJail ? 0.25 : 0.1, player.z);
      this.playerRing.scale.setScalar(1 + Math.sin(this.t * 4) * 0.05);
      this.playerRing.visible =
        player.state === 'free' || player.state === 'jailed' || player.state === 'detained';
    }

    // ゲート演出
    if (this.gateRing) {
      this.gateRing.rotation.z += dt * 0.8;
      this.gateGlow.material.opacity = 0.26 + Math.sin(this.t * 2.4) * 0.09;
    }

    // カメラ
    this.updateCamera(player, dt);
  }

  /** 牢屋ビューのパン（スティック入力 −1..1 をフレームごとに渡す） */
  panLookBy(dx, dz) {
    const b = MAP.bounds;
    const pad = 6;
    const clampV = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    this.lookPan.x = clampV(this.lookPan.x + dx, b.minX + pad, b.maxX - pad);
    this.lookPan.z = clampV(this.lookPan.z + dz, b.minZ + pad, b.maxZ - pad);
    return this.lookPan;
  }

  /** 牢屋ビューを牢屋の真上に戻す */
  centerJailView() {
    // 牢屋を画面の中央寄り（少し右）に置き、左側のHUDと重ならないようにする
    this.lookPan = { x: MAP.jail.x - 10, z: MAP.jail.z - 4 };
    this._inJailView = true; // 手動で合わせた位置を次のフレームで上書きしない
    return this.lookPan;
  }

  cameraPose(player) {
    // キャラ図鑑用の固定カメラ（スクリーンショット用 ?chars=1）
    if (this.view === 'chars') {
      const f = this.charFocus || { x: 0, z: 20 };
      const focus = new THREE.Vector3(f.x, 1.05, f.z);
      return { focus, desired: focus.clone().add(new THREE.Vector3(0, 1.45, 7.0)), follow: false, overview: false };
    }
    // 牢屋・拘束中は俯瞰カメラ：スティックで街を見渡せる（自キャラは牢屋に残す）
    if (player && (player.state === 'jailed' || player.state === 'detained')) {
      const focus = new THREE.Vector3(this.lookPan.x, 0, this.lookPan.z);
      const offset = new THREE.Vector3(0, 46, 22);
      return {
        focus,
        desired: focus.clone().add(offset),
        follow: false,
        overview: false,
        jail: true,
      };
    }
    const follow = this.view === 'follow';
    const overview = this.view === 'map';
    const focus = follow
      ? new THREE.Vector3(player.x, 0.9, player.z)
      : overview
        ? new THREE.Vector3(0, 0, 14)
        : new THREE.Vector3(player.x, 0, player.z + 2);
    let offset = new THREE.Vector3(0, 25, 22);
    if (this.view === 'top') offset = new THREE.Vector3(0, 70, 13);
    if (overview) {
      const tilt = this.overviewTilt ?? 0.42;
      offset = new THREE.Vector3(0, this.overviewHeightFor(tilt), this.overviewHeightFor(tilt) * tilt);
    }
    return { focus, desired: focus.clone().add(offset), follow, overview };
  }

  /** 街全体が画面に収まる俯瞰カメラの高さ（アスペクトごとに一度だけ計算） */
  overviewHeightFor(tilt) {
    const aspect = +(this.camera.aspect || 1.7).toFixed(3);
    const key = `${aspect}:${tilt}`;
    if (this._fitKey === key) return this._fitHeight;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, aspect, 0.5, 2000);
    const focus = new THREE.Vector3(0, 0, 14);
    const corners = [
      [MAP.bounds.minX - 1, MAP.bounds.minZ - 1],
      [MAP.bounds.maxX + 1, MAP.bounds.minZ - 1],
      [MAP.bounds.minX - 1, MAP.bounds.maxZ + 1],
      [MAP.bounds.maxX + 1, MAP.bounds.maxZ + 1],
    ];
    const v = new THREE.Vector3();
    let lo = 50;
    let hi = 900;
    for (let i = 0; i < 34; i++) {
      const h = (lo + hi) / 2;
      cam.position.set(0, h, h * tilt);
      cam.up.set(0, 1, 0);
      cam.lookAt(focus);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      const fits = corners.every(([x, z]) => {
        v.set(x, 0, z).project(cam);
        return Math.abs(v.x) <= 0.93 && Math.abs(v.y) <= 0.93;
      });
      if (fits) hi = h;
      else lo = h;
    }
    this._fitKey = key;
    this._fitHeight = hi;
    return hi;
  }

  snapCamera() {
    const player = this.game?.player;
    if (!player) return;
    const { focus, desired } = this.cameraPose(player);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(desired);
    this.camTarget.copy(focus);
    this.camera.lookAt(this.camTarget);
  }

  updateCamera(player, dt) {
    if (player) {
      const { focus, desired, follow, jail } = this.cameraPose(player);
      this.camera.up.set(0, 1, 0);
      const k = jail ? 6.0 : follow ? 5.0 : 3.0;
      this.camera.position.lerp(desired, Math.min(1, dt * k));
      this.camTarget.lerp(focus, Math.min(1, dt * (jail ? 7 : 6)));
      this.camera.lookAt(this.camTarget);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
