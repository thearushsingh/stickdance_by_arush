import type { NeonSettings } from '../store';
import { getThemeColors, getSegmentColor } from '../utils/helpers';

// Custom stickman segments for a classic stickman look
// We'll compute custom points in the renderer for the spine and head
const STICKMAN_CONNECTIONS = [
  // 0: Neck to Pelvis (Spine)
  'spine',
  // 1: Neck to Left Shoulder
  'neck_l_shoulder',
  // 2: Neck to Right Shoulder
  'neck_r_shoulder',
  // 3: Left Shoulder to Left Elbow
  [11, 13],
  // 4: Left Elbow to Left Wrist
  [13, 15],
  // 5: Right Shoulder to Right Elbow
  [12, 14],
  // 6: Right Elbow to Right Wrist
  [14, 16],
  // 7: Pelvis to Left Hip
  'pelvis_l_hip',
  // 8: Pelvis to Right Hip
  'pelvis_r_hip',
  // 9: Left Hip to Left Knee
  [23, 25],
  // 10: Left Knee to Left Ankle
  [25, 27],
  // 11: Right Hip to Right Knee
  [24, 26],
  // 12: Right Knee to Right Ankle
  [26, 28]
];

export class NeonRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private startTime: number = performance.now() / 1000;
  private animTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    landmarks: { x: number; y: number; z?: number; visibility?: number }[] | null,
    settings: NeonSettings,
    width: number,
    height: number,
    mirror: boolean = true,
    background: string = 'black',
    videoElement?: HTMLVideoElement | null,
    segmentationMask?: any | null
  ): void {
    const ctx = this.ctx;
    this.animTime = performance.now() / 1000 - this.startTime;

    this.animTime = performance.now() / 1000 - this.startTime;

    this.drawBackground(ctx, width, height, background, videoElement, segmentationMask, mirror);

    if (!landmarks || landmarks.length < 33) return;

    const getPoint = (idx: number) => {
      const l = landmarks[idx];
      if (!l) return { x: 0, y: 0, visibility: 0 };
      
      // Calculate object-fit: cover mapping
      const videoRatio = 640 / 480; // Standard webcam ratio
      const canvasRatio = width / height;
      
      let sX, sY, oX = 0, oY = 0;
      if (canvasRatio > videoRatio) {
        sX = width;
        sY = width / videoRatio;
        oY = (height - sY) / 2;
      } else {
        sY = height;
        sX = height * videoRatio;
        oX = (width - sX) / 2;
      }

      let px = l.x * sX + oX;
      let py = l.y * sY + oY;
      
      if (mirror) {
        px = width - px;
      }
      return { x: px, y: py, visibility: l.visibility ?? 1 };
    };

    const pts = landmarks.map((_, i) => getPoint(i));

    // Get theme colors
    const colors = getThemeColors(
      settings.theme,
      settings.customColor,
      this.animTime * (settings.rgbCycleSpeed || 1),
    );

    let pulseFactor = 1;
    if (settings.pulseSpeed > 0) {
      pulseFactor = 0.7 + 0.3 * Math.sin(this.animTime * settings.pulseSpeed * Math.PI * 2);
    }

    this.drawStickman(ctx, pts, colors, settings, pulseFactor);
  }

  private drawStickman(
    ctx: CanvasRenderingContext2D,
    pts: { x: number; y: number; visibility: number }[],
    colors: string[],
    settings: NeonSettings,
    pulseFactor: number,
  ): void {
    ctx.save();
    
    const thickness = settings.thickness * pulseFactor * settings.brightness;

    // Compute custom points
    const neck = {
      x: (pts[11].x + pts[12].x) / 2,
      y: (pts[11].y + pts[12].y) / 2,
      visibility: Math.min(pts[11].visibility, pts[12].visibility)
    };
    const pelvis = {
      x: (pts[23].x + pts[24].x) / 2,
      y: (pts[23].y + pts[24].y) / 2,
      visibility: Math.min(pts[23].visibility, pts[24].visibility)
    };

    const nose = pts[0];
    let headRadius = 20;
    if (nose && nose.visibility > 0.4 && neck.visibility > 0.4) {
      const dx = nose.x - neck.x;
      const dy = nose.y - neck.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      headRadius = Math.max(dist * 0.8, 20);
    }

    // We draw in passes so all glows are drawn before all cores, preventing ugly overlapping joints
    const passes = [
      {
        composite: 'lighter',
        width: thickness,
        colorFn: (color: string) => color,
        alpha: Math.min(1, 0.3 * settings.glowIntensity),
        blur: 40 * settings.bloomAmount
      },
      {
        composite: 'lighter',
        width: thickness,
        colorFn: (color: string) => color,
        alpha: Math.min(1, 0.6 * settings.glowIntensity),
        blur: 20 * settings.bloomAmount
      },
      {
        composite: 'source-over',
        width: thickness,
        colorFn: (color: string) => color,
        alpha: Math.min(1, 0.9 * settings.brightness),
        blur: 10 * settings.bloomAmount
      },
      {
        composite: 'source-over',
        width: thickness * 0.35, // Reduced width so it blends nicer
        colorFn: () => '#ffffff',
        alpha: Math.min(1, 0.5 * settings.brightness), // Reduced alpha to avoid stark white lines
        blur: 4
      }
    ] as const;

    passes.forEach(pass => {
      ctx.globalCompositeOperation = pass.composite as GlobalCompositeOperation;
      ctx.lineWidth = pass.width;
      ctx.globalAlpha = pass.alpha;
      ctx.shadowBlur = pass.blur;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw all lines
      STICKMAN_CONNECTIONS.forEach((conn, segIdx) => {
        let a, b;

        if (conn === 'spine') { a = neck; b = pelvis; }
        else if (conn === 'neck_l_shoulder') { a = neck; b = pts[11]; }
        else if (conn === 'neck_r_shoulder') { a = neck; b = pts[12]; }
        else if (conn === 'pelvis_l_hip') { a = pelvis; b = pts[23]; }
        else if (conn === 'pelvis_r_hip') { a = pelvis; b = pts[24]; }
        else if (Array.isArray(conn)) {
          a = pts[conn[0]];
          b = pts[conn[1]];
        }

        if (!a || !b || a.visibility < 0.4 || b.visibility < 0.4) return;

        const baseColor = getSegmentColor(colors, segIdx);
        const color = pass.colorFn(baseColor);
        ctx.strokeStyle = color;
        ctx.shadowColor = color;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      // Draw Head Circle
      if (nose && nose.visibility > 0.4 && neck.visibility > 0.4) {
        const baseColor = colors.length > 1 ? colors[colors.length - 1] : colors[0];
        const color = pass.colorFn(baseColor);
        ctx.strokeStyle = color;
        ctx.shadowColor = color;

        ctx.beginPath();
        ctx.arc(nose.x, nose.y, headRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D, w: number, h: number, bg: string,
    videoElement?: HTMLVideoElement | null, mask?: any | null, mirror: boolean = true
  ) {
    const t = this.animTime;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    
    switch (bg) {
      case 'black':
        ctx.fillStyle = '#07070d';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'white':
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'camera-masked': {
        if (videoElement && videoElement.readyState >= 2) {
          ctx.save();
          if (mirror) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          
          const videoRatio = 640 / 480; // Default or use videoElement.videoWidth / videoElement.videoHeight if reliable
          const canvasRatio = w / h;
          let sX, sY, oX = 0, oY = 0;
          if (canvasRatio > videoRatio) {
            sX = w; sY = w / videoRatio; oY = (h - sY) / 2;
          } else {
            sY = h; sX = h * videoRatio; oX = (w - sX) / 2;
          }

          // Draw the live video background
          ctx.drawImage(videoElement, oX, oY, sX, sY);

          // Erase the human using the segmentation mask
          if (mask) {
            ctx.globalCompositeOperation = 'destination-out';
            try {
              let maskImg = mask;
              if (mask.getAsCanvasImageSource) {
                maskImg = mask.getAsCanvasImageSource();
              } else if (mask.canvas) {
                maskImg = mask.canvas;
              } else if (mask.getAsImageData) {
                 // Fallback for ImageData: put to temp canvas then draw
                 const tmp = document.createElement('canvas');
                 tmp.width = mask.width; tmp.height = mask.height;
                 tmp.getContext('2d')?.putImageData(mask.getAsImageData(), 0, 0);
                 maskImg = tmp;
              }
              ctx.drawImage(maskImg, oX, oY, sX, sY);
            } catch (e) {
              console.warn('Failed to draw mask:', e);
            }
          }
          ctx.restore();
        } else {
          ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, w, h);
        }
        break;
      }
      case 'neon-grid': {
        ctx.fillStyle = '#07070d';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.06)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        const offsetY = (t * 20) % gridSize;
        for (let x = 0; x <= w; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = -gridSize + offsetY; y <= h; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.save();
        const grad = ctx.createLinearGradient(0, h * 0.7, 0, h);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'rgba(0, 245, 255, 0.03)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, h * 0.7, w, h * 0.3);
        ctx.restore();
        break;
      }
      case 'light-grid': {
        ctx.fillStyle = '#f0f0f5';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.1)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        const offsetY = (t * 20) % gridSize;
        for (let x = 0; x <= w; x += gridSize) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = -gridSize + offsetY; y <= h; y += gridSize) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        break;
      }
      case 'bright-gradient': {
        const hue1 = (t * 10) % 360;
        const hue2 = (hue1 + 120) % 360;
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, `hsla(${hue1}, 80%, 90%, 1)`);
        grad.addColorStop(0.5, `hsla(${(hue1 + 60) % 360}, 80%, 85%, 1)`);
        grad.addColorStop(1, `hsla(${hue2}, 80%, 90%, 1)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'sunset': {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#ff7e5f'); // Warm orange
        grad.addColorStop(1, '#feb47b'); // Peachy
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'gradient': {
        const hue1 = (t * 10) % 360;
        const hue2 = (hue1 + 120) % 360;
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, `hsla(${hue1}, 60%, 8%, 1)`);
        grad.addColorStop(0.5, `hsla(${(hue1 + 60) % 360}, 40%, 5%, 1)`);
        grad.addColorStop(1, `hsla(${hue2}, 60%, 8%, 1)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'stars': {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 80; i++) {
          const sx = ((i * 7919 + 1) % 1000) / 1000 * w;
          const sy = ((i * 6271 + 3) % 1000) / 1000 * h;
          const ss = ((i * 3571) % 100) / 100 * 1.5 + 0.3;
          const sa = 0.3 + 0.3 * Math.sin(t * 0.5 + i);
          ctx.globalAlpha = sa;
          ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'particles': {
        ctx.fillStyle = '#07070d';
        ctx.fillRect(0, 0, w, h);
        const pColors = ['#00f5ff', '#ff00e5', '#b44aff'];
        for (let i = 0; i < 40; i++) {
          const px = ((i * 8731 + 5) % 1000) / 1000 * w;
          const baseY = ((i * 5431 + 7) % 1000) / 1000 * h;
          const py = baseY + Math.sin(t * 0.3 + i) * 20;
          const pa = 0.15 + 0.1 * Math.sin(t * 0.5 + i * 2);
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = pColors[i % pColors.length];
          ctx.globalAlpha = pa;
          ctx.shadowColor = pColors[i % pColors.length];
          ctx.shadowBlur = 10;
          ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        break;
      }
      case 'rain': {
        ctx.fillStyle = '#060612';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(100, 140, 255, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 60; i++) {
          const rx = ((i * 9341 + 1) % 1000) / 1000 * w;
          const speed = 200 + (i % 5) * 60;
          const ry = ((t * speed + i * 83) % (h + 40)) - 20;
          const len = 12 + (i % 4) * 6;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + len); ctx.stroke();
        }
        break;
      }
      case 'smoke': {
        ctx.fillStyle = '#07070d';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) {
          const cx = w * 0.2 + (i * w * 0.15);
          const cy = h * 0.6 + Math.sin(t * 0.2 + i) * 50;
          const r = 120 + Math.sin(t * 0.1 + i * 2) * 30;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, 'rgba(60, 60, 80, 0.06)');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        break;
      }
      default:
        ctx.fillStyle = '#07070d';
        ctx.fillRect(0, 0, w, h);
    }
  }

  destroy(): void {}
}
