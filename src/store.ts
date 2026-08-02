import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NeonTheme = 
  | 'cyan' | 'magenta' | 'purple' | 'pink' | 'blue' 
  | 'green' | 'red' | 'white' | 'rainbow' | 'cyberpunk' 
  | 'synthwave' | 'fire' | 'ice' | 'matrix' | 'custom';

export type DanceMode = 'freestyle' | 'mirror' | 'battle' | 'practice' | 'party';

export type Background = 
  | 'black' | 'neon-grid' | 'particles' | 'gradient' 
  | 'stars' | 'rain' | 'smoke'
  | 'white' | 'light-grid' | 'bright-gradient' | 'sunset'
  | 'camera-masked';

export interface NeonSettings {
  theme: NeonTheme;
  customColor: string;
  thickness: number;        // 2 - 12
  glowIntensity: number;    // 0 - 2
  bloomAmount: number;      // 0 - 3
  brightness: number;       // 0.5 - 2
  trailLength: number;      // 0 - 30 (0 = off)
  trailOpacity: number;     // 0 - 1
  pulseSpeed: number;       // 0 - 5 (0 = off)
  rgbCycleSpeed: number;    // 0 - 10 (0 = off, only for rainbow)
}

export interface UserState {
  id: string;
  name: string;
  isHost: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
}

interface AppStore {
  // ── User ──
  user: UserState | null;
  setUser: (user: UserState | null) => void;
  
  // ── Room ──
  roomCode: string | null;
  setRoomCode: (code: string | null) => void;
  isConnected: boolean;
  setIsConnected: (v: boolean) => void;
  
  // ── Neon Settings ──
  neonSettings: NeonSettings;
  updateNeonSettings: (partial: Partial<NeonSettings>) => void;
  resetNeonSettings: () => void;
  
  // ── Dance ──
  danceMode: DanceMode;
  setDanceMode: (mode: DanceMode) => void;
  background: Background;
  setBackground: (bg: Background) => void;
  
  // ── UI State ──
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showControls: boolean;
  setShowControls: (v: boolean) => void;
  fps: number;
  setFps: (v: number) => void;
  
  // ── Recording ──
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  
  // ── Mirror mode ──
  mirrorMode: boolean;
  setMirrorMode: (v: boolean) => void;
}

const defaultNeonSettings: NeonSettings = {
  theme: 'cyan',
  customColor: '#00f5ff',
  thickness: 5,
  glowIntensity: 1,
  bloomAmount: 1.5,
  brightness: 1,
  trailLength: 0,
  trailOpacity: 0.4,
  pulseSpeed: 0,
  rgbCycleSpeed: 2,
};

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      
      roomCode: null,
      setRoomCode: (roomCode) => set({ roomCode }),
      isConnected: false,
      setIsConnected: (isConnected) => set({ isConnected }),
      
      neonSettings: defaultNeonSettings,
      updateNeonSettings: (partial) => set((state) => ({
        neonSettings: { ...state.neonSettings, ...partial }
      })),
      resetNeonSettings: () => set({ neonSettings: defaultNeonSettings }),
      
      danceMode: 'freestyle',
      setDanceMode: (danceMode) => set({ danceMode }),
      background: 'neon-grid',
      setBackground: (background) => set({ background }),
      
      showSettings: false,
      setShowSettings: (showSettings) => set({ showSettings }),
      showControls: true,
      setShowControls: (showControls) => set({ showControls }),
      fps: 0,
      setFps: (fps) => set({ fps }),
      
      isRecording: false,
      setIsRecording: (isRecording) => set({ isRecording }),
      
      mirrorMode: true,
      setMirrorMode: (mirrorMode) => set({ mirrorMode }),
    }),
    {
      name: 'neondance-storage',
      partialize: (state) => ({ 
        user: state.user, 
        roomCode: state.roomCode,
        neonSettings: state.neonSettings,
        background: state.background,
        mirrorMode: state.mirrorMode
      }),
    }
  )
);
