const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const RING_MCP = 13;
const PINKY_MCP = 17;

const FINGER_PAIRS = [
  [2, 4],
  [5, 8],
];

const SPREAD_PAIRS = [[4, 8]];

export class HandState {
  constructor() {
    this.joints = new Array(21).fill(null).map(() => [0, 0, 0]);
    this.palmCenter = [0, 0, 0];
    this.palmNormal = [0, 1, 0];
    this.handVelocity = [0, 0, 0];
    this.handSpeed = 0;
    this.handAcceleration = [0, 0, 0];
    this.handAccelNorm = 0;
    this.fingerSpreadNorm = 0;
    this.clenchFactor = 0;
    this.wristRotationRate = 0;
    this.isTracked = false;
    this.timeSinceUpdate = 0;

    this.depthScale = 1.0;
    this.smoothPalmAngle = 0;
    this.fingerCurl = [0, 0, 0, 0, 0];
    this.poseId = 0;

    this.normalizedJoints = new Array(21).fill(null).map(() => [0.5, 0.5]);
    this.normalizedPalmCenter = [0.5, 0.5];
    this.normalizedFingerTips = [
      [0.5, 0.5],
      [0.5, 0.5],
    ];

    this._prevPalm = null;
    this._prevVel = null;
    this._prevNormal = null;
    this._prevTime = null;
  }

  update(landmarks) {
    const now = performance.now();

    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i];
      this.joints[i] = [(lm.x - 0.5) * 0.3, -(lm.y - 0.5) * 0.3, -lm.z * 0.3];
    }

    for (let i = 0; i < 21; i++) {
      this.normalizedJoints[i] = [1 - landmarks[i].x, 1 - landmarks[i].y];
    }
    const nw = this.normalizedJoints[WRIST];
    const nim = this.normalizedJoints[INDEX_MCP];
    const nmm = this.normalizedJoints[MIDDLE_MCP];
    const nrm = this.normalizedJoints[RING_MCP];
    const npm = this.normalizedJoints[PINKY_MCP];
    this.normalizedPalmCenter = [
      (nw[0] + nim[0] + nmm[0] + nrm[0] + npm[0]) / 5,
      (nw[1] + nim[1] + nmm[1] + nrm[1] + npm[1]) / 5,
    ];
    this.normalizedFingerTips = [
      [...this.normalizedJoints[4]],
      [...this.normalizedJoints[8]],
    ];

    const w = this.joints[WRIST];
    const im = this.joints[INDEX_MCP];
    const mm = this.joints[MIDDLE_MCP];
    const rm = this.joints[RING_MCP];
    const pm = this.joints[PINKY_MCP];
    this.palmCenter = [
      (w[0] + im[0] + mm[0] + rm[0] + pm[0]) / 5,
      (w[1] + im[1] + mm[1] + rm[1] + pm[1]) / 5,
      (w[2] + im[2] + mm[2] + rm[2] + pm[2]) / 5,
    ];

    const v1 = sub3(im, w);
    const v2 = sub3(pm, w);
    const n = cross3(v1, v2);
    const nLen = len3(n);
    this.palmNormal = nLen > 1e-7 ? scale3(n, 1 / nLen) : [0, 1, 0];

    if (this._prevPalm && this._prevTime) {
      const dt = (now - this._prevTime) / 1000;
      if (dt > 1e-6) {
        const newVel = scale3(sub3(this.palmCenter, this._prevPalm), 1 / dt);
        this.handVelocity = lerp3(newVel, this._prevVel || newVel, 0.5);
      }
    }
    this.handSpeed = len3(this.handVelocity);

    if (this._prevVel && this._prevTime) {
      const dt = (now - this._prevTime) / 1000;
      if (dt > 1e-6) {
        this.handAcceleration = scale3(
          sub3(this.handVelocity, this._prevVel),
          1 / dt,
        );
        this.handAccelNorm = len3(this.handAcceleration);
      }
    }

    if (this._prevNormal && this._prevTime) {
      const dt = (now - this._prevTime) / 1000;
      const dot = clampDot(dot3(this._prevNormal, this.palmNormal));
      const angle = Math.acos(dot);
      this.wristRotationRate = dt > 1e-6 ? angle / dt : 0;
    }

    this.fingerSpreadNorm = this._computeSpread();

    this.clenchFactor = this._computeClench();

    const handSpan = Math.sqrt(
      Math.pow(landmarks[0].x - landmarks[12].x, 2) +
        Math.pow(landmarks[0].y - landmarks[12].y, 2),
    );
    this.depthScale = Math.max(0.3, Math.min(2.5, handSpan / 0.22));

    const wristN = this.normalizedJoints[0];
    const midN = this.normalizedJoints[9];
    const rawAngle = Math.atan2(midN[0] - wristN[0], -(midN[1] - wristN[1]));
    this.smoothPalmAngle += (rawAngle - this.smoothPalmAngle) * 0.15;

    const tipIndices = [4, 8, 12, 16, 20];
    const baseIndices = [2, 5, 9, 13, 17];
    for (let f = 0; f < 5; f++) {
      const bToT = sub3(
        this.joints[tipIndices[f]],
        this.joints[baseIndices[f]],
      );
      const bToW = sub3(this.joints[WRIST], this.joints[baseIndices[f]]);
      const maxLen = len3(bToW) * 1.5;
      const curLen = len3(bToT);
      this.fingerCurl[f] =
        1 - Math.max(0, Math.min(1, curLen / Math.max(maxLen, 0.001)));
    }

    this.poseId = this._classifyPose();

    this.isTracked = true;
    this.timeSinceUpdate = 0;

    this._prevPalm = [...this.palmCenter];
    this._prevVel = [...this.handVelocity];
    this._prevNormal = [...this.palmNormal];
    this._prevTime = now;
  }

  tick(dt) {
    if (this.isTracked) {
      this.timeSinceUpdate += dt;
      if (this.timeSinceUpdate > 500) this.isTracked = false;
    }
  }

  _computeSpread() {
    let total = 0;
    const w = this.joints[WRIST];
    for (const [a, b] of SPREAD_PAIRS) {
      const va = normalize3(sub3(this.joints[a], w));
      const vb = normalize3(sub3(this.joints[b], w));
      total += Math.acos(clampDot(dot3(va, vb)));
    }
    const avg = total / SPREAD_PAIRS.length;
    return Math.max(0, Math.min(1, (avg - 0.05) / 0.45));
  }

  _computeClench() {
    let totalExt = 0;
    for (const [base, tip] of FINGER_PAIRS) {
      const bToT = sub3(this.joints[tip], this.joints[base]);
      const bToW = sub3(this.joints[WRIST], this.joints[base]);
      const maxLen = len3(bToW) * 1.5;
      const curLen = len3(bToT);
      totalExt += Math.max(0, Math.min(1, curLen / Math.max(maxLen, 0.001)));
    }
    return 1 - totalExt / FINGER_PAIRS.length;
  }

  _classifyPose() {
    const c = this.fingerCurl;
    const thumbExt = c[0] < 0.35;
    const indexExt = c[1] < 0.35;
    const thumbCurled = c[0] > 0.6;
    const indexCurled = c[1] > 0.6;

    if (thumbExt && indexExt) return 0;
    if (thumbCurled && indexCurled) return 1;
    if (indexExt && !thumbExt) return 3;
    return 2;
  }
}

export class HandTracker {
  constructor(videoElement) {
    this.video = videoElement;
    this.handState = new HandState();
    this._hands = null;
    this._camera = null;
  }

  async init() {
    const { Hands } = await import("@mediapipe/hands");
    const { Camera } = await import("@mediapipe/camera_utils");

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    this._hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        this.handState.update(results.multiHandLandmarks[0]);
      }
    });

    this._camera = new Camera(this.video, {
      onFrame: async () => {
        await this._hands.send({ image: this.video });
      },
      width: 640,
      height: 480,
    });

    await this._camera.start();
  }
}

export class SimulatedHand {
  constructor(handState) {
    this.handState = handState;
    this.active = false;
  }

  tick(dt) {
    if (!this.active) return;

    const palmX = 0.5;
    const palmY = 0.5;
    const openness = 1.0;

    const BASE_ANGLES = [-0.9, -0.45, 0, 0.45, 0.9];
    const SEG = [0.035, 0.04, 0.042, 0.038];

    const landmarks = [];
    landmarks.push({ x: palmX, y: palmY + 0.04, z: 0 });

    const thumbAngle = -0.9 + openness * 0.2;
    for (let j = 0; j < 4; j++) {
      const ext = (j + 1) * 0.032 * (0.4 + openness * 0.6);
      landmarks.push({
        x: palmX + Math.sin(thumbAngle) * ext,
        y: palmY - Math.cos(thumbAngle) * ext,
        z: 0,
      });
    }

    for (let f = 0; f < 4; f++) {
      const baseAngle = BASE_ANGLES[f + 1];
      for (let j = 0; j < 4; j++) {
        const ext = (j + 1) * SEG[j] * (0.15 + openness * 0.85);
        landmarks.push({
          x: palmX + Math.sin(baseAngle) * ext,
          y: palmY - Math.cos(baseAngle) * ext,
          z: 0,
        });
      }
    }

    this.handState.update(landmarks);
  }
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function len3(a) {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}
function normalize3(a) {
  const l = len3(a);
  return l > 1e-7 ? scale3(a, 1 / l) : [0, 0, 0];
}
function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
function clampDot(d) {
  return Math.max(-1, Math.min(1, d));
}
