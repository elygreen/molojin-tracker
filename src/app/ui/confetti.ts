import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';

const COLORS = ['#e2553f', '#f2a03d', '#6cbf6a', '#8f6ad6', '#6f8fe0', '#fce9a6', '#93b4f5'];

interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  sway: number;
  phase: number;
  spin: number;
  angle: number;
  color: string;
}

/** Full-screen confetti that keeps raining for as long as it's on the page. */
@Component({
  selector: 'app-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    canvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 1000;
    }
  `,
})
export class Confetti {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let width = 0;
      let height = 0;
      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();
      window.addEventListener('resize', resize);

      const spawn = (y: number): Piece => ({
        x: Math.random() * width,
        y,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vy: 1.5 + Math.random() * 2.5,
        sway: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
        angle: Math.random() * Math.PI,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
      const count = reduced ? 40 : Math.min(220, Math.round(width / 6));
      // Start above the screen, staggered, so it begins as a shower rather than a wall.
      const pieces = Array.from({ length: count }, () => spawn(-Math.random() * height));

      let frame = 0;
      const tick = () => {
        ctx.clearRect(0, 0, width, height);
        for (const p of pieces) {
          p.y += reduced ? p.vy * 0.4 : p.vy;
          p.phase += 0.03;
          p.angle += reduced ? 0 : p.spin;
          if (p.y > height + 20) Object.assign(p, spawn(-20));
          ctx.save();
          ctx.translate(p.x + Math.sin(p.phase) * p.sway * 10, p.y);
          ctx.rotate(p.angle);
          // Squash horizontally as it flips so pieces look like they tumble.
          ctx.scale(Math.cos(p.phase * 2), 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
      });
    });
  }
}
