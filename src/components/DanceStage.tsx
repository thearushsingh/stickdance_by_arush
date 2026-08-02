import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Settings, Video, VideoOff, Mic, MicOff,
  FlipHorizontal, Circle, Square, X,
  Maximize, RotateCcw
} from 'lucide-react';
import { PoseEngine, type PoseLandmark } from '../engine/PoseEngine';
import { NeonRenderer } from '../engine/NeonRenderer';
import { useStore, type NeonTheme, type Background } from '../store';
import './DanceStage.css';

// Theme swatches for the settings panel
const THEME_SWATCHES: { id: NeonTheme; label: string; colors: string[] }[] = [
  { id: 'cyan', label: 'Cyan', colors: ['#00f5ff'] },
  { id: 'magenta', label: 'Magenta', colors: ['#ff00e5'] },
  { id: 'purple', label: 'Purple', colors: ['#b44aff'] },
  { id: 'pink', label: 'Pink', colors: ['#ff4a9e'] },
  { id: 'blue', label: 'Blue', colors: ['#4a7aff'] },
  { id: 'green', label: 'Green', colors: ['#00ff88'] },
  { id: 'red', label: 'Red', colors: ['#ff2244'] },
  { id: 'white', label: 'White', colors: ['#e8e8ff'] },
  { id: 'rainbow', label: 'Rainbow', colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] },
  { id: 'cyberpunk', label: 'Cyber', colors: ['#00f5ff', '#ff00e5'] },
  { id: 'synthwave', label: 'Synth', colors: ['#ff4a9e', '#b44aff'] },
  { id: 'fire', label: 'Fire', colors: ['#ff2244', '#ff8800'] },
  { id: 'ice', label: 'Ice', colors: ['#88ddff', '#00f5ff'] },
  { id: 'matrix', label: 'Matrix', colors: ['#00ff41', '#009926'] },
];

const BG_OPTIONS: { id: Background; label: string }[] = [
  { id: 'black', label: '⬛ Black' },
  { id: 'neon-grid', label: '🔲 Grid' },
  { id: 'particles', label: '✨ Particles' },
  { id: 'gradient', label: '🌈 Gradient' },
  { id: 'stars', label: '⭐ Stars' },
  { id: 'rain', label: '🌧️ Rain' },
  { id: 'smoke', label: '💨 Smoke' },
  { id: 'white', label: '⬜ White' },
  { id: 'light-grid', label: '🔳 Light Grid' },
  { id: 'bright-gradient', label: '🌅 Day Gradient' },
  { id: 'sunset', label: '🌇 Sunset' },
  { id: 'camera-masked', label: '📷 Camera Room' },
];

interface DanceStageProps {
  isSolo?: boolean;
}

export default function DanceStage({ isSolo = false }: DanceStageProps) {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  // Store
  const user = useStore((s) => s.user);
  const neonSettings = useStore((s) => s.neonSettings);
  const updateNeonSettings = useStore((s) => s.updateNeonSettings);
  const resetNeonSettings = useStore((s) => s.resetNeonSettings);
  const background = useStore((s) => s.background);
  const setBackground = useStore((s) => s.setBackground);
  const showSettings = useStore((s) => s.showSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const mirrorMode = useStore((s) => s.mirrorMode);
  const setMirrorMode = useStore((s) => s.setMirrorMode);
  const isRecording = useStore((s) => s.isRecording);
  const setIsRecording = useStore((s) => s.setIsRecording);
  const fps = useStore((s) => s.fps);
  const setFps = useStore((s) => s.setFps);

  // Local state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [copied, setCopied] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceCamRef = useRef<HTMLVideoElement>(null);
  const poseEngineRef = useRef<PoseEngine | null>(null);
  const rendererRef = useRef<NeonRenderer | null>(null);
  const landmarksRef = useRef<PoseLandmark[] | null>(null);
  const maskRef = useRef<any | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  // Initialize pose engine and camera
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!videoRef.current || !canvasRef.current) return;

        // Init pose engine
        const engine = new PoseEngine((landmarks, mask) => {
          landmarksRef.current = landmarks;
          maskRef.current = mask;
        });
        poseEngineRef.current = engine;
        await engine.init();

        if (cancelled) return;

        // Init camera
        const stream = await engine.startCamera(videoRef.current);
        streamRef.current = stream;

        // Show face cam too
        if (faceCamRef.current) {
          faceCamRef.current.srcObject = stream;
          faceCamRef.current.play().catch(() => {});
        }

        // Init renderer
        const renderer = new NeonRenderer(canvasRef.current);
        rendererRef.current = renderer;

        // Start pose detection
        engine.start();

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Init error:', err);
        if (!cancelled) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera permissions and reload.');
          } else if (err.name === 'NotFoundError') {
            setError('No camera found. Please connect a webcam and reload.');
          } else {
            setError(err.message || 'Failed to initialize. Please try a different browser.');
          }
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      poseEngineRef.current?.destroy();
      rendererRef.current?.destroy();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Render loop
  useEffect(() => {
    if (loading || error) return;

    const render = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!container || !canvas || !renderer) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const w = container.clientWidth;
      const h = container.clientHeight;

      // Resize if needed
      if (canvas.style.width !== `${w}px` || canvas.style.height !== `${h}px`) {
        renderer.resize(w, h);
      }

      // Draw neon skeleton and background
      renderer.render(
        landmarksRef.current,
        neonSettings,
        w,
        h,
        mirrorMode,
        background,
        isCameraOn ? faceCamRef.current : undefined,
        maskRef.current
      );

      // FPS counter
      fpsCounterRef.current.frames++;
      const now = performance.now();
      if (now - fpsCounterRef.current.lastTime >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastTime = now;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [loading, error, neonSettings, mirrorMode, background, setFps]);

  // Toggle camera
  const toggleCamera = () => {
    const stream = streamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      setIsCameraOn(!isCameraOn);
    }
  };

  // Toggle mic
  const toggleMic = () => {
    setIsMuted(!isMuted);
  };

  // Copy room code
  const copyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Recording
  const toggleRecording = () => {
    if (isRecording) {
      // Stop
      recorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start
      const canvas = canvasRef.current;
      if (!canvas) return;

      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5000000,
      });

      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `neondance-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  // Handle back
  const handleBack = () => {
    poseEngineRef.current?.destroy();
    navigate('/');
  };

  return (
    <div className="dance-stage" ref={containerRef}>
      {/* Hidden video for pose detection */}
      <video ref={videoRef} className="hidden-video" playsInline muted />

      {/* Loading */}
      {loading && !error && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Initializing...</div>
          <div className="loading-hint">
            Allow camera access when prompted. This may take a moment on first load.
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-overlay">
          <div className="error-icon">📷</div>
          <div className="error-title">Oops!</div>
          <div className="error-msg">{error}</div>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Try Again
          </button>
          <button className="btn btn-solo" onClick={handleBack}>
            Back to Home
          </button>
        </div>
      )}

      {/* Neon Canvas */}
      <div className="neon-canvas-container">
        <canvas ref={canvasRef} className="neon-canvas" />
      </div>

      {/* Top Bar */}
      {!loading && !error && (
        <div className="top-bar">
          <div className="top-bar-left">
            <button className="back-btn" onClick={handleBack} title="Leave">
              <ArrowLeft size={16} /> Leave
            </button>
            {roomId && (
              <button className="room-badge" onClick={copyRoomCode} title="Copy invite link">
                {copied ? '✓ Copied!' : `Room: ${roomId}`}
              </button>
            )}
            {isSolo && <span className="room-badge">Solo Practice</span>}
          </div>
          <div className="top-bar-right">
            <span className="stat-badge">{fps} FPS</span>
            {user && <span className="stat-badge">{user.name}</span>}
          </div>
        </div>
      )}

      {/* Face Camera */}
      {!loading && !error && isCameraOn && (
        <div className={`face-camera ${mirrorMode ? 'face-camera-mirrored' : ''}`}>
          <video ref={faceCamRef} playsInline muted autoPlay />
          <span className="face-camera-label">{user?.name || 'You'}</span>
          <div className="face-camera-controls">
            <button
              className="cam-ctrl-btn"
              onClick={() => setMirrorMode(!mirrorMode)}
              title="Mirror"
            >
              <FlipHorizontal size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      {!loading && !error && (
        <div className="bottom-controls">
          <div className="controls-bar">
            <button
              className={`ctrl-btn ${isCameraOn ? '' : 'danger'}`}
              onClick={toggleCamera}
              title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>

            <button
              className={`ctrl-btn ${isMuted ? 'danger' : ''}`}
              onClick={toggleMic}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <div className="ctrl-divider" />

            <button
              className={`ctrl-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              title={isRecording ? 'Stop Recording' : 'Start Recording'}
            >
              {isRecording ? <Square size={18} /> : <Circle size={18} />}
            </button>

            <button
              className="ctrl-btn"
              onClick={toggleFullscreen}
              title="Fullscreen"
            >
              <Maximize size={18} />
            </button>

            <div className="ctrl-divider" />

            <button
              className={`ctrl-btn ${showSettings ? 'active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <span className="settings-title">✨ Customize</span>
            <button className="settings-close" onClick={() => setShowSettings(false)}>
              <X size={18} />
            </button>
          </div>

          {/* Theme Selection */}
          <div className="settings-section">
            <div className="settings-section-title">Neon Color</div>
            <div className="theme-grid">
              {THEME_SWATCHES.map((sw) => (
                <button
                  key={sw.id}
                  className={`theme-swatch ${neonSettings.theme === sw.id ? 'selected' : ''}`}
                  style={{
                    background:
                      sw.colors.length > 1
                        ? `linear-gradient(135deg, ${sw.colors.join(', ')})`
                        : sw.colors[0],
                  }}
                  onClick={() => updateNeonSettings({ theme: sw.id })}
                  title={sw.label}
                >
                  <span className="theme-swatch-label">{sw.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="settings-section">
            <div className="settings-section-title">Appearance</div>

            <div className="setting-row">
              <span className="setting-label">Thickness</span>
              <input
                type="range" className="setting-slider"
                min="2" max="12" step="0.5"
                value={neonSettings.thickness}
                onChange={(e) => updateNeonSettings({ thickness: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.thickness}</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Glow</span>
              <input
                type="range" className="setting-slider"
                min="0" max="2" step="0.1"
                value={neonSettings.glowIntensity}
                onChange={(e) => updateNeonSettings({ glowIntensity: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.glowIntensity.toFixed(1)}</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Bloom</span>
              <input
                type="range" className="setting-slider"
                min="0" max="3" step="0.1"
                value={neonSettings.bloomAmount}
                onChange={(e) => updateNeonSettings({ bloomAmount: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.bloomAmount.toFixed(1)}</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Brightness</span>
              <input
                type="range" className="setting-slider"
                min="0.5" max="2" step="0.1"
                value={neonSettings.brightness}
                onChange={(e) => updateNeonSettings({ brightness: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.brightness.toFixed(1)}</span>
            </div>
          </div>

          {/* Trails */}
          <div className="settings-section">
            <div className="settings-section-title">Motion Trails</div>

            <div className="setting-row">
              <span className="setting-label">Trail Length</span>
              <input
                type="range" className="setting-slider"
                min="0" max="30" step="1"
                value={neonSettings.trailLength}
                onChange={(e) => updateNeonSettings({ trailLength: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.trailLength}</span>
            </div>

            <div className="setting-row">
              <span className="setting-label">Trail Opacity</span>
              <input
                type="range" className="setting-slider"
                min="0" max="1" step="0.05"
                value={neonSettings.trailOpacity}
                onChange={(e) => updateNeonSettings({ trailOpacity: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.trailOpacity.toFixed(2)}</span>
            </div>
          </div>

          {/* Effects */}
          <div className="settings-section">
            <div className="settings-section-title">Effects</div>

            <div className="setting-row">
              <span className="setting-label">Pulse Speed</span>
              <input
                type="range" className="setting-slider"
                min="0" max="5" step="0.25"
                value={neonSettings.pulseSpeed}
                onChange={(e) => updateNeonSettings({ pulseSpeed: +e.target.value })}
              />
              <span className="setting-value">{neonSettings.pulseSpeed.toFixed(1)}</span>
            </div>

            {neonSettings.theme === 'rainbow' && (
              <div className="setting-row">
                <span className="setting-label">RGB Speed</span>
                <input
                  type="range" className="setting-slider"
                  min="0" max="10" step="0.5"
                  value={neonSettings.rgbCycleSpeed}
                  onChange={(e) => updateNeonSettings({ rgbCycleSpeed: +e.target.value })}
                />
                <span className="setting-value">{neonSettings.rgbCycleSpeed.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* Background */}
          <div className="settings-section">
            <div className="settings-section-title">Background</div>
            <div className="bg-grid">
              {BG_OPTIONS.map((bg) => (
                <button
                  key={bg.id}
                  className={`bg-option ${background === bg.id ? 'selected' : ''}`}
                  onClick={() => setBackground(bg.id)}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>
          {/* Reset */}
          <div className="settings-section">
            <button
              className="btn-reset"
              onClick={() => {
                resetNeonSettings();
                setBackground('neon-grid');
              }}
            >
              <RotateCcw size={14} />
              Reset All Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
