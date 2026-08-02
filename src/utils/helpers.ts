import type { NeonTheme } from '../store';

/** Maps each NeonTheme to one or more CSS color strings */
export function getThemeColors(theme: NeonTheme, customColor: string, time: number = 0): string[] {
  switch (theme) {
    case 'cyan':      return ['#00f5ff'];
    case 'magenta':   return ['#ff00e5'];
    case 'purple':    return ['#b44aff'];
    case 'pink':      return ['#ff4a9e'];
    case 'blue':      return ['#4a7aff'];
    case 'green':     return ['#00ff88'];
    case 'red':       return ['#ff2244'];
    case 'white':     return ['#e8e8ff'];
    case 'custom':    return [customColor];
    case 'rainbow': {
      const hue = (time * 60) % 360;
      return [
        `hsl(${hue}, 100%, 60%)`,
        `hsl(${(hue + 60) % 360}, 100%, 60%)`,
        `hsl(${(hue + 120) % 360}, 100%, 60%)`,
        `hsl(${(hue + 180) % 360}, 100%, 60%)`,
        `hsl(${(hue + 240) % 360}, 100%, 60%)`,
      ];
    }
    case 'cyberpunk': return ['#00f5ff', '#ff00e5', '#b44aff'];
    case 'synthwave': return ['#ff4a9e', '#b44aff', '#4a7aff'];
    case 'fire':      return ['#ff2244', '#ff8800', '#ffee00'];
    case 'ice':       return ['#88ddff', '#00f5ff', '#e8e8ff'];
    case 'matrix':    return ['#00ff41', '#00cc33', '#009926'];
    default:          return ['#00f5ff'];
  }
}

/** Get a single color for a segment index, cycling through theme colors */
export function getSegmentColor(colors: string[], segmentIndex: number): string {
  return colors[segmentIndex % colors.length];
}

/** Generate a unique 6-char room code */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Generate a random guest name */
export function generateGuestName(): string {
  const adjectives = ['Neon', 'Cyber', 'Glow', 'Laser', 'Pixel', 'Turbo', 'Nova', 'Flux', 'Volt', 'Spark'];
  const nouns = ['Dancer', 'Mover', 'Groover', 'Star', 'Beat', 'Pulse', 'Wave', 'Flash', 'Storm', 'Blaze'];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
}

/** Generate a UUID v4 */
export function generateId(): string {
  return crypto.randomUUID?.() ?? 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/** Lerp */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
