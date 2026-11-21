export class SynthAudio {
  private ctx: AudioContext | null = null;
  private muted = false;
  private pulseTimer = 0;
  private pulseActive = false;
  private pulseStep = 0;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.ensureContext();
    }
    return this.muted;
  }

  public startPulse(): void {
    this.pulseActive = true;
    this.pulseTimer = 0;
    this.pulseStep = 0;
  }

  public stopPulse(): void {
    this.pulseActive = false;
  }

  public updatePulse(dt: number, speedMultiplier: number): void {
    if (!this.pulseActive || this.muted) return;
    this.pulseTimer -= dt;
    if (this.pulseTimer <= 0) {
      const interval = Math.max(0.14, 0.34 / Math.max(0.8, speedMultiplier));
      this.pulseTimer = interval;
      const notes = [55, 55, 65.41, 73.42];
      const freq = notes[this.pulseStep % notes.length];
      this.pulseStep += 1;
      this.playTone(freq, 0.11, 'triangle', 0.06, freq * 0.96);
    }
  }

  public playNearMiss(combo: number): void {
    const base = 440 + Math.min(combo, 8) * 55;
    this.playTone(base, 0.12, 'sine', 0.12, base * 1.35);
  }

  public playPowerUp(): void {
    this.playTone(523.25, 0.09, 'sine', 0.12, 659.25);
    setTimeout(() => {
      this.playTone(659.25, 0.12, 'triangle', 0.12, 880);
    }, 65);
  }

  public playShieldBreak(): void {
    this.playTone(320, 0.22, 'sawtooth', 0.14, 110);
  }

  public playCrash(): void {
    this.playTone(180, 0.38, 'sawtooth', 0.18, 42);
  }

  private playTone(
    startFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFreq: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
