import { GLYPH_HEIGHT, glyph, measure } from './font';

const ON = '#ffb000';
const GLOW = 'rgba(255, 150, 0, 0.9)';
const OFF = '#1c1408';
const BG = '#050403';

/** A lit/unlit grid of dots that text is rasterised into before painting. */
export class FrameBuffer {
  readonly dots: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.dots = new Uint8Array(cols * rows);
  }

  clear() {
    this.dots.fill(0);
  }

  /** Draws text with its top-left at (x, y), only touching columns in [clipX0, clipX1). */
  text(text: string, x: number, y: number, clipX0 = 0, clipX1 = this.cols) {
    const x0 = Math.max(0, clipX0);
    const x1 = Math.min(this.cols, clipX1);
    for (const ch of text) {
      const g = glyph(ch);
      if (x >= x1) break;
      if (x + g.width > x0) {
        for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
          const py = y + gy;
          if (py < 0 || py >= this.rows) continue;
          const row = g.rows[gy];
          for (let gx = 0; gx < g.width; gx++) {
            const px = x + gx;
            if (row[gx] && px >= x0 && px < x1) this.dots[py * this.cols + px] = 1;
          }
        }
      }
      x += g.width + 1;
    }
  }

  /**
   * Draws text inside [x0, x1). Text that doesn't fit scrolls like a marquee:
   * it rests at the start for a moment, then slides left one dot at a time and wraps.
   */
  marquee(text: string, x0: number, x1: number, y: number, t: number) {
    const w = measure(text);
    const field = x1 - x0;
    if (w <= field) {
      this.text(text, x0, y, x0, x1);
      return;
    }
    const gap = 12;
    const speed = 14; // dots per second
    const pause = 2;
    const span = w + gap;
    const period = pause + span / speed;
    const phase = t % period;
    const offset = phase < pause ? 0 : Math.floor((phase - pause) * speed);
    this.text(text, x0 - offset, y, x0, x1);
    this.text(text, x0 - offset + span, y, x0, x1);
  }

  equals(other: FrameBuffer): boolean {
    const a = this.dots;
    const b = other.dots;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  copyFrom(other: FrameBuffer) {
    this.dots.set(other.dots);
  }
}

/** Paints a FrameBuffer onto a canvas as round amber LEDs. */
export class LedPainter {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly scale: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cols: number,
    private readonly rows: number,
    private readonly pitch: number,
  ) {
    this.scale = window.devicePixelRatio || 1;
    const w = cols * pitch;
    const h = rows * pitch;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * this.scale);
    canvas.height = Math.round(h * this.scale);
    this.ctx = canvas.getContext('2d')!;

    // The unlit dot grid never changes, so paint it once and blit it every frame.
    this.background = document.createElement('canvas');
    this.background.width = canvas.width;
    this.background.height = canvas.height;
    const bg = this.background.getContext('2d')!;
    bg.scale(this.scale, this.scale);
    bg.fillStyle = BG;
    bg.fillRect(0, 0, w, h);
    bg.fillStyle = OFF;
    bg.beginPath();
    this.dotPath(bg, () => true);
    bg.fill();
  }

  private get radius() {
    return this.pitch * 0.38;
  }

  private dotPath(ctx: CanvasRenderingContext2D, lit: (i: number) => boolean) {
    const r = this.radius;
    const p = this.pitch;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!lit(y * this.cols + x)) continue;
        const cx = x * p + p / 2;
        const cy = y * p + p / 2;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
  }

  paint(fb: FrameBuffer) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.background, 0, 0);
    ctx.scale(this.scale, this.scale);
    ctx.fillStyle = ON;
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = this.pitch * 1.5 * this.scale;
    ctx.beginPath();
    this.dotPath(ctx, (i) => fb.dots[i] === 1);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
