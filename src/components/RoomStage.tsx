import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Video, VideoOff, Mic, MicOff, Maximize, Settings, X, Circle, Square, Music, RotateCcw, FlipHorizontal
} from 'lucide-react';
import { PoseEngine, type PoseLandmark } from '../engine/PoseEngine';
import { NeonRenderer } from '../engine/NeonRenderer';
import { PeerEngine } from '../engine/PeerEngine';
import { useStore, type NeonTheme, type Background } from '../store';
import MusicPlayer, { type SyncEvent } from './MusicPlayer';
import './DanceStage.css';

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

export default function RoomStage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  const user = useStore((s) => s.user);
  const neonSettings = useStore((s) => s.neonSettings);
  const updateNeonSettings = useStore((s) => s.updateNeonSettings);
  const background = useStore((s) => s.background);
  const setBackground = useStore((s) => s.setBackground);
  const showSettings = useStore((s) => s.showSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);

  // Default to non-mirrored for the local stickman so it follows exact movements,
  // but face camera is typically mirrored so it acts like a mirror.
  const mirrorMode = useStore((s) => s.mirrorMode);
  const setMirrorMode = useStore((s) => s.setMirrorMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  
  const [ytVideoId, setYtVideoId] = useState<string | null>(null);
  const [incomingSyncEvent, setIncomingSyncEvent] = useState<SyncEvent | null>(null);
  const [showMusicInput, setShowMusicInput] = useState(false);
  const [musicInputUrl, setMusicInputUrl] = useState('');
  
  const isRecording = useStore((s) => s.isRecording);
  const setIsRecording = useStore((s) => s.setIsRecording);
  const resetNeonSettings = useStore((s) => s.resetNeonSettings);

  const videoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const localFaceCamRef = useRef<HTMLVideoElement>(null);
  const remoteFaceCamRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const poseEngineRef = useRef<PoseEngine | null>(null);
  const peerEngineRef = useRef<PeerEngine | null>(null);
  const localRendererRef = useRef<NeonRenderer | null>(null);
  const remoteRendererRef = useRef<NeonRenderer | null>(null);
  
  const animFrameRef = useRef<number>(0);
  const localLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const remoteLandmarksRef = useRef<PoseLandmark[] | null>(null);
  const localMaskRef = useRef<any | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const ignoreSettingsSync = useRef(false);

  useEffect(() => {
    if (ignoreSettingsSync.current) {
      ignoreSettingsSync.current = false;
      return;
    }
    peerEngineRef.current?.sendEvent('SETTINGS_SYNC', { neonSettings, background });
  }, [neonSettings, background]);

  useEffect(() => {
    if (!roomId || !user) {
      navigate('/');
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        if (!videoRef.current || !localCanvasRef.current || !remoteCanvasRef.current) return;

        // 1. Init Pose Engine
        const poseEngine = new PoseEngine((landmarks, mask) => {
          localLandmarksRef.current = landmarks;
          localMaskRef.current = mask;
          // Send to peer at ~30fps
          peerEngineRef.current?.sendPose(landmarks);
        });
        poseEngineRef.current = poseEngine;
        await poseEngine.init();

        if (cancelled) return;

        // 2. Start Camera
        const stream = await poseEngine.startCamera(videoRef.current);
        localStreamRef.current = stream;

        if (localFaceCamRef.current) {
          localFaceCamRef.current.srcObject = stream;
        }

        // 3. Init Renderers immediately (don't wait for peer)
        localRendererRef.current = new NeonRenderer(localCanvasRef.current);
        remoteRendererRef.current = new NeonRenderer(remoteCanvasRef.current);
        
        // Start pose detection immediately
        poseEngine.start();
        setLoading(false);

        // 4. Init Peer Engine in background (non-blocking)
        const peerEngine = new PeerEngine({
          onStream: (remoteStream) => {
            if (remoteFaceCamRef.current) {
              remoteFaceCamRef.current.srcObject = remoteStream;
            }
          },
          onData: (msg) => {
            if (msg.type === 'pose' && msg.data) {
              remoteLandmarksRef.current = msg.data.map((l: any) => ({
                x: l[0], y: l[1], visibility: l[2]
              }));
            } else if (msg.type === 'pose' && !msg.data) {
              remoteLandmarksRef.current = null;
            } else if (msg.type === 'YOUTUBE_SYNC') {
              setYtVideoId(msg.payload.videoId);
              setIncomingSyncEvent(msg.payload);
            } else if (msg.type === 'SETTINGS_SYNC') {
              ignoreSettingsSync.current = true;
              updateNeonSettings(msg.payload.neonSettings);
              if (msg.payload.background) setBackground(msg.payload.background);
            }
          },
          onConnect: () => setIsConnected(true),
          onDisconnect: () => setIsConnected(false),
          onError: (err) => console.error('Peer error:', err),
        });
        peerEngineRef.current = peerEngine;

        try {
          if (user!.isHost) {
            console.log('[RoomStage] Initializing as HOST with roomId:', roomId);
            await peerEngine.initHost(roomId!, stream);
            console.log('[RoomStage] Host ready, waiting for guest to join...');
          } else {
            console.log('[RoomStage] Initializing as GUEST, connecting to:', roomId);
            await peerEngine.initGuest(roomId!, stream);
            console.log('[RoomStage] Guest connected!');
          }
        } catch (peerErr: any) {
          console.error('[RoomStage] Peer connection error:', peerErr);
          // Don't block the UI - just show a warning, user can still dance solo
        }

      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to connect. Make sure your camera is allowed.');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      poseEngineRef.current?.destroy();
      peerEngineRef.current?.destroy();
      localRendererRef.current?.destroy();
      remoteRendererRef.current?.destroy();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [roomId, user, navigate]);

  // Render Loop (Handles 2 dancers + background)
  useEffect(() => {
    if (loading || error) return;

    const render = () => {
      const localCanvas = localCanvasRef.current;
      const remoteCanvas = remoteCanvasRef.current;
      const localRenderer = localRendererRef.current;
      const remoteRenderer = remoteRendererRef.current;

      if (!localCanvas || !remoteCanvas || !localRenderer || !remoteRenderer || !containerRef.current) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Local Canvas resizing
      const localW = localCanvas.parentElement!.clientWidth;
      const localH = localCanvas.parentElement!.clientHeight;
      if (localCanvas.style.width !== `${localW}px` || localCanvas.style.height !== `${localH}px`) {
        localRenderer.resize(localW, localH);
      }

      // Remote Canvas resizing
      const remoteW = remoteCanvas.parentElement!.clientWidth;
      const remoteH = remoteCanvas.parentElement!.clientHeight;
      if (remoteCanvas.style.width !== `${remoteW}px` || remoteCanvas.style.height !== `${remoteH}px`) {
        remoteRenderer.resize(remoteW, remoteH);
      }

      // We don't have separate settings for remote yet, so use a secondary color theme for them
      const remoteSettings = { ...neonSettings, theme: (neonSettings.theme === 'cyan' ? 'magenta' : 'cyan') as NeonTheme };

      // Render Local (mirrored for self-view)
      localRenderer.render(
        localLandmarksRef.current,
        neonSettings,
        localW,
        localH,
        mirrorMode,
        background,
        isCameraOn ? localFaceCamRef.current : undefined,
        localMaskRef.current
      );

      // Render Remote (not mirrored so we see them as they are)
      remoteRenderer.render(
        remoteLandmarksRef.current,
        remoteSettings,
        remoteW,
        remoteH,
        !mirrorMode,
        background
      );

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [loading, error, neonSettings, background, mirrorMode]);



  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      // Create a combined canvas to record both dancers
      const combinedCanvas = document.createElement('canvas');
      const ctx = combinedCanvas.getContext('2d')!;
      
      const localCanvas = localCanvasRef.current;
      const remoteCanvas = remoteCanvasRef.current;
      
      if (!localCanvas || !remoteCanvas) return;
      
      combinedCanvas.width = localCanvas.width + remoteCanvas.width;
      combinedCanvas.height = Math.max(localCanvas.height, remoteCanvas.height);

      // Must append to DOM for some browsers to allow captureStream, but we can hide it
      combinedCanvas.style.display = 'none';
      document.body.appendChild(combinedCanvas);

      const stream = combinedCanvas.captureStream(30);
      
      // Draw loop for recording
      const drawCombined = () => {
        if (mediaRecorderRef.current?.state !== 'recording') {
           if (document.body.contains(combinedCanvas)) document.body.removeChild(combinedCanvas);
           return;
        }
        // Fill background
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
        
        ctx.drawImage(remoteCanvas, 0, 0);
        ctx.drawImage(localCanvas, remoteCanvas.width, 0);

        // Draw face cameras in top corners
        if (remoteFaceCamRef.current && remoteFaceCamRef.current.readyState >= 2) {
           ctx.drawImage(remoteFaceCamRef.current, 20, 20, 160, 120);
        }
        if (localFaceCamRef.current && localFaceCamRef.current.readyState >= 2) {
           // Mirror local face cam by flipping context
           ctx.save();
           ctx.translate(combinedCanvas.width - 20, 20);
           ctx.scale(-1, 1);
           ctx.drawImage(localFaceCamRef.current, 0, 0, 160, 120);
           ctx.restore();
        }

        requestAnimationFrame(drawCombined);
      };
      
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        recordedChunksRef.current = [];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NeonDance-Room-${new Date().getTime()}.webm`;
        a.click();
      };

      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      setIsRecording(true);
      recorder.start();
      drawCombined();
      
    } catch (err) {
      console.error('Recording failed:', err);
      setIsRecording(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const handleMusicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYoutubeId(musicInputUrl);
    if (id) {
      setYtVideoId(id);
      peerEngineRef.current?.sendEvent('YOUTUBE_SYNC', { videoId: id, state: 'play', time: 0 });
      setShowMusicInput(false);
      setMusicInputUrl('');
    }
  };

  const handleMusicSync = (event: SyncEvent) => {
    peerEngineRef.current?.sendEvent('YOUTUBE_SYNC', event);
  };

  return (
    <div className="dance-stage" ref={containerRef}>
      <video ref={videoRef} className="hidden-video" playsInline muted />

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">
            {user?.isHost ? 'Creating Room...' : 'Joining Room...'}
          </div>
          <div className="loading-hint">
            Allow camera access when prompted
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="error-overlay">
          <div className="error-title">Oops!</div>
          <div className="error-msg">{error}</div>
          <button className="btn btn-primary" onClick={handleBack}>Back to Home</button>
        </div>
      )}

      {/* Top bar - always rendered after loading */}
      {!loading && !error && (
        <div className="top-bar">
          <div className="top-bar-left">
            <button className="back-btn" onClick={handleBack}>
              <ArrowLeft size={16} /> Leave
            </button>
            <span className="room-badge">Room: {roomId}</span>
          </div>
          <div className="top-bar-right">
            <span className="stat-badge" style={{ color: isConnected ? '#00ff88' : '#ff8800' }}>
              {isConnected ? '🟢 Connected' : '🟡 Waiting for partner...'}
            </span>
          </div>
        </div>
      )}

      {/* Canvases - ALWAYS in DOM so refs are available during init */}
      <div className="split-container" style={{ visibility: loading || error ? 'hidden' : 'visible' }}>
        {/* Remote Partner View */}
        <div className="split-view split-view-remote">
          <div className="split-label">Partner</div>
          <canvas ref={remoteCanvasRef} className="neon-canvas" />
          {isConnected && (
            <div className="face-camera-embedded">
              <video ref={remoteFaceCamRef} playsInline autoPlay />
            </div>
          )}
        </div>

        {/* Local View */}
        <div className="split-view">
          <div className="split-label">You</div>
          <canvas ref={localCanvasRef} className="neon-canvas" />
          {isCameraOn && (
            <div className="face-camera-embedded face-camera-mirrored">
              <video ref={localFaceCamRef} playsInline autoPlay muted />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      {!loading && !error && (
        <div className="bottom-controls">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          
          {/* Music Input Modal */}
          {showMusicInput && (
            <div style={{ background: 'rgba(10,10,20,0.9)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', gap: '10px' }}>
              <form onSubmit={handleMusicSubmit} style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  placeholder="Paste YouTube Link..." 
                  value={musicInputUrl}
                  onChange={(e) => setMusicInputUrl(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '6px', outline: 'none', width: '250px' }}
                />
                <button type="submit" style={{ background: '#00f5ff', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Play</button>
              </form>
              <button onClick={() => setYtVideoId(null)} style={{ background: 'rgba(255,60,60,0.2)', color: '#ff6b6b', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>Stop</button>
            </div>
          )}

          <div className="controls-bar">
            <button
              className="ctrl-btn"
              onClick={() => {
                peerEngineRef.current?.destroy();
                navigate('/');
              }}
              title="Leave Room"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="ctrl-divider" />

            <button
              className={`ctrl-btn ${isCameraOn ? 'active' : 'inactive'}`}
              onClick={toggleCamera}
              title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className={`ctrl-btn ${isMuted ? 'inactive' : 'active'}`}
              onClick={toggleMic}
              title={isMuted ? 'Turn on mic' : 'Turn off mic'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
              className={`ctrl-btn ${mirrorMode ? 'active' : ''}`}
              onClick={() => setMirrorMode(!mirrorMode)}
              title={mirrorMode ? 'Mirror Off' : 'Mirror On'}
            >
              <FlipHorizontal size={20} />
            </button>
            
            <button
              className={`ctrl-btn ${ytVideoId ? 'active' : ''}`}
              onClick={() => setShowMusicInput(!showMusicInput)}
              title="Play Music"
            >
              <Music size={20} />
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
              onClick={() => document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen()}
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

      {/* YouTube Music Player */}
      {ytVideoId && (
        <MusicPlayer 
          videoId={ytVideoId} 
          onSync={handleMusicSync}
          incomingSyncEvent={incomingSyncEvent}
        />
      )}
    </div>
  );
}
