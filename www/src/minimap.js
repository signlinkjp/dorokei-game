// DOROKEI ミニマップ（タクティカルレーダー）
// 広い街で迷わないように、街の形・お宝・ゲート・牢屋・近くの相手を右上に表示する。
import { MAP, ROLE } from './core.js';

const CSS_W = 152; // 表示サイズ（CSS px）
const RADAR_RANGE = 27; // 敵が見える距離（m）

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(CSS_W * this.dpr);
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = `${CSS_W}px`;
    canvas.style.height = `${CSS_W}px`;
    this.size = px;
    this.base = document.createElement('canvas');
    this.base.width = px;
    this.base.height = px;
    this.buildBase();
  }

  // ワールド座標 → ミニマップ座標
  tx(x) {
    const b = MAP.bounds;
    return ((x - b.minX) / (b.maxX - b.minX)) * this.size;
  }

  tz(z) {
    const b = MAP.bounds;
    return ((z - b.minZ) / (b.maxZ - b.minZ)) * this.size;
  }

  scaleM(m) {
    return (m / (MAP.bounds.maxX - MAP.bounds.minX)) * this.size;
  }

  buildBase() {
    const g = this.base.getContext('2d');
    const S = this.size;
    g.clearRect(0, 0, S, S);

    // 地面
    g.fillStyle = '#8ed07e';
    g.fillRect(0, 0, S, S);

    // 公園
    g.fillStyle = '#6cc46a';
    g.beginPath();
    g.arc(this.tx(-22), this.tz(22), this.scaleM(18), 0, Math.PI * 2);
    g.fill();

    // 道路
    g.fillStyle = '#c8d4e2';
    for (const r of MAP.roads) {
      g.fillRect(
        this.tx(r.x - r.w / 2),
        this.tz(r.z - r.d / 2),
        this.scaleM(r.w),
        this.scaleM(r.d),
      );
    }

    // 建物
    for (const o of MAP.obstacles) {
      if (o.kind === 'car') continue;
      const x = this.tx(o.x - o.w / 2);
      const y = this.tz(o.z - o.d / 2);
      const w = this.scaleM(o.w);
      const h = this.scaleM(o.d);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#8fa4bd';
      g.lineWidth = Math.max(1, this.dpr * 0.8);
      g.strokeRect(x, y, w, h);
    }

    // 牢屋
    const jail = MAP.jail;
    g.fillStyle = '#e8eef7';
    g.fillRect(
      this.tx(jail.x - jail.w / 2),
      this.tz(jail.z - jail.d / 2),
      this.scaleM(jail.w),
      this.scaleM(jail.d),
    );
    g.strokeStyle = '#2f6fd8';
    g.lineWidth = Math.max(1.4, this.dpr);
    g.strokeRect(
      this.tx(jail.x - jail.w / 2),
      this.tz(jail.z - jail.d / 2),
      this.scaleM(jail.w),
      this.scaleM(jail.d),
    );

    // 脱出ゲート
    const gate = MAP.gate;
    g.fillStyle = '#39c98a';
    g.fillRect(
      this.tx(gate.x - gate.w / 2),
      this.tz(gate.z - gate.d / 2),
      this.scaleM(gate.w),
      this.scaleM(gate.d),
    );
  }

  dot(g, x, z, r, fill, stroke) {
    g.beginPath();
    g.arc(this.tx(x), this.tz(z), r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.lineWidth = this.dpr * 1.1;
      g.strokeStyle = stroke;
      g.stroke();
    }
  }

  draw(game) {
    const g = this.ctx;
    const S = this.size;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.base, 0, 0);

    // お宝（まだ運ばれていないもの）
    for (const t of game.treasures) {
      if (t.state === 'vault') {
        const x = this.tx(t.x);
        const y = this.tz(t.z);
        g.beginPath();
        g.moveTo(x, y - 3.6 * this.dpr);
        g.lineTo(x + 3.6 * this.dpr, y);
        g.lineTo(x, y + 3.6 * this.dpr);
        g.lineTo(x - 3.6 * this.dpr, y);
        g.closePath();
        g.fillStyle = '#ffc63a';
        g.fill();
        g.strokeStyle = '#8a5c00';
        g.lineWidth = this.dpr * 0.8;
        g.stroke();
      }
    }

    // 密告ピン
    for (const p of game.pings) {
      g.beginPath();
      g.arc(this.tx(p.x), this.tz(p.z), 5 * this.dpr, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,77,109,0.9)';
      g.lineWidth = this.dpr * 1.6;
      g.stroke();
    }

    const player = game.player;
    if (!player) return;

    // 仲間と近くの相手
    for (const a of game.agents) {
      if (a === player) continue;
      if (a.state === 'jailed') {
        this.dot(g, a.x, a.z, 2.2 * this.dpr, 'rgba(120,130,150,0.9)');
        continue;
      }
      const sameLook = a.looks === player.looks;
      const d = Math.hypot(a.x - player.x, a.z - player.z);
      if (!sameLook && (d > RADAR_RANGE || !game.canSee(player, a))) continue;
      if (a.hidden && d > game.cfg.hideReveal) continue;
      const color = a.looks === 'cop' ? '#2f6fd8' : '#ff8a4c';
      this.dot(g, a.x, a.z, 2.6 * this.dpr, color, sameLook ? 'rgba(255,255,255,0.85)' : null);
      if (a.carrying != null) {
        g.beginPath();
        g.arc(this.tx(a.x), this.tz(a.z), 4.6 * this.dpr, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,198,58,0.95)';
        g.lineWidth = this.dpr * 1.3;
        g.stroke();
      }
      if (a.exposed) {
        g.beginPath();
        g.arc(this.tx(a.x), this.tz(a.z), 4.4 * this.dpr, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(214,40,40,0.95)';
        g.lineWidth = this.dpr * 1.3;
        g.stroke();
      }
    }

    // プレイヤー（向き付き）
    const px = this.tx(player.x);
    const py = this.tz(player.z);
    const dir = player.dir || 0;
    const r = 5.2 * this.dpr;
    g.save();
    g.translate(px, py);
    g.rotate(-dir + Math.PI);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.78, r * 0.78);
    g.lineTo(0, r * 0.34);
    g.lineTo(-r * 0.78, r * 0.78);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = '#1b4a9c';
    g.lineWidth = this.dpr * 1.3;
    g.stroke();
    g.restore();

    // 縁取り
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = this.dpr * 1.2;
    g.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}

export { ROLE };
