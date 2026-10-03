/**
 * Procedural audio: generative music (Karplus-Strong "oud"/harp plucks,
 * breathy flute, drones and frame drums in ancient Near-Eastern modes),
 * synthesized sound effects, looping ambiences, and microphone level input.
 * No audio files are needed.
 */

export const SCALES = {
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  majorPent: [0, 2, 4, 7, 9],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minorPent: [0, 3, 5, 7, 10],
} as const;

export interface MusicTheme {
  root: number;
  scale: readonly number[];
  bpm: number;
  instrument: 'oud' | 'harp' | 'flute' | 'bell';
  drone: number;
  drums: 'none' | 'frame' | 'march' | 'soft';
  density: number;
}

export type Sfx =
  | 'step'
  | 'pickup'
  | 'chime'
  | 'success'
  | 'fanfare'
  | 'error'
  | 'click'
  | 'whoosh'
  | 'thunder'
  | 'splash'
  | 'shofar'
  | 'roar'
  | 'stone'
  | 'thud'
  | 'rumble'
  | 'cheer'
  | 'bleat'
  | 'sling'
  | 'page'
  | 'door'
  | 'bird'
  | 'gate'
  | 'blip'
  | 'heart'
  | 'drum';

export type AmbientName = 'rain' | 'wind' | 'waves' | 'crowd' | 'night' | 'fire' | 'stream';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private pluckCache = new Map<string, AudioBuffer>();
  private theme: MusicTheme | null = null;
  private themeGain: GainNode | null = null;
  private droneNodes: { stop: () => void } | null = null;
  private nextStep = 0;
  private step = 0;
  private melodyIdx = 7;
  private ambients = new Map<AmbientName, { gain: GainNode; stop: () => void }>();
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private musicVol = 0.6;
  private sfxVol = 0.8;

  /** Must be called from a user gesture (click/tap/key) the first time. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.ambBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.ambBus.connect(this.master);
      this.setVolumes(this.musicVol, this.sfxVol);
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
      if (this.theme) this.startTheme(this.theme);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.value = music * 0.55;
    this.sfxBus.gain.value = sfx;
    this.ambBus.gain.value = sfx * 0.7;
  }

  // ---------------------------------------------------------------- music

  playMusic(theme: MusicTheme | null): void {
    if (this.theme === theme) return;
    this.theme = theme;
    if (!this.ctx) return;
    this.stopTheme();
    if (theme) this.startTheme(theme);
  }

  private stopTheme(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.themeGain) {
      const g = this.themeGain;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => g.disconnect(), 1800);
    }
    this.droneNodes?.stop();
    this.droneNodes = null;
    this.themeGain = null;
  }

  private startTheme(theme: MusicTheme): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    g.connect(this.musicBus);
    this.themeGain = g;
    this.nextStep = ctx.currentTime + 0.3;
    this.step = 0;
    if (theme.drone > 0) this.droneNodes = this.makeDrone(theme, g);
  }

  private makeDrone(theme: MusicTheme, out: GainNode): { stop: () => void } {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(theme.drone * 0.12, ctx.currentTime + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(filter.frequency);
    const oscs = [0, 7, 12].map((iv, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'sawtooth';
      o.frequency.value = mtof(theme.root - 24 + iv);
      o.detune.value = (i - 1) * 6;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(g).connect(out);
    lfo.start();
    return {
      stop: () => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 1.5);
        setTimeout(() => {
          oscs.forEach((o) => o.stop());
          lfo.stop();
          g.disconnect();
        }, 1700);
      },
    };
  }

  /** Schedule upcoming music steps. Call every frame. */
  update(): void {
    const ctx = this.ctx;
    const theme = this.theme;
    if (!ctx || !theme || !this.themeGain || ctx.state !== 'running') return;
    const stepDur = 60 / theme.bpm / 2;
    if (this.nextStep < ctx.currentTime - 1) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.25) {
      this.scheduleStep(theme, this.nextStep, stepDur);
      this.nextStep += stepDur;
      this.step++;
    }
  }

  private scheduleStep(theme: MusicTheme, t: number, stepDur: number): void {
    const s = this.step % 16;
    const out = this.themeGain!;
    // Drums
    if (theme.drums === 'frame') {
      const pat = ['D', '', 't', '', 'D', 'D', 't', '', 'D', '', 't', '', 'D', '', 't', 't'];
      if (pat[s] === 'D') this.drum(t, out, 0.5, false);
      else if (pat[s] === 't') this.drum(t, out, 0.22, true);
    } else if (theme.drums === 'march') {
      if (s % 4 === 0) this.drum(t, out, 0.55, false);
      else if (s % 4 === 2) this.drum(t, out, 0.18, true);
    } else if (theme.drums === 'soft' && s % 8 === 0) {
      this.drum(t, out, 0.25, false);
    }
    // Melody: a wandering line in phrases of 16 steps with breathing space.
    const phrasePos = this.step % 32;
    const resting = phrasePos >= 26;
    if (!resting && Math.random() < theme.density) {
      const sc = theme.scale;
      const r = Math.random();
      this.melodyIdx += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.94 ? -2 : 0;
      this.melodyIdx = Math.max(0, Math.min(sc.length * 2, this.melodyIdx));
      if (phrasePos === 25) this.melodyIdx = sc.length; // land on the tonic
      const oct = Math.floor(this.melodyIdx / sc.length);
      const midi = theme.root + oct * 12 + sc[this.melodyIdx % sc.length];
      const len = stepDur * (Math.random() < 0.3 ? 3 : 1.6);
      this.note(theme.instrument, midi, t, len, 0.32, out);
    }
    // Low root on bar starts
    if (s === 0 && theme.instrument !== 'flute') this.note('harp', theme.root - 12, t, stepDur * 6, 0.22, out);
  }

  private drum(t: number, out: AudioNode, vol: number, slap: boolean): void {
    const ctx = this.ctx!;
    if (slap) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + 0.12);
      return;
    }
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  private pluckBuffer(midi: number, bright: number): AudioBuffer {
    const key = `${midi}:${bright}`;
    const hit = this.pluckCache.get(key);
    if (hit) return hit;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const dur = 2.2;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / mtof(midi)));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    const decay = 0.4985 + bright * 0.0012;
    for (let i = 0; i < d.length; i++) {
      const next = (idx + 1) % period;
      const v = ring[idx];
      ring[idx] = (v + ring[next]) * decay;
      d[i] = v;
      idx = next;
    }
    this.pluckCache.set(key, buf);
    return buf;
  }

  private note(
    inst: MusicTheme['instrument'],
    midi: number,
    t: number,
    len: number,
    vol: number,
    out: AudioNode,
  ): void {
    const ctx = this.ctx!;
    if (inst === 'oud' || inst === 'harp') {
      const src = ctx.createBufferSource();
      src.buffer = this.pluckBuffer(midi, inst === 'harp' ? 1 : 0);
      const g = ctx.createGain();
      g.gain.value = vol * (inst === 'oud' ? 1.1 : 0.9);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = inst === 'oud' ? 2600 : 5000;
      src.connect(f).connect(g).connect(out);
      src.start(t);
      src.stop(t + 2.2);
    } else if (inst === 'flute') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(midi);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ctx.createGain();
      vg.gain.value = mtof(midi) * 0.006;
      vib.connect(vg).connect(o.frequency);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = mtof(midi) * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.09);
      g.gain.setValueAtTime(vol * 0.45, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.35);
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(out);
      [o, o2, vib].forEach((n) => {
        n.start(t);
        n.stop(t + len + 0.4);
      });
    } else {
      // bell: two inharmonic sines
      [1, 2.76].forEach((ratio, i) => {
        const o = ctx.createOscillator();
        o.frequency.value = mtof(midi) * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol * (i ? 0.25 : 0.5), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 1.7);
      });
    }
  }

  // ---------------------------------------------------------------- sfx

  play(name: Sfx, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const out = this.sfxBus;
    const noise = (dur: number, type: BiquadFilterType, freq: number, q: number, v: number, f2?: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v * vol, t + Math.min(0.03, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.05);
    };
    const tone = (
      freq: number,
      dur: number,
      v: number,
      type: OscillatorType = 'sine',
      at = 0,
      freqEnd?: number,
    ) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + at);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(v * vol, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    const pluck = (midi: number, at: number, v: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.pluckBuffer(midi, 1);
      const g = ctx.createGain();
      g.gain.value = v * vol;
      src.connect(g).connect(out);
      src.start(t + at);
      src.stop(t + at + 2);
    };
    switch (name) {
      case 'step':
        noise(0.08, 'lowpass', 500 + Math.random() * 300, 0.8, 0.12);
        break;
      case 'pickup':
        tone(1318, 0.25, 0.25, 'sine');
        tone(1976, 0.4, 0.22, 'sine', 0.08);
        break;
      case 'chime':
        [84, 88, 91, 96].forEach((m, i) => tone(mtof(m), 0.9, 0.12, 'sine', i * 0.07));
        break;
      case 'success':
        [67, 71, 74, 79].forEach((m, i) => pluck(m, i * 0.09, 0.5));
        tone(mtof(91), 1.2, 0.1, 'sine', 0.36);
        break;
      case 'fanfare':
        [
          [60, 0],
          [64, 0.18],
          [67, 0.36],
          [72, 0.54],
        ].forEach(([m, at]) => tone(mtof(m), 0.6, 0.12, 'sawtooth', at));
        [72, 76, 79].forEach((m) => tone(mtof(m), 1.4, 0.07, 'triangle', 0.72));
        break;
      case 'error':
        tone(220, 0.18, 0.15, 'triangle');
        tone(185, 0.25, 0.15, 'triangle', 0.14);
        break;
      case 'click':
        tone(1800, 0.04, 0.08, 'square');
        break;
      case 'blip':
        tone(900 + Math.random() * 120, 0.03, 0.03, 'triangle');
        break;
      case 'whoosh':
        noise(0.6, 'bandpass', 300, 2, 0.5, 3000);
        break;
      case 'thunder':
        noise(3.5, 'lowpass', 900, 0.5, 0.9, 60);
        tone(45, 2.5, 0.4, 'sine');
        break;
      case 'splash':
        noise(0.7, 'highpass', 900, 0.5, 0.6, 3000);
        break;
      case 'shofar': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t);
        o.frequency.linearRampToValueAtTime(330, t + 0.25);
        o.frequency.setValueAtTime(330, t + 1.4);
        o.frequency.linearRampToValueAtTime(440, t + 1.6);
        const vib = ctx.createOscillator();
        vib.frequency.value = 6;
        const vg = ctx.createGain();
        vg.gain.value = 4;
        vib.connect(vg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.2);
        g.gain.setValueAtTime(0.5 * vol, t + 2.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        o.connect(f).connect(g).connect(out);
        [o, vib].forEach((n) => {
          n.start(t);
          n.stop(t + 2.7);
        });
        break;
      }
      case 'roar':
        noise(1.6, 'lowpass', 600, 2, 0.8, 200);
        tone(90, 1.4, 0.35, 'sawtooth', 0, 60);
        break;
      case 'stone':
        noise(0.06, 'highpass', 2500, 1, 0.4);
        tone(160, 0.2, 0.4, 'sine', 0, 60);
        break;
      case 'thud':
        tone(110, 0.5, 0.7, 'sine', 0, 40);
        noise(0.4, 'lowpass', 400, 1, 0.5);
        break;
      case 'rumble':
        noise(4, 'lowpass', 300, 0.7, 1, 50);
        tone(38, 3.5, 0.5, 'sine');
        break;
      case 'cheer':
        for (let i = 0; i < 6; i++) {
          const f = 500 + Math.random() * 900;
          noise(1.4 + Math.random(), 'bandpass', f, 3, 0.18, f * 1.4);
        }
        break;
      case 'bleat': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 380 + Math.random() * 60;
        const trem = ctx.createOscillator();
        trem.frequency.value = 22;
        const tg = ctx.createGain();
        tg.gain.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        trem.connect(tg).connect(g.gain);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1100;
        o.connect(f).connect(g).connect(out);
        [o, trem].forEach((n) => {
          n.start(t);
          n.stop(t + 0.65);
        });
        break;
      }
      case 'sling':
        noise(0.25, 'bandpass', 600, 4, 0.3, 2400);
        break;
      case 'page':
        noise(0.18, 'bandpass', 3500, 1, 0.25);
        break;
      case 'door':
        tone(70, 0.6, 0.6, 'sine', 0, 50);
        noise(0.5, 'lowpass', 300, 1, 0.5);
        break;
      case 'bird':
        tone(2400, 0.08, 0.08, 'sine', 0, 3400);
        tone(2600, 0.08, 0.08, 'sine', 0.12, 3800);
        break;
      case 'gate':
        [60, 67, 72, 76, 79].forEach((m, i) => tone(mtof(m), 2.2, 0.06, 'sine', i * 0.05));
        noise(1.5, 'bandpass', 800, 1, 0.15, 4000);
        break;
      case 'heart':
        tone(60, 0.15, 0.6, 'sine');
        tone(55, 0.18, 0.5, 'sine', 0.2);
        break;
      case 'drum':
        this.drum(t, out, 0.6 * vol, false);
        break;
    }
  }

  // ---------------------------------------------------------------- ambience

  setAmbient(name: AmbientName, level: number, fade = 1.5): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let a = this.ambients.get(name);
    if (!a && level <= 0) return;
    if (!a) {
      a = this.makeAmbient(name);
      this.ambients.set(name, a);
    }
    const t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(Math.max(0, level), t + fade);
  }

  stopAllAmbient(fade = 1): void {
    for (const name of this.ambients.keys()) this.setAmbient(name, 0, fade);
  }

  private makeAmbient(name: AmbientName): { gain: GainNode; stop: () => void } {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.ambBus);
    const nodes: (AudioScheduledSourceNode)[] = [];
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    nodes.push(src);
    const lfo = (freq: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      nodes.push(o);
    };
    const f1 = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    amp.gain.value = 1;
    switch (name) {
      case 'rain':
        f1.type = 'highpass';
        f1.frequency.value = 600;
        amp.gain.value = 0.35;
        break;
      case 'stream':
        f1.type = 'bandpass';
        f1.frequency.value = 1800;
        f1.Q.value = 0.6;
        amp.gain.value = 0.18;
        lfo(3.1, 0.05, amp.gain);
        break;
      case 'wind':
        f1.type = 'bandpass';
        f1.frequency.value = 420;
        f1.Q.value = 0.8;
        amp.gain.value = 0.5;
        lfo(0.09, 200, f1.frequency);
        lfo(0.13, 0.25, amp.gain);
        break;
      case 'waves':
        f1.type = 'lowpass';
        f1.frequency.value = 700;
        amp.gain.value = 0.45;
        lfo(0.11, 0.35, amp.gain);
        break;
      case 'crowd':
        f1.type = 'bandpass';
        f1.frequency.value = 700;
        f1.Q.value = 1.4;
        amp.gain.value = 0.4;
        lfo(0.7, 0.12, amp.gain);
        lfo(0.23, 180, f1.frequency);
        break;
      case 'fire':
        f1.type = 'lowpass';
        f1.frequency.value = 1400;
        amp.gain.value = 0.18;
        lfo(7, 0.08, amp.gain);
        break;
      case 'night': {
        f1.type = 'highpass';
        f1.frequency.value = 6000;
        amp.gain.value = 0.02;
        const cr = ctx.createOscillator();
        cr.frequency.value = 4600;
        const crg = ctx.createGain();
        crg.gain.value = 0;
        const pulse = ctx.createOscillator();
        pulse.type = 'square';
        pulse.frequency.value = 28;
        const pg = ctx.createGain();
        pg.gain.value = 0.012;
        const slow = ctx.createOscillator();
        slow.type = 'square';
        slow.frequency.value = 0.9;
        const sg = ctx.createGain();
        sg.gain.value = 0.012;
        pulse.connect(pg).connect(crg.gain);
        slow.connect(sg).connect(crg.gain);
        cr.connect(crg).connect(gain);
        nodes.push(cr, pulse, slow);
        break;
      }
    }
    src.connect(f1).connect(amp).connect(gain);
    nodes.forEach((n) => n.start());
    return {
      gain,
      stop: () => nodes.forEach((n) => n.stop()),
    };
  }

  // ---------------------------------------------------------------- mic

  get micSupported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  /** Ask for the microphone; resolves to a function returning level 0..1. */
  async startMic(): Promise<() => number> {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || !this.micSupported) throw new Error('Microphone not available');
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    const src = ctx.createMediaStreamSource(this.micStream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    this.micAnalyser = an;
    const data = new Float32Array(an.fftSize);
    return () => {
      if (!this.micAnalyser) return 0;
      this.micAnalyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      return Math.min(1, rms * 5);
    };
  }

  stopMic(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.micAnalyser = null;
  }
}

export const audio = new AudioEngine();
