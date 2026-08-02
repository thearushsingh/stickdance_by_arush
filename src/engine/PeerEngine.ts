import { Peer } from 'peerjs';
import type { DataConnection, MediaConnection } from 'peerjs';
import type { PoseLandmark } from './PoseEngine';

type PeerCallback = {
  onStream: (stream: MediaStream) => void;
  onData: (data: any) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (err: any) => void;
};

export class PeerEngine {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private call: MediaConnection | null = null;
  private callbacks: PeerCallback;
  private localStream: MediaStream | null = null;
  public myId: string | null = null;

  constructor(callbacks: PeerCallback) {
    this.callbacks = callbacks;
  }

  // Initialize as Host (creates the room ID)
  initHost(roomId: string, stream: MediaStream): Promise<void> {
    return new Promise((resolve, reject) => {
      this.localStream = stream;
      // Use the room code as the peer ID for the host
      this.peer = new Peer(roomId, {
        debug: 2,
      });

      let timeoutId = setTimeout(() => {
        reject(new Error('Connection timed out while creating room. PeerJS server might be unreachable or the ID is taken.'));
      }, 10000);

      this.peer.on('open', (id) => {
        console.log('[PeerEngine] Host ready, ID:', id);
        this.myId = id;
        clearTimeout(timeoutId);
        resolve();
      });

      this.peer.on('connection', (c) => {
        console.log('[PeerEngine] Peer connected via DataChannel');
        this.conn = c;
        this.setupConnection(c);
        this.callbacks.onConnect();
      });

      this.peer.on('call', (call) => {
        console.log('[PeerEngine] Receiving call');
        this.call = call;
        call.answer(this.localStream!); // Answer with our stream
        this.setupCall(call);
      });

      this.peer.on('error', (err) => {
        console.error('[PeerEngine] Error:', err);
        clearTimeout(timeoutId);
        this.callbacks.onError(err);
        reject(err);
      });
    });
  }

  // Initialize as Guest (joins the room ID)
  initGuest(roomId: string, stream: MediaStream): Promise<void> {
    return new Promise((resolve, reject) => {
      this.localStream = stream;
      this.peer = new Peer({ debug: 2 });

      let timeoutId = setTimeout(() => {
        reject(new Error('Connection timed out. Ensure the host is still in the room.'));
      }, 10000);

      this.peer.on('open', (id) => {
        console.log('[PeerEngine] Guest ready, ID:', id);
        this.myId = id;
        
        // Connect to the host's ID
        this.conn = this.peer!.connect(roomId);
        this.setupConnection(this.conn, () => {
          clearTimeout(timeoutId);
          resolve();
        });

        // Call the host
        this.call = this.peer!.call(roomId, this.localStream!);
        this.setupCall(this.call);
      });

      this.peer.on('error', (err) => {
        console.error('[PeerEngine] Error:', err);
        clearTimeout(timeoutId);
        this.callbacks.onError(err);
        reject(err);
      });
    });
  }

  private setupConnection(c: DataConnection, onOpenCallback?: () => void) {
    c.on('open', () => {
      if (onOpenCallback) onOpenCallback();
      this.callbacks.onConnect();
    });

    c.on('data', (data) => {
      this.callbacks.onData(data);
    });

    c.on('close', () => {
      this.callbacks.onDisconnect();
    });
  }

  private setupCall(call: MediaConnection) {
    call.on('stream', (remoteStream) => {
      this.callbacks.onStream(remoteStream);
    });

    call.on('close', () => {
      this.callbacks.onDisconnect();
    });
  }

  // Send pose landmarks to the other peer
  sendPose(landmarks: PoseLandmark[] | null) {
    if (this.conn && this.conn.open) {
      // Compress slightly to save bandwidth (only send what's needed)
      if (landmarks) {
        const compressed = landmarks.map(l => [
          Math.round(l.x * 1000) / 1000, 
          Math.round(l.y * 1000) / 1000, 
          Math.round(l.visibility * 100) / 100
        ]);
        this.conn.send({ type: 'pose', data: compressed });
      } else {
        this.conn.send({ type: 'pose', data: null });
      }
    }
  }
  
  // Send other events (e.g., sync music, change theme)
  sendEvent(type: string, payload: any) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type, payload });
    }
  }

  destroy() {
    if (this.conn) this.conn.close();
    if (this.call) this.call.close();
    if (this.peer) this.peer.destroy();
  }
}
