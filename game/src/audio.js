// Procedural sound: every effect and the synthwave loop are synthesised with
// the Web Audio API, so the game ships no audio files and plays fully offline.
// The engine hum follows car speed, the siren wails near police, and the music
// is a looping bass-and-pad pattern in A minor. M toggles the mute.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.step = 0;
  }

  /** Create the context on the first user gesture (browsers require it). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startSiren();
    this.startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  startSiren() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  /** Engine pitch follows speed; siren volume follows police proximity. */
  updateDriving(speed, sirenLevel) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(Math.min(0.16, Math.abs(speed) / 220), t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 3.2, t, 0.1);
    this.sirenGain.gain.setTargetAtTime(Math.min(0.07, sirenLevel * 0.07), t, 0.2);
    this.sirenOsc.frequency.setValueAtTime(Math.sin(t * 6) > 0 ? 880 : 660, t);
  }

  blip(freq, duration, type = 'square', volume = 0.12) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  noise(duration, volume = 0.2, freq = 1200) {
    if (!this.ctx) return;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  shoot() { this.noise(0.12, 0.25, 2400); this.blip(180, 0.08, 'square', 0.1); }
  punch() { this.noise(0.08, 0.18, 500); }
  hit() { this.blip(140, 0.15, 'sawtooth', 0.14); }
  pickup() { this.blip(880, 0.12, 'sine', 0.14); this.blip(1320, 0.18, 'sine', 0.12); }
  cash() { this.blip(1046, 0.1, 'square', 0.1); setTimeout(() => this.blip(1568, 0.16, 'square', 0.1), 90); }
  mission() {
    this.blip(523, 0.14, 'square', 0.12);
    setTimeout(() => this.blip(659, 0.14, 'square', 0.12), 120);
    setTimeout(() => this.blip(784, 0.24, 'square', 0.12), 240);
  }
  busted() { this.blip(392, 0.3, 'sawtooth', 0.14); setTimeout(() => this.blip(262, 0.5, 'sawtooth', 0.14), 260); }
  door() { this.noise(0.06, 0.12, 800); }

  /** A tiny synthwave loop: bass pulse plus a soft pad chord each bar. */
  startMusic() {
    const bassLine = [55, 55, 65.4, 55, 82.4, 55, 98, 73.4];
    const pad = [220, 261.6, 329.6];
    const tick = () => {
      if (!this.ctx) return;
      const i = this.step % bassLine.length;
      this.blip(bassLine[i], 0.22, 'sawtooth', 0.05);
      if (i === 0) {
        for (const f of pad) this.blip(f, 1.6, 'sine', 0.028);
      }
      this.step += 1;
    };
    tick();
    this.musicTimer = setInterval(tick, 300);
  }
}
