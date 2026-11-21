export class InputManager {
  private keys = new Set<string>();
  private touchActive = false;
  private touchSteer = 0;
  private touchStartX = 0;
  private isDragging = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd);
    window.addEventListener('touchcancel', this.onTouchEnd);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    this.touchActive = true;
    this.touchStartX = touch.clientX;
    this.isDragging = false;
    const halfWidth = window.innerWidth * 0.5;
    this.touchSteer = touch.clientX < halfWidth ? -1 : 1;
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.touchActive || e.touches.length === 0) return;
    const deltaX = e.touches[0].clientX - this.touchStartX;
    if (Math.abs(deltaX) > 12) {
      this.isDragging = true;
      this.touchSteer = Math.max(-1, Math.min(1, deltaX / 90));
    }
  };

  private onTouchEnd = (): void => {
    this.touchActive = false;
    this.isDragging = false;
    this.touchSteer = 0;
  };

  public getSteerInput(): number {
    let steer = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) {
      steer -= 1;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) {
      steer += 1;
    }
    if (steer !== 0) {
      return steer;
    }
    if (this.touchActive || this.isDragging) {
      return this.touchSteer;
    }
    return 0;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchcancel', this.onTouchEnd);
  }
}
