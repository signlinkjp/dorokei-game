// DOROKEI 効果音＆BGM — Web Audio API だけで合成する（音声ファイルなし・完全オフライン）
//
// 使い方:
//   const audio = new AudioEngine();
//   audio.play('tap');            // 効果音
//   audio.startMusic();           // チェイスBGM
//   audio.setEnabled(false);      // サウンドON/OFF
//
// iOS はユーザー操作のあとでしか音を出せないので、最初のタップで unlock() する。
// AudioContext が無い環境（Node のテストなど）では何もせず false を返すだけ。

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const SFX_NAMES = Object.freeze([
  'tap',
  'start',
  'pickup',
  'deliver',
  'arrest',
  'unlock',
  'rescue',
  'hideback',
  'expose',
  'hide',
  'search',
  'whistle',
  'win',
  'lose',
]);

/** ゲームのイベント → 効果音名。鳴らさないイベントは null。 */
export function pickSfx(e, playerTeam = null) {
  if (!e || !e.type) return null;
  switch (e.type) {
    case 'pickup':
      return 'pickup';
    case 'deliver':
      return 'deliver';
    case 'arrest':
      return 'arrest';
    case 'unlock':
      return 'unlock';
    case 'rescue':
      return 'rescue';
    case 'hideback':
    case 'return':
      return 'hideback';
    case 'expose':
      return 'expose';
    case 'hide':
    case 'unhide':
      return 'hide';
    case 'search':
      return 'search';
    case 'whistle':
      return 'whistle';
    case 'end': {
      if (!e.winner || !playerTeam) return 'win';
      // エンジンは cops/thieves、エージェントは cop/thief で表す
      const winner = e.winner === 'cops' ? 'cop' : e.winner === 'thieves' ? 'thief' : e.winner;
      return winner === playerTeam ? 'win' : 'lose';
    }
    default:
      return null;
  }
}

export class AudioEngine {
  constructor(opts = {}) {
    this.enabled = opts.enabled !== false;
    this.volume = opts.volume ?? 0.55;
    this.musicVolume = opts.musicVolume ?? 0.16;
    this.available = typeof window !== 'undefined' &&
      !!(window.AudioContext || window.webkitAudioContext);
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuf = null;
    this._musicWanted = false;
    this._musicTimer = null;
    this._stepIndex = 0;
    this._nextNoteTime = 0;
    this._last = new Map();
  }

  /** AudioContext を必要になった時だけ作る（iOS の自動再生制限つき） */
  ensureCtx() {
    if (!this.available) return null;
    if (this.ctx) return this.ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.enabled ? this.volume : 0;
      master.connect(ctx.destination);
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      const musicBus = ctx.createGain();
      musicBus.gain.value = this.musicVolume;
      musicBus.connect(master);

      const len = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.sfxBus = sfxBus;
      this.musicBus = musicBus;
      this.noiseBuf = buf;
      return ctx;
    } catch {
      this.available = false;
      return null;
    }
  }

  /** 最初のタップで呼ぶ。iOS で音を出すための解錠。 */
  unlock() {
    const ctx = this.ensureCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume?.();
    return true;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
    if (this.enabled && this._musicWanted) this._startScheduler();
    else if (!this.enabled) this._stopScheduler();
  }

  // ---- 合成の基本パーツ -------------------------------------------------
  tone(freq, { to = null, dur = 0.16, type = 'sine', gain = 0.22, at = 0, attack = 0.006 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.12, gain = 0.12, at = 0, hp = 300, lp = 7000, sweepTo = null } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuf) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(lp, t0);
    if (sweepTo) lpf.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** 音符の並びをまとめて鳴らす [midi, offsetSec, durSec] */
  seq(notes, { type = 'triangle', gain = 0.2, dur = 0.14 } = {}) {
    for (const [n, at, d] of notes) {
      this.tone(midi(n), { type, gain, dur: d ?? dur, at });
    }
  }

  // ---- 効果音 -----------------------------------------------------------
  play(name) {
    if (!this.enabled) return false;
    const ctx = this.ensureCtx();
    if (!ctx || !this.sfxBus) return false;
    if (ctx.state === 'suspended') ctx.resume?.();
    const now = ctx.currentTime;
    const last = this._last.get(name) ?? -1;
    if (now - last < 0.035) return false;
    this._last.set(name, now);

    switch (name) {
      case 'tap':
        this.tone(1180, { type: 'square', gain: 0.09, dur: 0.05 });
        this.tone(1760, { type: 'sine', gain: 0.05, dur: 0.05, at: 0.012 });
        break;
      case 'start':
        this.seq([
          [72, 0, 0.1], [76, 0.09, 0.1], [79, 0.18, 0.1], [84, 0.27, 0.26],
        ], { type: 'triangle', gain: 0.22 });
        this.noise({ dur: 0.3, gain: 0.06, at: 0.27, hp: 2000 });
        this.tone(midi(48), { type: 'sine', gain: 0.16, dur: 0.34, at: 0.27 });
        break;
      case 'pickup':
        this.seq([[88, 0, 0.08], [95, 0.07, 0.16]], { type: 'sine', gain: 0.18 });
        this.noise({ dur: 0.1, gain: 0.05, at: 0.02, hp: 4000 });
        break;
      case 'deliver':
        this.seq([
          [72, 0, 0.09], [76, 0.08, 0.09], [79, 0.16, 0.09], [84, 0.24, 0.24], [88, 0.33, 0.2],
        ], { type: 'triangle', gain: 0.2 });
        this.noise({ dur: 0.2, gain: 0.05, at: 0.24, hp: 3000 });
        break;
      case 'arrest':
        // パトカーのサイレン風（上がって下がる）
        this.tone(620, { to: 1180, type: 'sawtooth', gain: 0.12, dur: 0.28 });
        this.tone(1180, { to: 620, type: 'sawtooth', gain: 0.12, dur: 0.28, at: 0.26 });
        this.tone(midi(45), { type: 'sine', gain: 0.14, dur: 0.2, at: 0.5 });
        this.noise({ dur: 0.12, gain: 0.05, at: 0.5, hp: 800 });
        break;
      case 'unlock': {
        // 金属の音＋ガチャ
        for (let i = 0; i < 3; i++) {
          this.noise({ dur: 0.05, gain: 0.1, at: i * 0.06, hp: 2200 });
        }
        this.tone(320, { to: 210, type: 'square', gain: 0.1, dur: 0.16, at: 0.04 });
        this.seq([[67, 0.14, 0.08], [74, 0.22, 0.16]], { type: 'triangle', gain: 0.14 });
        break;
      }
      case 'rescue':
        this.seq([[69, 0, 0.09], [72, 0.08, 0.09], [76, 0.16, 0.2]], { type: 'triangle', gain: 0.18 });
        break;
      case 'hideback':
        this.tone(520, { to: 160, type: 'sine', gain: 0.14, dur: 0.3 });
        this.noise({ dur: 0.24, gain: 0.07, lp: 5000, sweepTo: 400 });
        break;
      case 'expose':
        // 警告ブザー
        for (let i = 0; i < 3; i++) {
          this.tone(980, { type: 'square', gain: 0.1, dur: 0.1, at: i * 0.16 });
          this.tone(660, { type: 'square', gain: 0.1, dur: 0.1, at: i * 0.16 + 0.08 });
        }
        break;
      case 'hide':
        // 葉っぱのガサガサ＋低い音
        this.noise({ dur: 0.22, gain: 0.08, hp: 1200, lp: 6500 });
        this.tone(210, { to: 150, type: 'sine', gain: 0.1, dur: 0.18 });
        break;
      case 'search':
        // 波紋が広がる音（上昇スイープ＋ピン）
        this.tone(300, { to: 900, type: 'sine', gain: 0.12, dur: 0.22 });
        this.noise({ dur: 0.18, gain: 0.06, hp: 1500, lp: 9000 });
        this.tone(1320, { type: 'sine', gain: 0.09, dur: 0.16, at: 0.2 });
        this.tone(990, { type: 'sine', gain: 0.07, dur: 0.14, at: 0.26 });
        break;
      case 'whistle':
        this.tone(1500, { to: 2100, type: 'sine', gain: 0.1, dur: 0.12 });
        this.tone(2100, { to: 1500, type: 'sine', gain: 0.1, dur: 0.14, at: 0.14 });
        break;
      case 'win':
        this.seq([
          [72, 0, 0.16], [76, 0.14, 0.16], [79, 0.28, 0.16], [84, 0.42, 0.3],
          [79, 0.58, 0.12], [84, 0.7, 0.42],
        ], { type: 'triangle', gain: 0.22 });
        this.tone(midi(48), { type: 'sine', gain: 0.16, dur: 0.6, at: 0.42 });
        break;
      case 'lose':
        this.seq([
          [69, 0, 0.18], [65, 0.16, 0.18], [62, 0.32, 0.18], [57, 0.48, 0.4],
        ], { type: 'triangle', gain: 0.2 });
        this.tone(midi(45), { type: 'sine', gain: 0.14, dur: 0.5, at: 0.48 });
        break;
      default:
        return false;
    }
    return true;
  }

  // ---- BGM（軽快なチェイス） -------------------------------------------
  startMusic() {
    this._musicWanted = true;
    if (!this.enabled) return;
    this.ensureCtx();
    this._startScheduler();
  }

  stopMusic() {
    this._musicWanted = false;
    this._stopScheduler();
  }

  _startScheduler() {
    if (!this.available || this._musicTimer) return;
    if (!this.ctx) return;
    this._nextNoteTime = this.ctx.currentTime + 0.06;
    this._musicTimer = setInterval(() => this._schedule(), 80);
    this._schedule();
  }

  _stopScheduler() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this._musicWanted || !this.enabled) return;
    // iOS はタップまでは suspended。その間に音符を作らない（警告を増やさない）
    if (ctx.state !== 'running') {
      this._nextNoteTime = ctx.currentTime + 0.06;
      return;
    }
    const eighth = 60 / 138 / 2;
    let guard = 0;
    while (this._nextNoteTime < ctx.currentTime + 0.28 && guard++ < 32) {
      this._musicNote(this._stepIndex, this._nextNoteTime);
      this._stepIndex = (this._stepIndex + 1) % 32;
      this._nextNoteTime += eighth;
    }
  }

  _musicNote(step, time) {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const at = Math.max(0, time - ctx.currentTime);
    const bar = Math.floor(step / 8) % 4;
    const roots = [45, 41, 48, 43]; // Am / F / C / G
    const root = roots[bar];
    const bassPat = [0, 0, 12, 0, 7, 0, 12, 7];
    const arpPat = [12, 19, 24, 19, 15, 19, 24, 27];

    const note = (n, dur, type, gain) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t0 = ctx.currentTime + at;
      osc.type = type;
      osc.frequency.value = midi(n);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.musicBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };

    if (step % 2 === 0) note(root + bassPat[step % 8], 0.16, 'sawtooth', 0.16);
    note(root + arpPat[step % 8], 0.1, 'triangle', 0.07);
    if (step % 4 === 2) {
      // ハイハット
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.musicBus);
      src.start(t0);
      src.stop(t0 + 0.07);
    }
  }
}
