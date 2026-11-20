// DOROKEI — ドロケー × 人狼（広い街・新ルール版）
// コアロジック（描画に依存しない純粋ロジック）。Node のユニットテストから直接読み込む。
//
// 新ルールの要点
//  - 警察は「探して捕まえる」。全員確保、または時間切れでお宝を1つでも守りきれば勝ち。
//  - 泥棒はお宝を規定数（=配置数5）すべて盗んで脱出ゲートへ運べば勝ち。隠れる・盗む・運ぶ・救出が可能。
//  - お宝を運んでいる間は移動速度が落ちる（6.8 → 5.4）。
//  - お宝を持ったまま捕まると、泥棒は牢屋へ・お宝は街のどこかへランダムに隠し戻される。
//  - 警察側スパイ（内通者）は牢屋を解錠できる。泥棒側スパイ（密告者）は運ばれたお宝を隠し戻せる。
//  - 解錠中を他の警察に、お宝の隠し戻し中を他の泥棒に近くで見られると正体発覚。
//    発覚後は元の陣営からも捕まえて牢屋へ送れる。

export const ROLE = Object.freeze({
  COP: 'cop',
  COP_SPY: 'copSpy',
  THIEF: 'thief',
  THIEF_SPY: 'thiefSpy',
});

export const SPY_MODES = Object.freeze({
  both: '両方スパイあり',
  cops: '警察のみ',
  thieves: '泥棒のみ',
  none: 'スパイなし',
});

/** 見た目の陣営（制服の色）。スパイは相手陣営の服を着ている。 */
export function looksLike(role) {
  return role === ROLE.COP || role === ROLE.COP_SPY ? 'cop' : 'thief';
}

/** 本当の勝利目標の陣営。 */
export function teamOf(role) {
  return role === ROLE.COP || role === ROLE.THIEF_SPY ? 'cop' : 'thief';
}

export function isSpyRole(role) {
  return role === ROLE.COP_SPY || role === ROLE.THIEF_SPY;
}

export const CFG = Object.freeze({
  duration: 300, // 広い街に合わせた制限時間（秒）
  treasureCount: 5, // 配置するお宝の数
  treasureRequired: 5, // 泥棒が全部運ばないと勝てない（=1つでも守れば警察の勝ち）
  treasureSpots: 10, // お宝候補スポット数
  speed: { cop: 6.4, thief: 6.8, carry: 5.4 }, // 運搬中は 6.8 → 5.4
  copDash: 1.3,
  radius: 0.62,
  arrestRange: 1.9,
  arrestCooldown: 4.0,
  pickupRange: 2.0,
  actionRange: 2.9,
  actionTime: 1.5,
  whistleRange: 11,
  whistleCooldown: 14,
  pingTtl: 4.0,
  freeImmunity: 2.0,
  exposeRange: 7.5,
  exposeAfter: 0.15,
  copVision: 17,
  thiefDodge: 7.0,
  unlockCooldown: 5.0,
  hideReveal: 3.2, // 隠れている泥棒が見つかる距離
  hideRange: 1.2, // 茂みに隠れられる距離（中心から+半径）
  returnRange: 5.0, // 脱出ゲート前でお宝を隠し戻せる距離
  bushDodge: 4.5, // 泥棒が茂みへ逃げ込む距離
});

// ---- 街のデータ ----------------------------------------------------------
const B = { minX: -75, maxX: 75, minZ: -75, maxZ: 75 };

// 道路（描画とミニマップ、木の自動配置の除外判定に使う）
const ROADS = [
  { x: 0, z: 0, w: 150, d: 11 },
  { x: 0, z: -45, w: 150, d: 10 },
  { x: 0, z: 45, w: 150, d: 10 },
  { x: 0, z: 0, w: 11, d: 150 },
  { x: -45, z: 0, w: 10, d: 150 },
  { x: 45, z: 0, w: 10, d: 150 },
];

// 建物・乗り物などの障害物（x,z=中心 / w,d=幅・奥行き / h=高さ）
const OBSTACLES = [
  // 銀行（北西）
  { x: -62, z: -62, w: 20, d: 14, h: 10.5, color: 0xe9e3d3, kind: 'bank', sign: 'BANK' },
  { x: -62, z: -47.5, w: 8, d: 1.2, h: 2.2, color: 0xcbbf9e, kind: 'wall' },
  // 宝石店（北東）
  { x: 62, z: -62, w: 18, d: 14, h: 9, color: 0xf3c9d4, kind: 'jewelry', sign: 'JEWELRY' },
  // 美術館（東）
  { x: 62, z: -16, w: 18, d: 14, h: 11, color: 0xdfe8f5, kind: 'museum', sign: 'MUSEUM' },
  // 駅（北中央）と駅前
  { x: -22, z: -30, w: 24, d: 14, h: 9, color: 0xc9d8e8, kind: 'station', sign: 'STATION' },
  { x: -22, z: -6.5, w: 5, d: 4, h: 3.6, color: 0xf5cf6a, kind: 'kiosk', sign: 'SHOP' },
  // 倉庫（北中央〜東）
  { x: 18, z: -62, w: 18, d: 12, h: 7.5, color: 0xc3ccd8, kind: 'warehouse', sign: 'DEPOT' },
  { x: 36, z: -62, w: 12, d: 10, h: 6.5, color: 0xe7b9a8, kind: 'house' },
  // 住宅街（西）
  { x: -66, z: -30, w: 12, d: 12, h: 8.5, color: 0x9fd8b6, kind: 'apartment' },
  { x: -66, z: -12, w: 12, d: 10, h: 8.5, color: 0xa9c8ea, kind: 'apartment' },
  { x: -66, z: 20, w: 12, d: 12, h: 6.5, color: 0xf0b183, kind: 'cafe', sign: 'CAFE' },
  { x: -66, z: 36, w: 12, d: 10, h: 6, color: 0xf5d78a, kind: 'shop', sign: 'BAKERY' },
  // 中央〜東の住宅・オフィス
  { x: 18, z: -30, w: 12, d: 12, h: 7.5, color: 0xe0a0a8, kind: 'house' },
  { x: 36, z: -16, w: 12, d: 10, h: 6.5, color: 0xb7a7d6, kind: 'house' },
  { x: 36, z: 20, w: 14, d: 14, h: 10, color: 0x8fb2d9, kind: 'office', sign: 'OFFICE' },
  // 公園のあずまや（中央南西＝公園内）
  { x: -22, z: 34, w: 6, d: 6, h: 4.2, color: 0xd9a86a, kind: 'pavilion' },
  // 商店街（南東）
  { x: 62, z: 16, w: 14, d: 12, h: 6.5, color: 0xf3b7c8, kind: 'shop', sign: 'SHOP' },
  { x: 62, z: 34, w: 14, d: 10, h: 6, color: 0xa8dcc0, kind: 'shop', sign: 'MARKET' },
  { x: 62, z: 62, w: 16, d: 12, h: 7, color: 0xcfc3ea, kind: 'shop', sign: 'ARCADE' },
  { x: 36, z: 62, w: 14, d: 10, h: 6.5, color: 0xf2cf8e, kind: 'shop', sign: 'DINER' },
  { x: -30, z: 62, w: 12, d: 10, h: 6, color: 0xbfe0c8, kind: 'shop', sign: 'CAFE' },
  // 警察署＋牢屋の建物（南西）
  // 駐車場の車（隠れられる物陰）
  { x: -30, z: -58, w: 3.4, d: 1.8, h: 1.5, color: 0xe0574f, kind: 'car' },
  { x: -30, z: -62, w: 3.4, d: 1.8, h: 1.5, color: 0x4f8ee0, kind: 'car' },
  { x: -30, z: -66, w: 3.4, d: 1.8, h: 1.5, color: 0xe8c34a, kind: 'car' },
  { x: -14, z: -58, w: 3.4, d: 1.8, h: 1.5, color: 0x5fc27e, kind: 'car' },
  { x: -14, z: -62, w: 3.4, d: 1.8, h: 1.5, color: 0xf0f2f7, kind: 'car' },
  { x: -14, z: -66, w: 3.4, d: 1.8, h: 1.5, color: 0x2a3242, kind: 'car' },
  { x: 3, z: 40, w: 3.4, d: 1.8, h: 1.5, color: 0xe0574f, kind: 'car' },
  { x: -52, z: 4, w: 1.8, d: 3.4, h: 1.5, color: 0x4f8ee0, kind: 'car' },
];

// 牢屋（警察署の中庭）
const JAIL = { x: -62, z: 62, w: 20, d: 16 };
const JAIL_DOOR = { x: -62, z: 53.6 };

const JAIL_WALLS = [
  { x: -72.4, z: 62, w: 0.8, d: 16.8, h: 2.2 },
  { x: -51.6, z: 62, w: 0.8, d: 16.8, h: 2.2 },
  { x: -62, z: 70.4, w: 21.6, d: 0.8, h: 2.2 },
  { x: -68.5, z: 53.6, w: 7.5, d: 0.8, h: 2.2 },
  { x: -55.5, z: 53.6, w: 7.5, d: 0.8, h: 2.2 },
];

// 脱出ゲート（南）
const GATE = { x: 0, z: 71, w: 14, d: 6 };

export const JAIL_SLOTS = [
  { x: -68, z: 58 },
  { x: -62, z: 58 },
  { x: -56, z: 58 },
  { x: -68, z: 65 },
  { x: -62, z: 65 },
  { x: -56, z: 65 },
];

// お宝の候補スポット（この中から 5 箇所をランダムに選ぶ）
const TREASURE_SPOTS = [
  { x: -62, z: -53, name: '銀行前' },
  { x: -56, z: -72, name: '銀行裏口' },
  { x: 62, z: -53, name: '宝石店前' },
  { x: 52, z: -52, name: '宝石店西' },
  { x: -22, z: -14, name: '駅前広場' },
  { x: 62, z: -30, name: '美術館前' },
  { x: -62, z: -20, name: '住宅街の路地' },
  { x: 22, z: 62, name: '商店街裏' },
  { x: -32, z: 22, name: '公園' },
  { x: 10, z: -52, name: '倉庫前' },
];

// 茂み（隠れられる場所）
const BUSHES = [
  { x: -30, z: 10, r: 2.6 },
  { x: -14, z: 28, r: 2.4 },
  { x: -34, z: 34, r: 2.4 },
  { x: -8, z: 16, r: 2.2 },
  { x: -70, z: -44, r: 2.4 },
  { x: -58, z: -20, r: 2.2 },
  { x: 8, z: 52, r: 2.4 },
  { x: 52, z: 50, r: 2.4 },
  { x: 72, z: 20, r: 2.2 },
  { x: 30, z: -52, r: 2.4 },
  { x: -38, z: -16, r: 2.2 },
  { x: -72, z: 52, r: 2.2 },
  { x: -12, z: 66, r: 2.2 },
  { x: 12, z: 66, r: 2.2 },
];

// 公園の池（描画のみ）
const PONDS = [{ x: -22, z: 16, r: 4.2 }];

function rectHas(rect, x, z, pad = 0) {
  return (
    Math.abs(x - rect.x) <= rect.w / 2 + pad && Math.abs(z - rect.z) <= rect.d / 2 + pad
  );
}

function onRoad(x, z, pad = 0) {
  return ROADS.some((r) => rectHas(r, x, z, pad));
}

function seedTrees() {
  const rng = mulberry32(0x0d0e2026);
  const trees = [];
  let guard = 0;
  while (trees.length < 54 && guard++ < 5000) {
    const x = B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (onRoad(x, z, 2.5)) continue;
    if (OBSTACLES.some((o) => rectHas(o, x, z, 3.4))) continue;
    if (JAIL_WALLS.some((w) => rectHas(w, x, z, 3.0))) continue;
    if (Math.abs(x - GATE.x) < GATE.w / 2 + 3 && Math.abs(z - GATE.z) < GATE.d / 2 + 3) continue;
    if (TREASURE_SPOTS.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    if (BUSHES.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 2.2)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.6)) continue;
    trees.push({ x: +x.toFixed(2), z: +z.toFixed(2), s: 0.85 + rng() * 0.5 });
  }
  return trees;
}

export const MAP = Object.freeze({
  bounds: B,
  roads: ROADS,
  obstacles: OBSTACLES,
  jail: JAIL,
  jailDoor: JAIL_DOOR,
  jailWalls: JAIL_WALLS,
  gate: GATE,
  spawn: {
    cop: { x: -62, z: 48, r: 4.5 },
    thief: { x: -22, z: -46, r: 5.5 },
  },
  treasureSpots: TREASURE_SPOTS,
  bushes: BUSHES,
  ponds: PONDS,
  trees: seedTrees(),
  landmarks: [
    { id: 'bank', label: 'BANK', x: -62, z: -62 },
    { id: 'jewelry', label: 'JEWELRY', x: 62, z: -62 },
    { id: 'museum', label: 'MUSEUM', x: 62, z: -16 },
    { id: 'station', label: 'STATION', x: -22, z: -30 },
    { id: 'park', label: 'PARK', x: -22, z: 22 },
    { id: 'depot', label: 'DEPOT', x: 18, z: -62 },
    { id: 'shops', label: 'SHOPS', x: 62, z: 34 },
    { id: 'jail', label: 'POLICE', x: -62, z: 62 },
    { id: 'gate', label: 'EXIT', x: 0, z: 71 },
  ],
});

export const COP_NAMES = ['ポリスA', 'ポリスB', 'ポリスC', 'ポリスD', 'ポリスE'];
export const THIEF_NAMES = ['ドロボウA', 'ドロボウB', 'ドロボウC', 'ドロボウD', 'ドロボウE', 'ドロボウF'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function isInZone(p, zone) {
  return Math.abs(p.x - zone.x) <= zone.w / 2 && Math.abs(p.z - zone.z) <= zone.d / 2;
}

// ---- 経路探索（グリッドA*） ------------------------------------------------
// 広い街では壁に引っかかって棒立ちになるので、2m グリッドの A* で回り込む。
export class Nav {
  constructor(bounds, colliders, cell = 2, inflate = 0.85) {
    this.bounds = bounds;
    this.cell = cell;
    this.inflate = inflate;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.colliders = colliders;
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const p = this.cellCenter(cx, cz);
        this.blocked[cz * this.cols + cx] = this.solidAt(p.x, p.z, inflate) ? 1 : 0;
      }
    }
    this._g = new Float32Array(this.cols * this.rows);
    this._f = new Float32Array(this.cols * this.rows);
    this._from = new Int32Array(this.cols * this.rows);
    this._seen = new Uint32Array(this.cols * this.rows);
    this._closed = new Uint32Array(this.cols * this.rows);
    this._stamp = 0;
  }

  solidAt(x, z, pad = this.inflate) {
    for (const o of this.colliders) {
      if (rectHas(o, x, z, pad)) return true;
    }
    return false;
  }

  cellCenter(cx, cz) {
    return {
      x: this.bounds.minX + (cx + 0.5) * this.cell,
      z: this.bounds.minZ + (cz + 0.5) * this.cell,
    };
  }

  cellOf(x, z) {
    const cx = clamp(Math.floor((x - this.bounds.minX) / this.cell), 0, this.cols - 1);
    const cz = clamp(Math.floor((z - this.bounds.minZ) / this.cell), 0, this.rows - 1);
    return { cx, cz };
  }

  isFree(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return false;
    return this.blocked[cz * this.cols + cx] === 0;
  }

  /** 一番近い通行可能セル（壁にめり込んだ時用） */
  nearestFree(cx, cz, maxRing = 6) {
    if (this.isFree(cx, cz)) return { cx, cz };
    for (let r = 1; r <= maxRing; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (this.isFree(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
        }
      }
    }
    return null;
  }

  /** 2点を結ぶ直線が障害物をまたがないか（セル単位でサンプリング） */
  lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (this.solidAt(x, z, this.inflate * 0.85)) return false;
    }
    return true;
  }

  findPath(ax, az, bx, bz) {
    const sc = this.cellOf(ax, az);
    const gc = this.cellOf(bx, bz);
    const start = this.nearestFree(sc.cx, sc.cz, 8);
    const goal = this.nearestFree(gc.cx, gc.cz, 8);
    if (!start || !goal) return null;
    const cols = this.cols;
    const startIdx = start.cz * cols + start.cx;
    const goalIdx = goal.cz * cols + goal.cx;
    if (startIdx === goalIdx) return [{ x: bx, z: bz }];

    const stamp = ++this._stamp;
    const g = this._g;
    const f = this._f;
    const from = this._from;
    const seen = this._seen;
    const closed = this._closed;

    const open = [startIdx];
    g[startIdx] = 0;
    f[startIdx] = 0;
    seen[startIdx] = stamp;
    from[startIdx] = -1;

    const h = (idx) => {
      const dx = Math.abs((idx % cols) - goal.cx);
      const dz = Math.abs(Math.floor(idx / cols) - goal.cz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const push = (idx) => {
      open.push(idx);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (f[open[p]] <= f[open[i]]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && f[open[l]] < f[open[m]]) m = l;
          if (r < open.length && f[open[r]] < f[open[m]]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };

    let guard = 0;
    while (open.length && guard++ < 40000) {
      const cur = pop();
      if (cur === goalIdx) break;
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      const cx = cur % cols;
      const cz = Math.floor(cur / cols);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.isFree(nx, nz)) continue;
          // 角をすり抜けない
          if (dx && dz && (!this.isFree(cx + dx, cz) || !this.isFree(cx, cz + dz))) continue;
          const idx = nz * cols + nx;
          if (closed[idx] === stamp) continue;
          const step = dx && dz ? Math.SQRT2 : 1;
          const tentative = g[cur] + step;
          if (seen[idx] !== stamp || tentative < g[idx]) {
            seen[idx] = stamp;
            g[idx] = tentative;
            f[idx] = tentative + h(idx);
            from[idx] = cur;
            push(idx);
          }
        }
      }
    }

    if (seen[goalIdx] !== stamp) return null;
    // 経路を復元
    const cells = [];
    let cur = goalIdx;
    let guard2 = 0;
    while (cur !== -1 && guard2++ < 5000) {
      cells.push(cur);
      if (cur === startIdx) break;
      cur = from[cur];
    }
    if (cells[cells.length - 1] !== startIdx) return null;
    cells.reverse();
    const pts = cells.map((idx) => this.cellCenter(idx % cols, Math.floor(idx / cols)));
    // 見通しの良い区間は間引いて自然な動きにする
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    out[out.length - 1] = { x: bx, z: bz };
    return out;
  }
}

/**
 * 役職割り当て。
 * spyMode: 'both' | 'cops' | 'thieves' | 'none'
 *   cops    = 警察陣営に「内通者」(見た目は警官 / 目標は泥棒の勝ち)
 *   thieves = 泥棒陣営に「密告者」(見た目は泥棒 / 目標は警察の勝ち)
 * playerRole: 'auto' | 'cop' | 'thief'
 * playerSpy:  'random' | 'always' | 'never'
 */
export function assignRoles(opts = {}) {
  const {
    cops = 3,
    thieves = 5,
    spyMode = 'both',
    playerRole = 'auto',
    playerSpy = 'random',
    seed = 7,
  } = opts;
  const rng = mulberry32(seed);
  const copSpyCount = spyMode === 'both' || spyMode === 'cops' ? 1 : 0;
  const thiefSpyCount = spyMode === 'both' || spyMode === 'thieves' ? 1 : 0;

  const copRoles = Array.from({ length: cops }, (_, i) =>
    i < copSpyCount ? ROLE.COP_SPY : ROLE.COP,
  );
  const thiefRoles = Array.from({ length: thieves }, (_, i) =>
    i < thiefSpyCount ? ROLE.THIEF_SPY : ROLE.THIEF,
  );
  shuffle(copRoles, rng);
  shuffle(thiefRoles, rng);

  const team = playerRole === 'auto' ? (rng() < 0.5 ? 'cop' : 'thief') : playerRole;
  const pool = team === 'cop' ? copRoles : thiefRoles;
  const spyIdx = pool.findIndex((r) => isSpyRole(r));
  const normalIdx = pool.findIndex((r) => !isSpyRole(r));
  const wantSpy = playerSpy === 'always' ? true : playerSpy === 'never' ? false : rng() < 0.35;
  const idx = wantSpy && spyIdx >= 0 ? spyIdx : normalIdx >= 0 ? normalIdx : 0;
  const playerResolved = pool.splice(idx, 1)[0];

  const roster = [{ role: playerResolved, isPlayer: true }];
  for (const role of copRoles) roster.push({ role, isPlayer: false });
  for (const role of thiefRoles) roster.push({ role, isPlayer: false });

  return roster.map((r, i) => ({
    id: i,
    role: r.role,
    team: teamOf(r.role),
    isPlayer: !!r.isPlayer,
    isSpy: isSpyRole(r.role),
    looks: looksLike(r.role),
  }));
}

export class Game {
  constructor(opts = {}) {
    this.cfg = { ...CFG, ...(opts.cfg || {}) };
    this.seed = opts.seed ?? 20261121;
    this.rng = mulberry32(this.seed);
    this.autoplay = !!opts.autoplay;
    this.phase = 'playing';
    this.winner = null;
    this.reason = '';
    this.t = 0;
    this.time = this.cfg.duration;
    this.events = [];
    this.pings = [];
    this.stats = {
      arrests: 0,
      rescues: 0,
      unlocks: 0,
      secured: 0,
      whistles: 0,
      exposures: 0,
      returns: 0,
      hides: 0,
    };
    this.input = { x: 0, z: 0, action: false };

    const roster = assignRoles({
      cops: opts.cops ?? 3,
      thieves: opts.thieves ?? 5,
      spyMode: opts.spyMode ?? 'both',
      playerRole: opts.playerRole ?? 'auto',
      playerSpy: opts.playerSpy ?? 'random',
      seed: this.seed,
    });

    this.colliders = [...MAP.obstacles, ...MAP.jailWalls];

    let copIdx = 0;
    let thiefIdx = 0;
    this.agents = roster.map((r) => {
      const base = r.looks === 'cop' ? MAP.spawn.cop : MAP.spawn.thief;
      const k = r.looks === 'cop' ? copIdx++ : thiefIdx++;
      const ang = (k / 5) * Math.PI * 2 + 0.4;
      const rad = base.r * (0.5 + 0.5 * ((k % 2) + 1) / 2);
      const a = {
        id: r.id,
        name:
          r.looks === 'cop'
            ? COP_NAMES[k % COP_NAMES.length]
            : THIEF_NAMES[k % THIEF_NAMES.length],
        role: r.role,
        team: r.team,
        isPlayer: r.isPlayer,
        isSpy: r.isSpy,
        looks: r.looks,
        x: base.x + Math.cos(ang) * rad,
        z: base.z + Math.sin(ang) * rad,
        dir: 0,
        state: 'free',
        carrying: null,
        hidden: false,
        arrestCd: 0,
        immune: 0,
        actionT: 0,
        unlockCd: 0,
        whistleCd: 0,
        exposed: false,
        moving: false,
        jailSlot: -1,
        path: null,
        pathTarget: null,
        pathAge: 0,
        ai: { wp: Math.floor(this.rng() * 8), retarget: 0, hideFor: 0, hideCd: 0 },
      };
      // 開始位置が建物にめり込んでいたら押し出す
      const solved = this.collide(a.x, a.z, this.cfg.radius);
      a.x = solved.x;
      a.z = solved.z;
      return a;
    });

    this.nav = new Nav(MAP.bounds, this.colliders, 2, 0.85);

    // お宝は候補10箇所から5箇所をランダムに選んで配置
    const spotOrder = shuffle(
      MAP.treasureSpots.map((s, i) => i),
      this.rng,
    );
    this.treasureSpots = MAP.treasureSpots;
    this.treasures = spotOrder
      .slice(0, this.cfg.treasureCount)
      .map((spotIdx, i) => {
        const p = MAP.treasureSpots[spotIdx];
        return {
          id: i,
          spot: spotIdx,
          x: p.x,
          z: p.z,
          home: { x: p.x, z: p.z },
          state: 'vault',
          carrier: null,
        };
      });
  }

  get player() {
    return this.agents.find((a) => a.isPlayer) || null;
  }

  get securedCount() {
    return this.treasures.filter((t) => t.state === 'secured').length;
  }

  setPlayerMove(x, z) {
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.input.x = x || 0;
    this.input.z = z || 0;
  }

  /** ボタンを押した瞬間の即時アクション（密告・隠れる） */
  setAction(down) {
    const wasDown = this.input.action;
    this.input.action = !!down;
    if (wasDown || !down) return;
    const p = this.player;
    if (!p || p.state !== 'free') return;
    if (p.role === ROLE.THIEF_SPY) this.whistle(p);
    if (p.looks === 'thief') {
      if (p.hidden) this.unhide(p);
      else this.hide(p);
    }
  }

  speedOf(a) {
    if (a.carrying != null) return this.cfg.speed.carry;
    return this.cfg.speed[a.looks] || 6;
  }

  bushAt(a, extra = this.cfg.hideRange) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < MAP.bushes.length; i++) {
      const b = MAP.bushes[i];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= b.r + extra && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  nearest(from, pred, max = Infinity) {
    let best = null;
    let bd = max;
    for (const a of this.agents) {
      if (a === from || !pred(a)) continue;
      const d = dist(from, a);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return { agent: best, dist: bd };
  }

  jailedTeammates(agent) {
    return this.agents.filter((a) => a.team === agent.team && a.state === 'jailed');
  }

  /** 隠れている相手は近くに来ないと見えない */
  canSee(observer, target) {
    if (target.hidden) return dist(observer, target) <= this.cfg.hideReveal;
    return true;
  }

  /**
   * 捕まえられるか。
   *  - 警官の見た目 → 泥棒の見た目を確保できる。正体発覚した内通者（警官の見た目）も確保できる。
   *  - 泥棒の見た目 → 正体発覚した密告者（泥棒の見た目）だけを牢屋へ送れる。
   *  - スパイ自身は捕まえる側には回れない（正体を隠すため）。
   */
  canArrest(actor, target) {
    if (this.phase !== 'playing') return false;
    if (!actor || !target || actor === target) return false;
    if (target.state !== 'free') return false;
    if (target.immune > 0) return false;
    if (target.hidden && dist(actor, target) > this.cfg.hideReveal) return false;
    // スパイは正体を隠しているので、自分からは捕まえられない（捕まえるのは本来の陣営の役目）
    if (actor.isSpy) return false;
    if (actor.looks === 'cop') {
      if (target.looks === 'thief') return true;
      if (target.role === ROLE.COP_SPY && target.exposed) return true;
      return false;
    }
    if (target.role === ROLE.THIEF_SPY && target.exposed) return true;
    return false;
  }

  freeJailSlot() {
    const used = new Set(this.agents.filter((a) => a.state === 'jailed').map((a) => a.jailSlot));
    for (let i = 0; i < JAIL_SLOTS.length; i++) if (!used.has(i)) return i;
    return 0;
  }

  arrest(cop, thief) {
    if (!this.canArrest(cop, thief)) return false;
    if (cop.arrestCd > 0) return false;
    if (thief.carrying != null) {
      const t = this.treasures[thief.carrying];
      thief.carrying = null;
      if (t) this.hideBackTreasure(t);
    }
    thief.hidden = false;
    const slot = this.freeJailSlot();
    thief.state = 'jailed';
    thief.jailSlot = slot;
    thief.actionT = 0;
    thief.path = null;
    thief.x = JAIL_SLOTS[slot].x;
    thief.z = JAIL_SLOTS[slot].z;
    cop.arrestCd = this.cfg.arrestCooldown;
    this.stats.arrests++;
    this.pushEvent({
      type: 'arrest',
      by: cop.id,
      target: thief.id,
      label: `${thief.name}を確保!`,
    });
    return true;
  }

  freeOne(cause, causeAgent) {
    const jailed = this.agents.filter((a) => a.team === 'thief' && a.state === 'jailed');
    if (!jailed.length) return null;
    const target = jailed[0];
    target.state = 'free';
    target.jailSlot = -1;
    target.immune = this.cfg.freeImmunity;
    target.actionT = 0;
    target.hidden = false;
    target.path = null;
    target.x = MAP.jailDoor.x + (this.rng() - 0.5) * 2;
    target.z = MAP.jailDoor.z - 1.8;
    if (cause === 'unlock') {
      this.stats.unlocks++;
      this.pushEvent({
        type: 'unlock',
        by: causeAgent?.id ?? null,
        target: target.id,
        label: `${target.name}が解錠で脱獄!`,
      });
    } else {
      this.stats.rescues++;
      this.pushEvent({
        type: 'rescue',
        by: causeAgent?.id ?? null,
        target: target.id,
        label: `${target.name}を救出!`,
      });
    }
    return target;
  }

  expose(agent, witness) {
    if (agent.exposed || !agent.isSpy) return false;
    agent.exposed = true;
    this.stats.exposures++;
    this.pushEvent({
      type: 'expose',
      by: agent.id,
      witness: witness?.id ?? null,
      label: `⚠️ 正体発覚! ${agent.name}`,
    });
    return true;
  }

  hide(agent) {
    if (this.phase !== 'playing') return false;
    if (agent.state !== 'free' || agent.looks !== 'thief') return false;
    if (agent.carrying != null) return false;
    const b = this.bushAt(agent);
    if (b < 0) return false;
    if (agent.hidden) return false;
    agent.hidden = true;
    agent.actionT = 0;
    agent.path = null;
    this.stats.hides++;
    this.pushEvent({ type: 'hide', by: agent.id, label: `${agent.name}が物陰に隠れた` });
    return true;
  }

  unhide(agent) {
    if (!agent.hidden) return false;
    agent.hidden = false;
    agent.ai.hideCd = 2.5;
    return true;
  }

  pickup(agent, treasure) {
    if (treasure.state !== 'vault') return false;
    if (agent.role === ROLE.THIEF_SPY) return false; // 密告者は運ばない
    treasure.state = 'carried';
    treasure.carrier = agent.id;
    agent.carrying = treasure.id;
    agent.hidden = false;
    this.pushEvent({ type: 'pickup', by: agent.id, label: `${agent.name}がお宝を奪取` });
    return true;
  }

  deliver(agent) {
    const t = this.treasures[agent.carrying];
    if (!t) return false;
    t.state = 'secured';
    t.carrier = null;
    agent.carrying = null;
    this.stats.secured = this.securedCount;
    this.pushEvent({
      type: 'deliver',
      by: agent.id,
      label: `お宝を搬出! (${this.securedCount}/${this.cfg.treasureRequired})`,
    });
    return true;
  }

  /** お宝を街のどこか（候補スポット）へランダムに隠し戻す */
  hideBackTreasure(t) {
    if (!t) return null;
    const occupied = new Set(
      this.treasures.filter((o) => o !== t && o.state === 'vault').map((o) => o.spot),
    );
    const free = this.treasuresSpotsFree(occupied, t.spot);
    const pick = free.length
      ? free[Math.floor(this.rng() * free.length)]
      : Math.floor(this.rng() * this.treasureSpots.length);
    const p = this.treasureSpots[pick];
    t.spot = pick;
    t.x = p.x;
    t.z = p.z;
    t.state = 'vault';
    t.carrier = null;
    const carrier = this.agents.find((a) => a.carrying === t.id);
    if (carrier) carrier.carrying = null;
    this.stats.secured = this.securedCount;
    this.pushEvent({ type: 'hideback', by: null, label: `お宝が「${p.name}」に隠し戻された` });
    return p;
  }

  treasuresSpotsFree(occupied, exclude) {
    const out = [];
    for (let i = 0; i < this.treasureSpots.length; i++) {
      if (i === exclude) continue;
      if (occupied.has(i)) continue;
      out.push(i);
    }
    return out;
  }

  /** 泥棒側スパイ: 脱出ゲートへ運ばれたお宝を隠し戻す */
  returnTreasure(agent) {
    if (this.phase !== 'playing' || agent.role !== ROLE.THIEF_SPY) return false;
    const secured = this.treasures.filter((t) => t.state === 'secured');
    if (!secured.length) return false;
    const t = secured[Math.floor(this.rng() * secured.length)];
    this.hideBackTreasure(t);
    this.stats.returns++;
    this.stats.secured = this.securedCount;
    this.pushEvent({ type: 'return', by: agent.id, label: `お宝が奪い返された! (${this.securedCount}/5)` });
    return true;
  }

  whistle(agent) {
    if (this.phase !== 'playing' || agent.whistleCd > 0) return false;
    if (agent.role !== ROLE.THIEF_SPY) return false;
    const near = this.agents.filter(
      (o) =>
        o !== agent &&
        o.state === 'free' &&
        o.team === 'thief' &&
        !o.hidden &&
        dist(agent, o) <= this.cfg.whistleRange,
    );
    if (!near.length) return false;
    agent.whistleCd = this.cfg.whistleCooldown;
    for (const o of near) {
      this.pings.push({ x: o.x, z: o.z, ttl: this.cfg.pingTtl, target: o.id });
    }
    this.stats.whistles++;
    this.pushEvent({
      type: 'whistle',
      by: agent.id,
      count: near.length,
      label: `密告ピン ×${near.length}`,
    });
    return true;
  }

  pushEvent(e) {
    e.t = this.time;
    this.events.push(e);
    if (this.events.length > 30) this.events.shift();
  }

  updatePings(dt) {
    for (const p of this.pings) p.ttl -= dt;
    this.pings = this.pings.filter((p) => p.ttl > 0);
  }

  counts() {
    const copTeam = this.agents.filter((a) => a.team === 'cop');
    const thiefTeam = this.agents.filter((a) => a.team === 'thief');
    return {
      cops: copTeam.length,
      copFree: copTeam.filter((a) => a.state === 'free').length,
      thieves: thiefTeam.length,
      thiefFree: thiefTeam.filter((a) => a.state === 'free').length,
      jailed: thiefTeam.filter((a) => a.state === 'jailed').length,
      secured: this.securedCount,
      required: this.cfg.treasureRequired,
      treasuresLeft: this.treasures.filter((t) => t.state === 'vault').length,
      carried: this.treasures.filter((t) => t.state === 'carried').length,
      hidden: this.agents.filter((a) => a.hidden).length,
      spiesCop: copTeam.filter((a) => a.isSpy).length,
      spiesThief: thiefTeam.filter((a) => a.isSpy).length,
      exposed: this.agents.filter((a) => a.exposed).length,
    };
  }

  step(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (this.phase !== 'playing') {
      this.updatePings(dt);
      return;
    }
    this.t += dt;
    this.time = Math.max(0, this.time - dt);
    for (const a of this.agents) this.tickAgent(a, dt);
    this.updatePings(dt);
    this.checkWin();
  }

  stepSeconds(sec, dt = 1 / 60) {
    const n = Math.ceil(sec / dt);
    for (let i = 0; i < n && this.phase === 'playing'; i++) this.step(dt);
  }

  tickAgent(a, dt) {
    if (a.state === 'jailed') {
      a.actionT = 0;
      a.moving = false;
      a.hidden = false;
      return;
    }
    a.immune = Math.max(0, a.immune - dt);
    a.arrestCd = Math.max(0, a.arrestCd - dt);
    a.whistleCd = Math.max(0, a.whistleCd - dt);
    a.unlockCd = Math.max(0, a.unlockCd - dt);
    a.ai.hideCd = Math.max(0, a.ai.hideCd - dt);
    a.pathAge += dt;

    const playerCtl = a.isPlayer && !this.autoplay;
    let mx = 0;
    let mz = 0;
    let act = false;
    if (playerCtl) {
      mx = this.input.x;
      mz = this.input.z;
      act = this.input.action;
    } else {
      const d = this.think(a, dt);
      mx = d.mx;
      mz = d.mz;
      act = d.act;
    }

    // 隠れている間は動かない（動くと隠れ解除）
    if (a.hidden) {
      if (Math.hypot(mx, mz) > 0.15) this.unhide(a);
      else {
        mx = 0;
        mz = 0;
      }
    }

    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    const nearDoor = dist(a, MAP.jailDoor) < this.cfg.actionRange;
    let speed = this.speedOf(a);
    const copLook = a.looks === 'cop';
    if (copLook && act && !nearDoor) speed *= this.cfg.copDash;
    if (a.hidden) speed = 0;

    const from = { x: a.x, z: a.z };
    a.x += mx * speed * dt;
    a.z += mz * speed * dt;
    const solved = this.collide(a.x, a.z, this.cfg.radius);
    a.x = clamp(solved.x, MAP.bounds.minX + 1, MAP.bounds.maxX - 1);
    a.z = clamp(solved.z, MAP.bounds.minZ + 1, MAP.bounds.maxZ - 1);
    if (mx || mz) a.dir = Math.atan2(mx, mz);
    a.moving = Math.hypot(a.x - from.x, a.z - from.z) > 0.002;

    // お宝を拾う（泥棒の見た目・密告者は拾わない・お宝持ちは拾わない）
    if (
      a.carrying == null &&
      a.looks === 'thief' &&
      a.role !== ROLE.THIEF_SPY &&
      !a.hidden
    ) {
      const t = this.treasures.find(
        (tr) => tr.state === 'vault' && Math.hypot(tr.x - a.x, tr.z - a.z) < this.cfg.pickupRange,
      );
      if (t) this.pickup(a, t);
    }

    // 搬出
    if (a.carrying != null && isInZone(a, MAP.gate)) this.deliver(a);

    // 捕獲（警官の見た目は自動で確保／泥棒の見た目は発覚した密告者のみ）
    if (a.arrestCd <= 0) {
      const tgt = this.nearest(a, (o) => this.canArrest(a, o), this.cfg.arrestRange);
      if (tgt.agent) this.arrest(a, tgt.agent);
    }

    // 牢屋前のゲージ（解錠 / 救出）
    const teamJailed = this.jailedTeammates(a).length;
    const nearGate = dist(a, MAP.gate) < this.cfg.returnRange;
    let acting = false;
    if (nearDoor && act && teamJailed > 0) {
      if (a.role === ROLE.COP_SPY && a.unlockCd <= 0) {
        acting = true;
        a.actionT += dt;
        const witness = this.nearest(
          a,
          (o) => o.role === ROLE.COP && o.state === 'free' && dist(a, o) <= this.cfg.exposeRange,
          this.cfg.exposeRange,
        );
        if (witness.agent && a.actionT > this.cfg.exposeAfter) this.expose(a, witness.agent);
        if (a.actionT >= this.cfg.actionTime) {
          a.actionT = 0;
          a.unlockCd = this.cfg.unlockCooldown;
          this.freeOne('unlock', a);
        }
      } else if (a.role === ROLE.THIEF) {
        acting = true;
        a.actionT += dt;
        if (a.actionT >= this.cfg.actionTime) {
          a.actionT = 0;
          this.freeOne('rescue', a);
        }
      }
    }
    // 脱出ゲート前のゲージ（密告者がお宝を隠し戻す）
    if (!acting && nearGate && act && a.role === ROLE.THIEF_SPY && this.securedCount > 0) {
      acting = true;
      a.actionT += dt;
      const witness = this.nearest(
        a,
        (o) => o.role === ROLE.THIEF && o.state === 'free' && dist(a, o) <= this.cfg.exposeRange,
        this.cfg.exposeRange,
      );
      if (witness.agent && a.actionT > this.cfg.exposeAfter) this.expose(a, witness.agent);
      if (a.actionT >= this.cfg.actionTime) {
        a.actionT = 0;
        this.returnTreasure(a);
      }
    }
    if (!acting) a.actionT = Math.max(0, a.actionT - dt * 2);
  }

  collide(x, z, r) {
    for (const o of this.colliders) {
      const minX = o.x - o.w / 2;
      const maxX = o.x + o.w / 2;
      const minZ = o.z - o.d / 2;
      const maxZ = o.z + o.d / 2;
      if (x + r > minX && x - r < maxX && z + r > minZ && z - r < maxZ) {
        const dx1 = maxX + r - x;
        const dx2 = x - (minX - r);
        const dz1 = maxZ + r - z;
        const dz2 = z - (minZ - r);
        const m = Math.min(dx1, dx2, dz1, dz2);
        if (m === dx1) x = maxX + r;
        else if (m === dx2) x = minX - r;
        else if (m === dz1) z = maxZ + r;
        else z = minZ - r;
      }
    }
    return { x, z };
  }

  // ---- 経路の追従 ---------------------------------------------------------
  moveToward(a, target, dt) {
    if (!target) return { mx: 0, mz: 0 };
    const dToTarget = Math.hypot(target.x - a.x, target.z - a.z);
    if (dToTarget < 0.4) {
      a.path = null;
      return { mx: 0, mz: 0 };
    }
    const targetMoved =
      !a.pathTarget || Math.hypot(a.pathTarget.x - target.x, a.pathTarget.z - target.z) > 2.6;
    const stale = !a.path || a.pathAge > 1.4;
    const straight = this.nav.lineFree(a.x, a.z, target.x, target.z);
    if (straight) {
      a.path = null;
      a.pathTarget = { x: target.x, z: target.z };
      const d = Math.hypot(target.x - a.x, target.z - a.z) || 1;
      return { mx: (target.x - a.x) / d, mz: (target.z - a.z) / d };
    }
    if (stale || targetMoved) {
      const path = this.nav.findPath(a.x, a.z, target.x, target.z);
      a.path = path && path.length ? path : null;
      a.pathTarget = { x: target.x, z: target.z };
      a.pathAge = 0;
    }
    if (!a.path || !a.path.length) {
      const d = Math.hypot(target.x - a.x, target.z - a.z) || 1;
      return { mx: (target.x - a.x) / d, mz: (target.z - a.z) / d };
    }
    while (a.path.length > 1 && Math.hypot(a.path[0].x - a.x, a.path[0].z - a.z) < 0.9) {
      a.path.shift();
    }
    const wp = a.path[0];
    const d = Math.hypot(wp.x - a.x, wp.z - a.z) || 1;
    return { mx: (wp.x - a.x) / d, mz: (wp.z - a.z) / d };
  }

  // ---- CPU AI -----------------------------------------------------------
  think(a, dt) {
    a.ai.retarget -= dt;
    const hostile = (o) =>
      o.state === 'free' && this.canArrest(a, o) && this.canSee(a, o);
    let target = null;
    let act = false;

    if (a.role === ROLE.COP) {
      const seen = this.nearest(a, hostile, this.cfg.copVision);
      const ping = this.pings.find((p) => p.ttl > 0);
      if (seen.agent) {
        target = { x: seen.agent.x, z: seen.agent.z };
        if (seen.dist < 7) act = true; // 追跡ダッシュ
      } else if (ping && ping.target != null) {
        target = { x: ping.x, z: ping.z };
      } else {
        target = this.patrolPoint(a);
      }
    } else if (a.role === ROLE.COP_SPY) {
      // 内通者: 誰も見ていない隙に牢屋を解錠する
      const jailed = this.agents.filter((o) => o.team === 'thief' && o.state === 'jailed');
      const copNear = this.nearest(
        a,
        (o) => o.role === ROLE.COP && o.state === 'free' && dist(a, o) < 7.5,
        7.5,
      );
      if (jailed.length && a.unlockCd <= 0 && !copNear.agent) {
        target = MAP.jailDoor;
        if (dist(a, MAP.jailDoor) < this.cfg.actionRange - 0.4) act = true;
      } else if (jailed.length && copNear.agent) {
        target = { x: -30, z: 40 }; // 怪しまれないよう持ち場へ
      } else {
        target = this.patrolPoint(a);
      }
    } else if (a.role === ROLE.THIEF) {
      // 隠れている間は警察が離れるまで待つ
      if (a.hidden) {
        a.ai.hideFor -= dt;
        const near = this.nearest(
          a,
          (o) => o.looks === 'cop' && o.state === 'free' && dist(a, o) < 13,
          13,
        );
        if (near.agent && a.ai.hideFor > 0) return { mx: 0, mz: 0, act: false };
        this.unhide(a);
      }
      const copNear = this.nearest(
        a,
        (o) => o.looks === 'cop' && o.state === 'free' && !o.exposed && this.canSee(o, a),
        this.cfg.thiefDodge,
      );
      const jailed = this.jailedTeammates(a).length;
      if (a.carrying != null) {
        target = MAP.gate;
        act = false;
      } else if (!a.hidden && copNear.agent && copNear.dist < this.cfg.bushDodge && a.ai.hideCd <= 0) {
        // 追われたら茂みへ飛び込む
        const b = this.bushAt(a, 9);
        if (b >= 0) {
          const bush = MAP.bushes[b];
          target = bush;
          if (Math.hypot(bush.x - a.x, bush.z - a.z) < bush.r && this.hide(a)) {
            a.ai.hideFor = 3.5 + this.rng() * 2.5;
          }
        } else {
          target = this.fleePoint(a, copNear.agent);
        }
      } else if (jailed >= 2 && !copNear.agent) {
        target = MAP.jailDoor;
        if (dist(a, MAP.jailDoor) < this.cfg.actionRange - 0.4) act = true;
      } else {
        const available = this.treasures.filter((t) => t.state === 'vault');
        if (available.length) {
          let best = available[0];
          let bd = Infinity;
          for (const t of available) {
            const d = Math.hypot(t.x - a.x, t.z - a.z) + (copNear.agent ? this.copPenalty(t, copNear.agent) : 0);
            if (d < bd) {
              bd = d;
              best = t;
            }
          }
          target = best;
        } else if (jailed > 0 && !copNear.agent) {
          target = MAP.jailDoor;
          if (dist(a, MAP.jailDoor) < this.cfg.actionRange - 0.4) act = true;
        } else {
          target = this.patrolPoint(a);
        }
      }
    } else if (a.role === ROLE.THIEF_SPY) {
      // 密告者: 泥棒に紛れて密告し、運ばれたお宝を奪い返す
      const thieves = this.agents.filter((o) => o !== a && o.role === ROLE.THIEF && o.state === 'free');
      const copNear = this.nearest(a, (o) => o.looks === 'cop' && o.state === 'free', 6);
      if (a.whistleCd <= 0 && thieves.filter((o) => dist(a, o) < this.cfg.whistleRange).length >= 2) {
        this.whistle(a);
      }
      if (this.securedCount > 0) {
        target = MAP.gate;
        if (dist(a, MAP.gate) < this.cfg.returnRange - 0.5) act = true;
      } else if (thieves.length) {
        const leader = thieves.reduce((m, o) => (dist(a, o) < dist(a, m) ? o : m), thieves[0]);
        target = { x: leader.x, z: leader.z };
      } else {
        target = this.patrolPoint(a);
      }
      if (copNear.agent) {
        // 警官から逃げるフリ（泥棒らしく見せる）
        const b = this.bushAt(a, 8);
        if (b >= 0 && a.ai.hideCd <= 0) {
          const bush = MAP.bushes[b];
          target = bush;
          if (Math.hypot(bush.x - a.x, bush.z - a.z) < bush.r && this.hide(a)) {
            a.ai.hideFor = 3 + this.rng() * 2;
          }
        } else {
          target = { x: a.x + (a.x - copNear.agent.x) * 2, z: a.z + (a.z - copNear.agent.z) * 2 };
        }
      }
    }

    let mv = this.moveToward(a, target, dt);
    let dx = mv.mx;
    let dz = mv.mz;
    // 同士との重なりを避ける
    for (const o of this.agents) {
      if (o === a || o.state !== 'free') continue;
      const od = dist(a, o);
      if (od > 0 && od < 1.1) {
        dx += ((a.x - o.x) / od) * 0.45;
        dz += ((a.z - o.z) / od) * 0.45;
      }
    }
    const l = Math.hypot(dx, dz);
    if (l > 1) {
      dx /= l;
      dz /= l;
    }
    return { mx: dx, mz: dz, act };
  }

  /** お宝の周りに警官がいる場合は遠回りする */
  copPenalty(t, cop) {
    const d = Math.hypot(t.x - cop.x, t.z - cop.z);
    return d < 14 ? 26 - d : 0;
  }

  fleePoint(a, threat) {
    let ax = a.x - threat.x;
    let az = a.z - threat.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    return { x: a.x + ax * 8, z: a.z + az * 8 };
  }

  patrolPoint(a) {
    const pts = this.patrol;
    if (dist(a, pts[a.ai.wp]) < 3.0 || a.ai.retarget <= 0) {
      a.ai.wp = (a.ai.wp + 1 + Math.floor(this.rng() * 3)) % pts.length;
      a.ai.retarget = 8 + this.rng() * 6;
    }
    return pts[a.ai.wp];
  }

  get patrol() {
    return [
      { x: -62, z: -53 }, // 銀行前
      { x: 62, z: -53 }, // 宝石店前
      { x: 62, z: -30 }, // 美術館前
      { x: -22, z: -14 }, // 駅前
      { x: -22, z: 22 }, // 公園
      { x: 62, z: 34 }, // 商店街
      { x: 0, z: 60 }, // ゲート前
      { x: -62, z: 46 }, // 警察署前
    ];
  }

  checkWin() {
    if (this.phase !== 'playing') return;
    if (this.securedCount >= this.cfg.treasureRequired) {
      this.finish('thieves', 'お宝をすべて搬出した');
    } else if (this.agents.filter((a) => a.team === 'thief').every((a) => a.state === 'jailed')) {
      this.finish('cops', '泥棒を全員確保した');
    } else if (this.time <= 0) {
      const left = this.securedCount;
      this.finish(
        'cops',
        left > 0 ? `時間切れ・お宝${left}/${this.cfg.treasureRequired}を守りきった` : '時間切れ・お宝をすべて守りきった',
      );
    }
  }

  finish(winner, reason) {
    this.phase = 'ended';
    this.winner = winner;
    this.reason = reason;
    this.pushEvent({
      type: 'end',
      label: winner === 'cops' ? '警察陣営の勝利' : '泥棒陣営の勝利',
    });
  }
}
