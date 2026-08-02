import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Plus, LogIn, User } from 'lucide-react';
import ParticleBackground from './ParticleBackground';
import { useStore } from '../store';
import { generateRoomCode, generateGuestName, generateId } from '../utils/helpers';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);
  const setRoomCode = useStore((s) => s.setRoomCode);
  const user = useStore((s) => s.user);

  const [name, setName] = useState(user?.name || '');
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const ensureUser = useCallback(() => {
    const displayName = name.trim() || generateGuestName();
    const u = {
      id: user?.id || generateId(),
      name: displayName,
      isHost: false,
      isMuted: false,
      isCameraOn: true,
    };
    setUser(u);
    setName(displayName);
    return u;
  }, [name, user, setUser]);

  const handleCreate = () => {
    const displayName = name.trim() || generateGuestName();
    const u = {
      id: user?.id || generateId(),
      name: displayName,
      isHost: true,
      isMuted: false,
      isCameraOn: true,
    };
    setUser(u);
    setName(displayName);
    const code = generateRoomCode();
    setRoomCode(code);
    navigate(`/room/${code}`);
  };

  const handleJoin = () => {
    if (joinCode.trim().length < 4) return;
    ensureUser();
    setRoomCode(joinCode.trim().toUpperCase());
    navigate(`/room/${joinCode.trim().toUpperCase()}`);
  };

  const handleSolo = () => {
    ensureUser();
    navigate('/solo');
  };

  return (
    <div className="landing">
      <ParticleBackground />

      <div className="hero-card glass-strong">
        <div className="logo-icon">💃</div>
        <h1 className="hero-title">NeonDance</h1>
        <p className="hero-subtitle">
          Transform into a glowing <span>neon stick figure</span> and dance
          with friends in real-time
        </p>

        {/* Name Input */}
        <div className="name-input-group">
          <label htmlFor="guest-name">
            <User size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Your Dance Name
          </label>
          <input
            id="guest-name"
            className="name-input"
            type="text"
            placeholder="Enter a name or get a random one..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
        </div>

        {/* Action Buttons */}
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleCreate}>
            <Plus size={18} className="btn-icon" />
            Create Dance Room
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowJoin(!showJoin)}
          >
            <LogIn size={18} className="btn-icon" />
            Join a Room
          </button>
        </div>

        {/* Join Room Input */}
        {showJoin && (
          <div className="room-input-row">
            <input
              className="room-code-input"
              type="text"
              placeholder="Room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              className="btn-join"
              onClick={handleJoin}
              disabled={joinCode.trim().length < 4}
            >
              Go!
            </button>
          </div>
        )}

        <div className="divider">or</div>

        <button className="btn btn-solo" onClick={handleSolo}>
          <Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          Practice Solo (no room needed)
        </button>
      </div>

      <p className="landing-footer">
        Works best in Chrome &middot; Webcam required &middot; No sign-up needed
      </p>
    </div>
  );
}
