class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private volume = 0.6;

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.01) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setConfig(muted: boolean, volume: number) {
    this.muted = muted;
    this.volume = Math.max(0, Math.min(1, volume));
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainLevel = 0.2,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    const peak = Math.max(0.001, gainLevel * this.volume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    // Tactile arcade switch + bright upward bubble pop
    this.tone(420, 760, 0.042, 'sine', 0.15);
    this.tone(1180, 520, 0.022, 'triangle', 0.08, 0.004);
  }

  playPop() {
    // Playful bubble-pop for chat messages & quick picks
    this.tone(360, 960, 0.058, 'sine', 0.16);
    this.tone(960, 1240, 0.035, 'triangle', 0.08, 0.025);
  }

  playSwap() {
    this.tone(440, 660, 0.075, 'triangle', 0.15);
    this.tone(660, 990, 0.09, 'sine', 0.14, 0.045);
  }

  playChessMove() {
    // Crisp wooden board clack
    this.tone(220, 105, 0.068, 'triangle', 0.22);
    this.tone(1050, 380, 0.02, 'sine', 0.09);
  }

  playChessCapture() {
    this.tone(380, 110, 0.11, 'sawtooth', 0.15);
    this.tone(190, 75, 0.14, 'triangle', 0.22, 0.015);
  }

  playCheck() {
    this.tone(659.25, 880, 0.11, 'triangle', 0.16);
    this.tone(987.77, 1174.66, 0.15, 'sine', 0.14, 0.06);
  }

  playWoodHit(intensity = 1) {
    const clamped = Math.max(0.2, Math.min(1.5, intensity));
    this.tone(340 * (0.9 + clamped * 0.2), 120, 0.055, 'triangle', 0.18 * clamped);
    this.tone(1250, 620, 0.018, 'sine', 0.07 * clamped);
  }

  playPocket() {
    this.tone(480, 740, 0.09, 'sine', 0.18);
    this.tone(740, 1120, 0.13, 'triangle', 0.16, 0.055);
  }

  playFoul() {
    this.tone(240, 145, 0.18, 'sawtooth', 0.14);
    this.tone(180, 105, 0.22, 'triangle', 0.16, 0.08);
  }

  playKick(power = 1) {
    const p = Math.max(0.5, Math.min(1.5, power));
    this.tone(195 * p, 52, 0.11, 'triangle', 0.28);
    this.tone(420, 140, 0.03, 'sine', 0.09);
  }

  playBounce() {
    this.tone(230, 360, 0.045, 'sine', 0.14);
  }

  playPowerUp() {
    this.tone(523.25, 659.25, 0.08, 'sine', 0.15);
    this.tone(659.25, 783.99, 0.08, 'sine', 0.15, 0.055);
    this.tone(783.99, 1046.5, 0.14, 'triangle', 0.17, 0.11);
  }

  playGoalHorn() {
    this.tone(220, 223, 0.45, 'sawtooth', 0.14);
    this.tone(277.18, 280, 0.45, 'sawtooth', 0.13);
    this.tone(329.63, 332, 0.52, 'triangle', 0.18, 0.04);
  }

  playSwordSlash() {
    this.tone(640, 160, 0.14, 'sawtooth', 0.18);
    this.tone(320, 90, 0.12, 'square', 0.1, 0.03);
  }

  playSpellCast() {
    this.tone(440, 980, 0.22, 'sine', 0.16);
    this.tone(660, 1320, 0.24, 'triangle', 0.12, 0.06);
  }

  playHeal() {
    this.tone(523, 659, 0.16, 'sine', 0.16);
    this.tone(659, 880, 0.22, 'sine', 0.16, 0.09);
  }

  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((n, idx) => {
      this.tone(n, n * 1.01, 0.22, idx % 2 === 0 ? 'triangle' : 'sine', 0.17, idx * 0.08);
    });
  }
}

export const sound = new SoundEngine();
