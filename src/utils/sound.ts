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
    this.tone(540, 320, 0.06, 'triangle', 0.14);
  }

  playSwap() {
    this.tone(420, 660, 0.09, 'sine', 0.14);
    this.tone(660, 840, 0.09, 'sine', 0.12, 0.06);
  }

  playChessMove() {
    this.tone(240, 140, 0.08, 'triangle', 0.22);
  }

  playChessCapture() {
    this.tone(360, 110, 0.12, 'sawtooth', 0.18);
    this.tone(180, 90, 0.14, 'triangle', 0.2, 0.02);
  }

  playCheck() {
    this.tone(587, 880, 0.14, 'square', 0.12);
  }

  playWoodHit(intensity = 1) {
    const clamped = Math.max(0.2, Math.min(1.5, intensity));
    this.tone(310 * (0.9 + clamped * 0.2), 110, 0.065, 'triangle', 0.18 * clamped);
  }

  playPocket() {
    this.tone(520, 780, 0.11, 'sine', 0.2);
    this.tone(780, 1040, 0.14, 'sine', 0.16, 0.07);
  }

  playFoul() {
    this.tone(220, 130, 0.22, 'sawtooth', 0.16);
    this.tone(175, 105, 0.24, 'sawtooth', 0.14, 0.1);
  }

  playKick(power = 1) {
    const p = Math.max(0.5, Math.min(1.5, power));
    this.tone(180 * p, 55, 0.11, 'triangle', 0.28);
  }

  playBounce() {
    this.tone(190, 95, 0.06, 'sine', 0.15);
  }

  playPowerUp() {
    this.tone(523, 659, 0.1, 'sine', 0.16);
    this.tone(659, 784, 0.1, 'sine', 0.16, 0.07);
    this.tone(784, 1046, 0.16, 'triangle', 0.18, 0.14);
  }

  playGoalHorn() {
    this.tone(220, 222, 0.48, 'sawtooth', 0.16);
    this.tone(277, 279, 0.48, 'sawtooth', 0.14);
    this.tone(330, 332, 0.55, 'triangle', 0.18, 0.05);
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
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.tone(n, n * 1.01, 0.22, 'triangle', 0.18, idx * 0.09);
    });
  }
}

export const sound = new SoundEngine();
