// DOROKEI 3D renderer — 明るいポップな街・キャラ・牢屋・お宝・脱出ゲート
import * as THREE from '../vendor/three.module.js';
import { MAP, ROLE, looksLike } from './core.js';

const COL = {
  copBody: 0x2f6fd8,
  copDark: 0x1c4aa0,
  thiefBody: 0x3b4157,
  thiefDark: 0x232634,
  bag: 0x9c6b3f,
  skin: 0xffd3ac,
  mask: 0x14161d,
  gold: 0xffc63a,
  goldDark: 0xd89a12,
  red: 0xe8443f,
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
};

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
    this.scene.add(this.characterRoot, this.treasureRoot, this.pingRoot);

    this.chars = new Map();
    this.treasureMeshes = [];
    this.pingMeshes = [];
    this.playerRing = null;

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

      if (o.sign) {
        const label = new THREE.Sprite(makeLabel(o.sign, '#fff8e0', 'rgba(28,74,160,0.92)', 64));
        label.scale.set(Math.min(4.0, o.w * 0.38), Math.min(2.0, o.w * 0.19), 1);
        label.position.set(o.x, o.h + 1.4, o.z + o.d / 2 + 0.2);
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

  buildJail() {
    const jail = MAP.jail;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(jail.w, 0.35, jail.d),
      new THREE.MeshLambertMaterial({ color: 0x6f7c90 }),
    );
    floor.position.set(jail.x, 0.17, jail.z);
    this.scene.add(floor);

    // 監視塔のような柱
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xdbe3ee });
    for (const w of MAP.jailWalls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wallMat);
      m.position.set(w.x, w.h / 2, w.z);
      this.scene.add(m);
    }
    const barMat = new THREE.MeshLambertMaterial({ color: 0x39414f });
    const barGeo = new THREE.BoxGeometry(0.16, 3.4, 0.16);
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
      m.makeTranslation(b.x, 3.9, b.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);

    const sign = new THREE.Sprite(makeLabel('POLICE', '#ffe9e9', 'rgba(28,74,160,0.95)', 68));
    sign.scale.set(9, 4.5, 1);
    sign.position.set(jail.x, 7.2, jail.z - 7.8);
    this.scene.add(sign);

    // 牢屋の中のベンチ（収容された泥棒の目印）
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x9a6b45 });
    for (const s of [
      { x: -68, z: 58 },
      { x: -62, z: 58 },
      { x: -56, z: 58 },
      { x: -68, z: 65 },
      { x: -62, z: 65 },
      { x: -56, z: 65 },
    ]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.7), benchMat);
      seat.position.set(s.x, 0.5, s.z);
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
    // 茂み（隠れ場所）: 半透明の緑の塊＋足元のリング
    this.bushMeshes = [];
    for (const b of MAP.bushes) {
      const g = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0x2f8f4a });
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
    this.pingMeshes = [];
    this.treasureMeshes = [];

    for (const a of game.agents) this.chars.set(a.id, this.buildCharacter(a));
    for (const t of game.treasures) {
      const mesh = this.buildTreasure();
      mesh.userData.id = t.id;
      this.treasureRoot.add(mesh);
      this.treasureMeshes.push(mesh);
    }
  }

  buildCharacter(a) {
    const g = new THREE.Group();
    const isCop = looksLike(a.role) === 'cop';
    const mats = [];
    const bodyMat = new THREE.MeshLambertMaterial({ color: isCop ? COL.copBody : COL.thiefBody });
    const darkMat = new THREE.MeshLambertMaterial({ color: isCop ? COL.copDark : COL.thiefDark });
    const skinMat = new THREE.MeshLambertMaterial({ color: COL.skin });
    mats.push(bodyMat, darkMat, skinMat);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.28), darkMat);
    legL.position.set(-0.19, 0.25, 0);
    const legR = legL.clone();
    legR.position.x = 0.19;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.82, 0.56), bodyMat);
    body.position.y = 0.92;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.58), skinMat);
    head.position.y = 1.64;

    const parts = { legL, legR, body, head };

    if (isCop) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.2, 0.64), darkMat);
      cap.position.y = 1.98;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.08, 0.3), darkMat);
      brim.position.set(0, 1.9, 0.42);
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.06),
        new THREE.MeshBasicMaterial({ color: COL.gold }),
      );
      badge.position.set(-0.2, 1.02, 0.31);
      // パトランプ（赤青）
      const lampR = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 0.16),
        new THREE.MeshBasicMaterial({ color: COL.red }),
      );
      lampR.position.set(-0.14, 2.12, 0);
      const lampB = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x4cc2ff }),
      );
      lampB.position.set(0.14, 2.12, 0);
      g.add(cap, brim, badge, lampR, lampB);
      parts.lampR = lampR;
      parts.lampB = lampB;
    } else {
      const mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 0.2, 0.6),
        new THREE.MeshLambertMaterial({ color: COL.mask }),
      );
      mask.position.y = 1.56;
      const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.62), darkMat);
      beanie.position.y = 2.0;
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.56, 0.3),
        new THREE.MeshLambertMaterial({ color: COL.bag }),
      );
      bag.position.set(0, 0.95, -0.42);
      g.add(mask, beanie, bag);
      parts.bag = bag;
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x0d1a10, transparent: true, opacity: 0.2 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.07;

    const carry = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.66, 0.66),
      new THREE.MeshLambertMaterial({ color: COL.gold, emissive: 0x6b4a00, emissiveIntensity: 0.45 }),
    );
    carry.position.set(0, 2.45, 0);
    carry.visible = false;

    // 正体発覚マーク
    const alert = new THREE.Sprite(makeLabel('!', '#ffffff', 'rgba(214,40,40,0.96)', 120));
    alert.scale.set(1.5, 1.5, 1);
    alert.position.set(0, 3.4, 0);
    alert.visible = false;

    g.add(legL, legR, body, head, shadow, carry, alert);
    g.userData = { parts, carry, alert, look: isCop ? 'cop' : 'thief', mats };
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
    if (this.view === 'map') {
      this.scene.fog.near = 420;
      this.scene.fog.far = 900;
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
      const bob = a.moving ? Math.sin(this.t * 12 + a.id) * 0.06 : Math.sin(this.t * 2.2 + a.id) * 0.015;
      g.position.y = Math.abs(bob) * 0.8;
      if (parts.legL) parts.legL.rotation.x = a.moving ? Math.sin(this.t * 12 + a.id) * 0.7 : 0;
      if (parts.legR) parts.legR.rotation.x = a.moving ? -Math.sin(this.t * 12 + a.id) * 0.7 : 0;
      if (parts.lampR && parts.lampB && a.isPlayer) {
        const on = Math.sin(this.t * 6) > 0;
        parts.lampR.material.color.setHex(on ? COL.red : 0x5a1a18);
        parts.lampB.material.color.setHex(on ? 0x1a2a5a : 0x4cc2ff);
      }
      const jailed = a.state === 'jailed';
      g.rotation.z = jailed ? 0.12 : 0;
      g.userData.carry.visible = a.carrying != null;
      if (a.carrying != null) g.userData.carry.rotation.y += dt * 2;
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
      this.playerRing.position.set(player.x, 0.1, player.z);
      this.playerRing.scale.setScalar(1 + Math.sin(this.t * 4) * 0.05);
      this.playerRing.visible = player.state === 'free';
    }

    // ゲート演出
    if (this.gateRing) {
      this.gateRing.rotation.z += dt * 0.8;
      this.gateGlow.material.opacity = 0.26 + Math.sin(this.t * 2.4) * 0.09;
    }

    // カメラ
    this.updateCamera(player, dt);
  }

  cameraPose(player) {
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
      const { focus, desired, follow } = this.cameraPose(player);
      this.camera.up.set(0, 1, 0);
      const k = follow ? 5.0 : 3.0;
      this.camera.position.lerp(desired, Math.min(1, dt * k));
      this.camTarget.lerp(focus, Math.min(1, dt * 6));
      this.camera.lookAt(this.camTarget);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
