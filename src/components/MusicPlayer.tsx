import React, { useEffect, useRef, useState } from 'react';
import YouTube, { type YouTubeProps } from 'react-youtube';

export interface SyncEvent {
  videoId: string;
  state: 'play' | 'pause' | 'seek';
  time: number;
}

interface MusicPlayerProps {
  videoId: string | null;
  onSync: (event: SyncEvent) => void;
  incomingSyncEvent: SyncEvent | null;
}

export default function MusicPlayer({ videoId, onSync, incomingSyncEvent }: MusicPlayerProps) {
  const playerRef = useRef<any>(null);
  const ignoreNextEvent = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: 80 }); // Top right default

  useEffect(() => {
    if (!incomingSyncEvent || !playerRef.current) return;
    
    // We are receiving a command from the peer, so we must ignore the subsequent onStateChange
    ignoreNextEvent.current = true;
    const player = playerRef.current;
    
    try {
      if (incomingSyncEvent.state === 'play') {
        player.seekTo(incomingSyncEvent.time, true);
        player.playVideo();
      } else if (incomingSyncEvent.state === 'pause') {
        player.seekTo(incomingSyncEvent.time, true);
        player.pauseVideo();
      } else if (incomingSyncEvent.state === 'seek') {
        player.seekTo(incomingSyncEvent.time, true);
      }
    } catch (e) {
      console.error('YT Sync Error:', e);
    }
  }, [incomingSyncEvent]);

  if (!videoId) return null;

  const onReady: YouTubeProps['onReady'] = (event) => {
    playerRef.current = event.target;
  };

  const onStateChange: YouTubeProps['onStateChange'] = (event) => {
    if (ignoreNextEvent.current) {
      ignoreNextEvent.current = false;
      return;
    }
    
    const player = event.target;
    const time = player.getCurrentTime();
    
    // 1 = playing, 2 = paused
    if (event.data === 1) {
      onSync({ videoId, state: 'play', time });
    } else if (event.data === 2) {
      onSync({ videoId, state: 'pause', time });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      setPos(p => ({ x: p.x - e.movementX, y: p.y + e.movementY }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className="music-player-container"
      style={{ right: `${pos.x}px`, top: `${pos.y}px` }}
    >
      <div 
        className="music-player-drag-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        🎵 Sync Player (Drag)
      </div>
      <YouTube 
        videoId={videoId} 
        opts={{
          height: '140',
          width: '240',
          playerVars: {
            autoplay: 1,
            controls: 1,
            disablekb: 1,
          },
        }}
        onReady={onReady}
        onStateChange={onStateChange}
      />
    </div>
  );
}
