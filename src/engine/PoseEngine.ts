/**
 * PoseEngine — Wraps MediaPipe Pose Landmarker for real-time body tracking.
 * Uses One Euro Filters for smooth, jitter-free landmark output.
 */

import { LandmarkFilter } from '../utils/filters';

// We'll load MediaPipe from CDN to avoid WASM bundling issues
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

type PoseCallback = (landmarks: PoseLandmark[] | null, mask?: any | null) => void;

export class PoseEngine {
  private poseLandmarker: any = null;
  private filters: LandmarkFilter[] = [];
  private callback: PoseCallback;
  private video: HTMLVideoElement | null = null;
  private running = false;
  private rafId: number = 0;
  private lastTimestamp: number = -1;

  constructor(callback: PoseCallback) {
    this.callback = callback;
    // Pre-create 33 landmark filters
    for (let i = 0; i < 33; i++) {
      this.filters.push(new LandmarkFilter(30, 1.2, 0.01));
    }
  }

  async init(): Promise<void> {
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { PoseLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);

      this.poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: true,
      });

      console.log('[PoseEngine] Initialized successfully');
    } catch (error) {
      console.error('[PoseEngine] Failed to initialize:', error);
      throw error;
    }
  }

  async startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    this.video = videoElement;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
        facingMode: 'user',
      },
      audio: true, // Enable audio for voice chat
    });

    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.detect();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private detect = (): void => {
    if (!this.running || !this.video || !this.poseLandmarker) return;

    if (this.video.readyState >= 2) {
      const now = performance.now();
      // MediaPipe requires strictly increasing timestamps
      if (now > this.lastTimestamp) {
        try {
          const result = this.poseLandmarker.detectForVideo(this.video, now);

          if (result.landmarks && result.landmarks.length > 0) {
            const raw = result.landmarks[0];

            // Zero Latency mode: Bypass filters for instant tracking
            const smoothed: PoseLandmark[] = raw.map(
              (lm: any) => ({ x: lm.x, y: lm.y, z: lm.z ?? 0, visibility: lm.visibility ?? 1 })
            );
            
            const mask = result.segmentationMasks && result.segmentationMasks.length > 0 
                ? result.segmentationMasks[0] 
                : null;

            this.callback(smoothed, mask);
          } else {
            this.callback(null, null);
          }
        } catch {
          // Skip frame on error
        }
        this.lastTimestamp = now;
      }
    }

    this.rafId = requestAnimationFrame(this.detect);
  };

  destroy(): void {
    this.stop();
    if (this.video?.srcObject) {
      (this.video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      this.video.srcObject = null;
    }
    this.poseLandmarker?.close();
  }
}
