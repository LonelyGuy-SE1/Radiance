import * as THREE from "three";

function hueToRgb(h) {
  const s = 1.0,
    l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 1 / 6) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 2 / 6) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 3 / 6) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 4 / 6) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 5 / 6) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return [r + m, g + m, b + m];
}

const BONES = [
  [0, 1, 0, 0],
  [1, 2, 0, 1],
  [2, 3, 0, 2],
  [3, 4, 0, 3],
  [0, 5, 1, 0],
  [5, 6, 1, 1],
  [6, 7, 1, 2],
  [7, 8, 1, 3],
];
const WEB = [[4, 8]];
const TIP_IDS = [4, 8];

const FINGER_COLS = [
  [1.0, 0.4, 0.55],
  [1.0, 0.85, 0.2],
];
const PALM_COL = [1.0, 0.95, 1.0];

const HUD_SEGS = 96;
const HUD_TICKS = 36;
const NUM_PALM_RINGS = 2;
const RING_SEGS = 48;
const BAR_COUNT = 28;
const CUBE_COUNT = 18;
const NUM_POINTERS = 8;
const TRAIL_MAX_DOTS = 80;
const TOTAL_TRAIL_DOTS = NUM_POINTERS * TRAIL_MAX_DOTS;
const EFFECT_PARTICLE_COUNT = 150;
const RIPPLE_MAX = 4;
const RIPPLE_SEGS = 48;
const RIPPLE_LINE_VERTS = RIPPLE_MAX * RIPPLE_SEGS * 2;

const SKEL_V = (BONES.length + WEB.length) * 2;
const PALM_RING_V = NUM_PALM_RINGS * RING_SEGS * 2;
const HUD_RING_V = HUD_SEGS * 2 * 2;
const HUD_TICK_V = HUD_TICKS * 2;
const SPOKE_V = NUM_POINTERS * 2;

const TOTAL_LINE_VERTS =
  SKEL_V + PALM_RING_V + HUD_RING_V + HUD_TICK_V + SPOKE_V;

const BAR_OUTLINE_V = BAR_COUNT * 8;
const CUBE_OUTLINE_V = CUBE_COUNT * 8;
const TOTAL_OUTLINE_VERTS = BAR_OUTLINE_V + CUBE_OUTLINE_V;

const DOT_COUNT = 21;
const TOTAL_POINTS = DOT_COUNT;

export class RadialParticleSystem {
  constructor(count = 25000) {
    this.actualCount =
      TOTAL_LINE_VERTS +
      TOTAL_OUTLINE_VERTS +
      TOTAL_POINTS +
      (BAR_COUNT + CUBE_COUNT) * 4 +
      TOTAL_TRAIL_DOTS +
      EFFECT_PARTICLE_COUNT +
      RIPPLE_LINE_VERTS;
    this._scale = 1.0;
    this._aspect = window.innerWidth / window.innerHeight;
    this._showSkeleton = false;

    this._cubeAngle = new Float32Array(CUBE_COUNT);
    this._cubeRadOff = new Float32Array(CUBE_COUNT);
    this._cubeVAng = new Float32Array(CUBE_COUNT);
    this._cubeVRad = new Float32Array(CUBE_COUNT);
    this._prevClench = 0;
    this._prevRot = 0;
    this._physicsReady = false;
    this._cubeRandSize = new Float32Array(CUBE_COUNT);
    this._cubeEqAngle = new Float32Array(CUBE_COUNT);
    this._cubeEqRadOff = new Float32Array(CUBE_COUNT);
    for (let i = 0; i < CUBE_COUNT; i++) {
      this._cubeEqAngle[i] = (i / CUBE_COUNT) * Math.PI * 2;
      this._cubeAngle[i] = this._cubeEqAngle[i];
      this._cubeEqRadOff[i] = (Math.random() - 0.5) * 0.015;
      this._cubeRadOff[i] = this._cubeEqRadOff[i];
      this._cubeRandSize[i] = 0.0008 + Math.random() * 0.001;
    }

    this._cubeCornersCache = new Float32Array(CUBE_COUNT * 8);
    this._cubeColorCache = new Float32Array(CUBE_COUNT * 3);
    this._barCornersCache = new Float32Array(BAR_COUNT * 8);
    this._barColorCache = new Float32Array(BAR_COUNT * 3);

    this._pointerTrails = Array.from({ length: NUM_POINTERS }, () => []);
    this._prevPointerPos = Array.from({ length: NUM_POINTERS }, () => null);

    this._isPinching = false;
    this._prevPinch = false;
    this._pinchMid = [0.5, 0.5];
    this._summonPhase = 0;
    this._compressionGlow = 0;
    this._prevPoseId = 0;
    this._hudR = 0.05;
    this._tiMid = [0.5, 0.5];
    this._tiDist = 0.1;

    this._smoothPointerPos = Array.from({ length: NUM_POINTERS }, () => null);
    this._smoothDirAngle = 0;
    this._smoothSpread = 0.1;
    this._sensitivity = 0.3;

    this._barEnergy = new Float32Array(BAR_COUNT);
    this._barTarget = new Float32Array(BAR_COUNT);

    this._fxParticles = [];
    for (let i = 0; i < EFFECT_PARTICLE_COUNT; i++) {
      this._fxParticles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        hue: 0,
        size: 3,
        active: false,
      });
    }

    this._ripplePool = [];
    for (let i = 0; i < RIPPLE_MAX; i++) {
      this._ripplePool.push({
        cx: 0,
        cy: 0,
        radius: 0,
        speed: 0,
        life: 0,
        maxLife: 1,
        active: false,
      });
    }

    this.mesh = new THREE.Group();
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    this._buildLines();
    this._buildOutlines();
    this._buildBars();
    this._buildCubes();
    this._buildDots();
    this._buildTrailDots();
    this._buildEffectDots();
    this._buildRippleLines();

    this._onResize = () => {
      this._aspect = window.innerWidth / window.innerHeight;
    };
    window.addEventListener("resize", this._onResize);
  }

  _buildLines() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(TOTAL_LINE_VERTS * 3), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(TOTAL_LINE_VERTS * 3), 3),
    );
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this._linesMesh = new THREE.LineSegments(geo, mat);
    this._linesMesh.frustumCulled = false;
    this._lineGeo = geo;
    this._lineMat = mat;
    this.mesh.add(this._linesMesh);
  }

  _buildOutlines() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(TOTAL_OUTLINE_VERTS * 3), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(TOTAL_OUTLINE_VERTS * 3), 3),
    );
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this._outlineMesh = new THREE.LineSegments(geo, mat);
    this._outlineMesh.frustumCulled = false;
    this._outlineGeo = geo;
    this._outlineMat = mat;
    this.mesh.add(this._outlineMesh);
  }

  _buildBars() {
    const vCount = BAR_COUNT * 4,
      iCount = BAR_COUNT * 6;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(vCount * 3), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(vCount * 3), 3),
    );
    const idx = new Uint16Array(iCount);
    for (let i = 0; i < BAR_COUNT; i++) {
      const b = i * 4,
        o = i * 6;
      idx[o] = b;
      idx[o + 1] = b + 1;
      idx[o + 2] = b + 2;
      idx[o + 3] = b + 2;
      idx[o + 4] = b + 1;
      idx[o + 5] = b + 3;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this._barMesh = new THREE.Mesh(geo, mat);
    this._barMesh.frustumCulled = false;
    this._barGeo = geo;
    this._barMat = mat;
    this.mesh.add(this._barMesh);
  }

  _buildCubes() {
    const vCount = CUBE_COUNT * 4,
      iCount = CUBE_COUNT * 6;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(vCount * 3), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(vCount * 3), 3),
    );
    const idx = new Uint16Array(iCount);
    for (let i = 0; i < CUBE_COUNT; i++) {
      const b = i * 4,
        o = i * 6;
      idx[o] = b;
      idx[o + 1] = b + 1;
      idx[o + 2] = b + 2;
      idx[o + 3] = b + 2;
      idx[o + 4] = b + 1;
      idx[o + 5] = b + 3;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this._cubeMesh = new THREE.Mesh(geo, mat);
    this._cubeMesh.frustumCulled = false;
    this._cubeGeo = geo;
    this._cubeMat = mat;
    this.mesh.add(this._cubeMesh);
  }

  _buildDots() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(TOTAL_POINTS * 3), 3),
    );
    geo.setAttribute(
      "customColor",
      new THREE.BufferAttribute(new Float32Array(TOTAL_POINTS * 3), 3),
    );
    geo.setAttribute(
      "size",
      new THREE.BufferAttribute(new Float32Array(TOTAL_POINTS), 1),
    );
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this._dotsMesh = new THREE.Points(geo, mat);
    this._dotsMesh.frustumCulled = false;
    this._dotGeo = geo;
    this._dotMat = mat;
    this.mesh.add(this._dotsMesh);
  }

  _buildTrailDots() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(TOTAL_TRAIL_DOTS * 3), 3),
    );
    geo.setAttribute(
      "customColor",
      new THREE.BufferAttribute(new Float32Array(TOTAL_TRAIL_DOTS * 3), 3),
    );
    geo.setAttribute(
      "size",
      new THREE.BufferAttribute(new Float32Array(TOTAL_TRAIL_DOTS), 1),
    );
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this._trailMesh = new THREE.Points(geo, mat);
    this._trailMesh.frustumCulled = false;
    this._trailGeo = geo;
    this._trailMat = mat;
    this.mesh.add(this._trailMesh);
  }

  _buildEffectDots() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(EFFECT_PARTICLE_COUNT * 3), 3),
    );
    geo.setAttribute(
      "customColor",
      new THREE.BufferAttribute(new Float32Array(EFFECT_PARTICLE_COUNT * 3), 3),
    );
    geo.setAttribute(
      "size",
      new THREE.BufferAttribute(new Float32Array(EFFECT_PARTICLE_COUNT), 1),
    );
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this._fxDotsMesh = new THREE.Points(geo, mat);
    this._fxDotsMesh.frustumCulled = false;
    this._fxDotGeo = geo;
    this._fxDotMat = mat;
    this.mesh.add(this._fxDotsMesh);
  }

  _buildRippleLines() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(RIPPLE_LINE_VERTS * 3), 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(RIPPLE_LINE_VERTS * 3), 3),
    );
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this._rippleMesh = new THREE.LineSegments(geo, mat);
    this._rippleMesh.frustumCulled = false;
    this._rippleGeo = geo;
    this._rippleMat = mat;
    this.mesh.add(this._rippleMesh);
  }

  update(dt, time, handState) {
    if (!handState.isTracked) {
      this.mesh.visible = false;
      this._summonPhase = 0;
      return;
    }
    this.mesh.visible = true;

    const joints = handState.normalizedJoints;
    const palm = handState.normalizedPalmCenter;
    const tips = handState.normalizedFingerTips;
    const depth = handState.depthScale || 1.0;
    const rot = handState.smoothPalmAngle || 0;
    const speed = handState.handSpeed || 0;
    const spread = handState.fingerSpreadNorm || 0;
    const clench = handState.clenchFactor || 0;
    const xC = 1.0 / Math.max(this._aspect, 0.5);
    const accel = handState.handAccelNorm || 0;
    const poseId = handState.poseId || 0;

    const thumbTip = joints[4],
      indexTip = joints[8];
    const tiDx = thumbTip[0] - indexTip[0],
      tiDy = thumbTip[1] - indexTip[1];
    const tiDist = Math.sqrt(tiDx * tiDx + tiDy * tiDy);
    const summon = this._easeOut(this._summonPhase);
    this._hudR = Math.max(0.03, tiDist * 0.65) * depth * this._scale * summon;
    this._tiMid = [palm[0], palm[1]];
    this._tiDist = tiDist;

    this._detectGestures(
      dt,
      time,
      tips,
      palm,
      depth,
      speed,
      accel,
      spread,
      clench,
      poseId,
      xC,
    );

    if (this._summonPhase < 1.0) {
      this._summonPhase = Math.min(1.0, this._summonPhase + 1.5 * dt);
    }

    this._updateLines(
      time,
      joints,
      palm,
      depth,
      rot,
      speed,
      spread,
      clench,
      xC,
    );
    this._updateBars(time, palm, depth, rot, clench, xC, speed);
    this._updateCubes(dt, time, palm, depth, rot, clench, spread, speed, xC);
    this._updateOutlines();
    this._updateDots(joints, depth, xC);
    this._updatePointerTrails(
      dt,
      time,
      palm,
      depth,
      rot,
      spread,
      clench,
      xC,
      joints,
    );
    this._updateEffectParticles(dt, time, xC);
    this._updateRipples(dt, time, xC);
  }

  _updateLines(time, joints, palm, depth, rot, speed, spread, clench, xC) {
    const pos = this._lineGeo.attributes.position;
    const col = this._lineGeo.attributes.color;
    let vi = 0;
    const setV = (x, y, r, g, b) => {
      pos.setXYZ(vi, x, y, 0);
      col.setXYZ(vi, r, g, b);
      vi++;
    };
    const skelVis = this._showSkeleton ? 1.0 : 0.0;

    for (const [a, b, fId, bIdx] of BONES) {
      if (skelVis < 0.01) {
        setV(palm[0], palm[1], 0, 0, 0);
        setV(palm[0], palm[1], 0, 0, 0);
        continue;
      }
      const ja = joints[a],
        jb = joints[b];
      const fc = fId >= 0 ? FINGER_COLS[fId] : PALM_COL;
      const bright = fId >= 0 ? 0.6 * (0.75 + (bIdx / 3) * 0.25) : 0.4;
      setV(ja[0], ja[1], fc[0] * bright, fc[1] * bright, fc[2] * bright);
      setV(jb[0], jb[1], fc[0] * bright, fc[1] * bright, fc[2] * bright);
    }

    for (const [a, b] of WEB) {
      if (skelVis < 0.01) {
        setV(palm[0], palm[1], 0, 0, 0);
        setV(palm[0], palm[1], 0, 0, 0);
        continue;
      }
      const ja = joints[a],
        jb = joints[b];
      const dist = Math.sqrt((ja[0] - jb[0]) ** 2 + (ja[1] - jb[1]) ** 2);
      const wb = Math.max(0.08, Math.min(0.5, 1.0 - dist * 3.5));
      setV(ja[0], ja[1], 0.8 * wb, 0.6 * wb, 0.3 * wb);
      setV(jb[0], jb[1], 0.3 * wb, 0.6 * wb, 0.8 * wb);
    }

    const compGlowP = this._compressionGlow;
    for (let ring = 0; ring < NUM_PALM_RINGS; ring++) {
      const baseR = ring === 0 ? 0.018 : 0.032;
      const r = baseR * depth * this._scale;
      const bright = (ring === 0 ? 0.65 : 0.45) + compGlowP * 0.5;
      for (let s = 0; s < RING_SEGS; s++) {
        const a1 = (s / RING_SEGS) * Math.PI * 2;
        const a2 = ((s + 1) / RING_SEGS) * Math.PI * 2;
        const gM = compGlowP * 0.5;
        const pr = PALM_COL[0] * (1 - gM) + gM,
          pg = PALM_COL[1] * (1 - gM) + gM,
          pb = PALM_COL[2] * (1 - gM) + gM;
        setV(
          palm[0] + Math.cos(a1) * r * xC,
          palm[1] + Math.sin(a1) * r,
          pr * bright,
          pg * bright,
          pb * bright,
        );
        setV(
          palm[0] + Math.cos(a2) * r * xC,
          palm[1] + Math.sin(a2) * r,
          pr * bright,
          pg * bright,
          pb * bright,
        );
      }
    }

    const hudR = this._hudR;
    const center = this._tiMid;
    const compGlow = this._compressionGlow;
    const ringOff = [-0.0012, 0.0012];
    for (let pass = 0; pass < 2; pass++) {
      const rP = hudR + ringOff[pass] * this._scale;
      for (let s = 0; s < HUD_SEGS; s++) {
        const a1 = rot + (s / HUD_SEGS) * Math.PI * 2;
        const a2 = rot + ((s + 1) / HUD_SEGS) * Math.PI * 2;
        const hue = s / HUD_SEGS;
        const [hr, hg, hb] = hueToRgb(hue);
        const gMix = compGlow * 0.4;
        const cr = hr * (1 - gMix) + gMix,
          cg = hg * (1 - gMix) + gMix,
          cb = hb * (1 - gMix) + gMix;
        const rb = (0.9 + compGlow * 0.3) * (pass === 0 ? 0.55 : 1.0);
        setV(
          center[0] + Math.cos(a1) * rP * xC,
          center[1] + Math.sin(a1) * rP,
          cr * rb,
          cg * rb,
          cb * rb,
        );
        setV(
          center[0] + Math.cos(a2) * rP * xC,
          center[1] + Math.sin(a2) * rP,
          cr * rb,
          cg * rb,
          cb * rb,
        );
      }
    }

    const tickIn = hudR * 0.88,
      tickOut = hudR * 1.12;
    for (let t = 0; t < HUD_TICKS; t++) {
      const a = rot + (t / HUD_TICKS) * Math.PI * 2;
      const cosA = Math.cos(a),
        sinA = Math.sin(a);
      const hue = t / HUD_TICKS;
      const [thr, thg, thb] = hueToRgb(hue);
      const bright = t % 9 === 0 ? 0.9 : 0.5;
      setV(
        center[0] + cosA * tickIn * xC,
        center[1] + sinA * tickIn,
        thr * bright,
        thg * bright,
        thb * bright,
      );
      setV(
        center[0] + cosA * tickOut * xC,
        center[1] + sinA * tickOut,
        thr * bright,
        thg * bright,
        thb * bright,
      );
    }

    this._spokeStartVi = vi;
    for (let p = 0; p < NUM_POINTERS; p++) {
      setV(0, 0, 0, 0, 0);
      setV(0, 0, 0, 0, 0);
    }

    while (vi < TOTAL_LINE_VERTS) setV(0, 0, 0, 0, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  _updateBars(time, palm, depth, rot, clench, xC, speed) {
    const pos = this._barGeo.attributes.position;
    const col = this._barGeo.attributes.color;
    const center = this._tiMid;
    const hudR = this._hudR;
    const barInner = hudR * 0.35;
    const barMaxLen = hudR * 0.55;
    const barHalfW = Math.max(0.001, hudR * 0.025);

    const dt = 0.016;
    for (let i = 0; i < BAR_COUNT; i++) {
      const phase = Math.sin(i * 2.39996 + time * 3.0) * 0.5 + 0.5;
      this._barTarget[i] =
        0.15 + speed * 8.0 * phase + clench * 0.3 * (1.0 - phase);
      this._barTarget[i] = Math.min(1.0, this._barTarget[i]);
      const diff = this._barTarget[i] - this._barEnergy[i];
      if (diff > 0) {
        this._barEnergy[i] += diff * Math.min(1.0, 12.0 * dt);
      } else {
        this._barEnergy[i] += diff * Math.min(1.0, 3.0 * dt);
      }
    }

    for (let i = 0; i < BAR_COUNT; i++) {
      const hue = i / BAR_COUNT;
      const [cr, cg, cb] = hueToRgb(hue);
      const barAngle = rot + (i / BAR_COUNT) * Math.PI * 2;
      const cosB = Math.cos(barAngle),
        sinB = Math.sin(barAngle);
      const barLen = barMaxLen * this._barEnergy[i];
      const perpX = -sinB * barHalfW,
        perpY = cosB * barHalfW;
      const ix = center[0] + cosB * barInner * xC,
        iy = center[1] + sinB * barInner;
      const ox = center[0] + cosB * (barInner + barLen) * xC,
        oy = center[1] + sinB * (barInner + barLen);

      const base = i * 4;
      const ilx = ix - perpX * xC,
        ily = iy - perpY;
      const irx = ix + perpX * xC,
        iry = iy + perpY;
      const olx = ox - perpX * xC,
        oly = oy - perpY;
      const orx = ox + perpX * xC,
        ory = oy + perpY;

      pos.setXYZ(base, ilx, ily, 0);
      pos.setXYZ(base + 1, irx, iry, 0);
      pos.setXYZ(base + 2, olx, oly, 0);
      pos.setXYZ(base + 3, orx, ory, 0);

      const bc = i * 8;
      this._barCornersCache[bc] = ilx;
      this._barCornersCache[bc + 1] = ily;
      this._barCornersCache[bc + 2] = irx;
      this._barCornersCache[bc + 3] = iry;
      this._barCornersCache[bc + 4] = olx;
      this._barCornersCache[bc + 5] = oly;
      this._barCornersCache[bc + 6] = orx;
      this._barCornersCache[bc + 7] = ory;

      const bIn = 0.5 + this._barEnergy[i] * 0.3;
      const bOut = 0.7 + this._barEnergy[i] * 0.2;
      col.setXYZ(base, cr * bIn, cg * bIn, cb * bIn);
      col.setXYZ(base + 1, cr * bIn, cg * bIn, cb * bIn);
      col.setXYZ(base + 2, cr * bOut, cg * bOut, cb * bOut);
      col.setXYZ(base + 3, cr * bOut, cg * bOut, cb * bOut);
      this._barColorCache[i * 3] = cr;
      this._barColorCache[i * 3 + 1] = cg;
      this._barColorCache[i * 3 + 2] = cb;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  _updateCubes(dt, time, palm, depth, rot, clench, spread, speed, xC) {
    if (!this._physicsReady) {
      this._prevClench = clench;
      this._prevRot = rot;
      this._physicsReady = true;
    }
    const safeDt = Math.max(dt, 0.001);
    const clenchRate = (clench - this._prevClench) / safeDt;
    const openRate = -clenchRate;
    const rotRate = (rot - this._prevRot) / safeDt;
    this._prevClench = clench;
    this._prevRot = rot;

    const scatterImpulse = openRate > 2.0 ? openRate * 0.04 : 0;
    const closePull = clenchRate > 1.5 ? -clenchRate * 0.02 : 0;
    const carouselImpulse = Math.abs(rotRate) > 0.5 ? rotRate * 0.08 : 0;

    for (let i = 0; i < CUBE_COUNT; i++) {
      const vary = 0.7 + Math.sin(i * 7.3) * 0.4;
      this._cubeVRad[i] += scatterImpulse * vary + closePull;
      this._cubeVAng[i] += carouselImpulse * (0.5 + (i % 4) * 0.15);
      this._cubeVRad[i] +=
        -(this._cubeRadOff[i] - this._cubeEqRadOff[i]) * 6.0 * safeDt;
      this._cubeVAng[i] +=
        -(this._cubeAngle[i] - this._cubeEqAngle[i]) * 2.0 * safeDt;
      this._cubeVRad[i] *= Math.exp(-4.0 * safeDt);
      this._cubeVAng[i] *= Math.exp(-3.0 * safeDt);
      this._cubeRadOff[i] += this._cubeVRad[i] * safeDt;
      this._cubeAngle[i] += this._cubeVAng[i] * safeDt;
    }

    const pos = this._cubeGeo.attributes.position;
    const col = this._cubeGeo.attributes.color;
    const hudR = this._hudR;
    const baseOrbitR = hudR * 1.22;

    for (let i = 0; i < CUBE_COUNT; i++) {
      const orbitR = baseOrbitR + this._cubeRadOff[i];
      const a = this._cubeAngle[i];
      const cx = palm[0] + Math.cos(a) * orbitR * xC;
      const cy = palm[1] + Math.sin(a) * orbitR;
      const cosT = Math.cos(rot),
        sinT = Math.sin(rot);
      const handScale = 0.6 + spread * 0.8 - clench * 0.35;
      const s =
        this._cubeRandSize[i] * depth * this._scale * Math.max(0.15, handScale);

      const corners = [
        [-s, -s],
        [s, -s],
        [-s, s],
        [s, s],
      ].map(([dx, dy]) => [
        cx + (dx * cosT - dy * sinT) * xC,
        cy + dx * sinT + dy * cosT,
      ]);

      const base = i * 4;
      for (let c = 0; c < 4; c++)
        pos.setXYZ(base + c, corners[c][0], corners[c][1], 0);

      const cc = i * 8;
      for (let c = 0; c < 4; c++) {
        this._cubeCornersCache[cc + c * 2] = corners[c][0];
        this._cubeCornersCache[cc + c * 2 + 1] = corners[c][1];
      }

      const hue = i / CUBE_COUNT;
      const [cr, cg, cb] = hueToRgb(hue);
      const bright = 0.7;
      for (let c = 0; c < 4; c++)
        col.setXYZ(base + c, cr * bright, cg * bright, cb * bright);
      this._cubeColorCache[i * 3] = cr * bright;
      this._cubeColorCache[i * 3 + 1] = cg * bright;
      this._cubeColorCache[i * 3 + 2] = cb * bright;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  _updateOutlines() {
    const pos = this._outlineGeo.attributes.position;
    const col = this._outlineGeo.attributes.color;
    let vi = 0;
    const setV = (x, y, r, g, b) => {
      pos.setXYZ(vi, x, y, 0);
      col.setXYZ(vi, r, g, b);
      vi++;
    };

    for (let i = 0; i < BAR_COUNT; i++) {
      const bc = i * 8;
      const ilx = this._barCornersCache[bc],
        ily = this._barCornersCache[bc + 1];
      const irx = this._barCornersCache[bc + 2],
        iry = this._barCornersCache[bc + 3];
      const olx = this._barCornersCache[bc + 4],
        oly = this._barCornersCache[bc + 5];
      const orx = this._barCornersCache[bc + 6],
        ory = this._barCornersCache[bc + 7];
      const cr = this._barColorCache[i * 3],
        cg = this._barColorCache[i * 3 + 1],
        cb = this._barColorCache[i * 3 + 2];
      const b = 0.6;
      setV(ilx, ily, cr * b, cg * b, cb * b);
      setV(irx, iry, cr * b, cg * b, cb * b);
      setV(irx, iry, cr * b, cg * b, cb * b);
      setV(orx, ory, cr * b, cg * b, cb * b);
      setV(orx, ory, cr * b, cg * b, cb * b);
      setV(olx, oly, cr * b, cg * b, cb * b);
      setV(olx, oly, cr * b, cg * b, cb * b);
      setV(ilx, ily, cr * b, cg * b, cb * b);
    }

    for (let i = 0; i < CUBE_COUNT; i++) {
      const cc = i * 8;
      const tlx = this._cubeCornersCache[cc],
        tly = this._cubeCornersCache[cc + 1];
      const trx = this._cubeCornersCache[cc + 2],
        try_ = this._cubeCornersCache[cc + 3];
      const blx = this._cubeCornersCache[cc + 4],
        bly = this._cubeCornersCache[cc + 5];
      const brx = this._cubeCornersCache[cc + 6],
        bry = this._cubeCornersCache[cc + 7];
      const cr = this._cubeColorCache[i * 3],
        cg = this._cubeColorCache[i * 3 + 1],
        cb = this._cubeColorCache[i * 3 + 2];
      const b = 0.9;
      setV(tlx, tly, cr * b, cg * b, cb * b);
      setV(trx, try_, cr * b, cg * b, cb * b);
      setV(trx, try_, cr * b, cg * b, cb * b);
      setV(brx, bry, cr * b, cg * b, cb * b);
      setV(brx, bry, cr * b, cg * b, cb * b);
      setV(blx, bly, cr * b, cg * b, cb * b);
      setV(blx, bly, cr * b, cg * b, cb * b);
      setV(tlx, tly, cr * b, cg * b, cb * b);
    }

    while (vi < TOTAL_OUTLINE_VERTS) setV(0, 0, 0, 0, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  _updateDots(joints, depth, xC) {
    const pos = this._dotGeo.attributes.position;
    const col = this._dotGeo.attributes.customColor;
    const siz = this._dotGeo.attributes.size;
    const skelVis = this._showSkeleton ? 1.0 : 0.0;

    for (let i = 0; i < 21; i++) {
      const isThumbOrIndex = i <= 4 || (i >= 5 && i <= 8) || i === 0;
      pos.setXYZ(i, joints[i][0], joints[i][1], 0);
      const isTip = TIP_IDS.includes(i);
      const baseSize = isTip ? 6.0 : i === 0 ? 4.5 : 3.0;
      const vis = isThumbOrIndex ? skelVis : 0.0;
      siz.setX(i, baseSize * this._scale * (0.6 + depth * 0.4) * vis);
      const fc = i === 0 ? PALM_COL : i <= 4 ? FINGER_COLS[0] : FINGER_COLS[1];
      col.setXYZ(i, fc[0] * 0.7 * vis, fc[1] * 0.7 * vis, fc[2] * 0.7 * vis);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    siz.needsUpdate = true;
  }

  _updatePointerTrails(dt, time, palm, depth, rot, spread, clench, xC, joints) {
    const pos = this._trailGeo.attributes.position;
    const col = this._trailGeo.attributes.customColor;
    const siz = this._trailGeo.attributes.size;

    const MAX_AGE = 2.5;
    const MIN_DOT_DIST = 0.004;

    const thumbT = joints[4],
      indexT = joints[8];
    const center = this._tiMid;
    const midFX = (thumbT[0] + indexT[0]) * 0.5;
    const midFY = (thumbT[1] + indexT[1]) * 0.5;
    const rawDirAngle = Math.atan2(midFY - center[1], midFX - center[0]);
    const dirMix = 0.01 + this._sensitivity * 0.19;
    const daDiff = rawDirAngle - this._smoothDirAngle;
    const wrappedDa = Math.atan2(Math.sin(daDiff), Math.cos(daDiff));
    this._smoothDirAngle += wrappedDa * dirMix;
    const spreadMix = 0.02 + this._sensitivity * 0.13;
    const rawSpread = this._tiDist;
    this._smoothSpread += (rawSpread - this._smoothSpread) * spreadMix;
    const pointerR = this._hudR * (1.2 + this._smoothSpread * 2.0);
    const dirA = this._smoothDirAngle;
    const hudR = this._hudR;
    const xC_t = xC;

    const pointerTips = [];

    for (let p = 0; p < NUM_POINTERS; p++) {
      const baseAngle = dirA + (p / NUM_POINTERS) * Math.PI * 2;
      const rawX = center[0] + Math.cos(baseAngle) * pointerR * xC;
      const rawY = center[1] + Math.sin(baseAngle) * pointerR;

      let sX, sY;
      if (this._smoothPointerPos[p]) {
        const sMix = 0.01 + this._sensitivity * 0.17;
        sX =
          this._smoothPointerPos[p][0] +
          (rawX - this._smoothPointerPos[p][0]) * sMix;
        sY =
          this._smoothPointerPos[p][1] +
          (rawY - this._smoothPointerPos[p][1]) * sMix;
      } else {
        sX = rawX;
        sY = rawY;
      }
      this._smoothPointerPos[p] = [sX, sY];
      pointerTips.push([sX, sY]);

      const trail = this._pointerTrails[p];
      const prev = this._prevPointerPos[p];

      if (prev) {
        const mx = sX - prev[0],
          my = sY - prev[1];
        const moveDist = Math.sqrt(mx * mx + my * my);
        if (moveDist >= MIN_DOT_DIST) {
          const steps = Math.min(
            5,
            Math.max(1, Math.floor(moveDist / MIN_DOT_DIST)),
          );
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            trail.push({
              x: prev[0] + mx * t,
              y: prev[1] + my * t,
              t: time,
            });
          }
          this._prevPointerPos[p] = [sX, sY];
        }
      } else {
        this._prevPointerPos[p] = [sX, sY];
      }

      while (trail.length > 0 && time - trail[0].t > MAX_AGE) trail.shift();
      while (trail.length > TRAIL_MAX_DOTS) trail.shift();

      const baseIdx = p * TRAIL_MAX_DOTS;
      for (let d = 0; d < TRAIL_MAX_DOTS; d++) {
        const pi = baseIdx + d;
        if (d < trail.length) {
          const dot = trail[d];
          const age = time - dot.t;
          const life = 1.0 - age / MAX_AGE;
          const fadedLife = life * life;

          pos.setXYZ(pi, dot.x, dot.y, 0);

          const bright = fadedLife * 3.0;
          col.setXYZ(pi, bright, bright, bright);

          const dotSize =
            (7.0 + fadedLife * 3.0) * this._scale * (0.6 + depth * 0.4);
          siz.setX(pi, dotSize);
        } else {
          pos.setXYZ(pi, 0, 0, 0);
          col.setXYZ(pi, 0, 0, 0);
          siz.setX(pi, 0);
        }
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    siz.needsUpdate = true;

    if (this._spokeStartVi != null) {
      const lpos = this._lineGeo.attributes.position;
      const lcol = this._lineGeo.attributes.color;
      for (let p = 0; p < NUM_POINTERS; p++) {
        const vi2 = this._spokeStartVi + p * 2;
        const tip = pointerTips[p];
        if (!tip) continue;
        const dx = tip[0] - center[0],
          dy = tip[1] - center[1];
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const nx = dx / dist,
          ny = dy / dist;
        const spokeStartX = center[0] + nx * hudR * xC_t;
        const spokeStartY = center[1] + ny * hudR;
        const hue = p / NUM_POINTERS;
        const [sr, sg, sb] = hueToRgb(hue);
        lpos.setXYZ(vi2, spokeStartX, spokeStartY, 0);
        lcol.setXYZ(vi2, sr * 0.8, sg * 0.8, sb * 0.8);
        lpos.setXYZ(vi2 + 1, tip[0], tip[1], 0);
        lcol.setXYZ(vi2 + 1, sr * 0.15, sg * 0.15, sb * 0.15);
      }
      lpos.needsUpdate = true;
      lcol.needsUpdate = true;
    }
  }

  _detectGestures(
    dt,
    time,
    tips,
    palm,
    depth,
    speed,
    accel,
    spread,
    clench,
    poseId,
    xC,
  ) {
    const thumbTip = tips[0],
      indexTip = tips[1];
    const pinchDist = Math.sqrt(
      (thumbTip[0] - indexTip[0]) ** 2 + (thumbTip[1] - indexTip[1]) ** 2,
    );
    this._isPinching = pinchDist < 0.045;
    this._pinchMid = [
      (thumbTip[0] + indexTip[0]) / 2,
      (thumbTip[1] + indexTip[1]) / 2,
    ];

    if (this._isPinching)
      this._spawnSparks(2, this._pinchMid[0], this._pinchMid[1], 0.03, 0.5);
    if (this._isPinching && !this._prevPinch) {
      this._spawnSparks(25, this._pinchMid[0], this._pinchMid[1], 0.1, 0.8);
      this._spawnRipple(
        this._pinchMid[0],
        this._pinchMid[1],
        0.12 * depth,
        0.5,
      );
    }
    this._prevPinch = this._isPinching;

    if (poseId === 1 && accel > 0.25) {
      this._spawnBurst(40, palm[0], palm[1], 0.18 * depth);
      this._spawnRipple(palm[0], palm[1], 0.2 * depth, 0.8);
    }

    if (clench > 0.65) {
      this._compressionGlow = Math.min(1.0, this._compressionGlow + 4.0 * dt);
    } else {
      this._compressionGlow *= Math.exp(-5.0 * dt);
    }

    if (this._prevPoseId === 1 && poseId === 0) {
      this._spawnBurst(30, palm[0], palm[1], 0.18 * depth);
      this._spawnRipple(palm[0], palm[1], 0.2 * depth, 1.0);
    }

    this._prevPoseId = poseId;
  }

  _spawnSparks(count, cx, cy, speed, life) {
    let spawned = 0;
    for (const p of this._fxParticles) {
      if (!p.active && spawned < count) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random() * 0.6);
        p.x = cx + (Math.random() - 0.5) * 0.005;
        p.y = cy + (Math.random() - 0.5) * 0.005;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.life = life * (0.6 + Math.random() * 0.4);
        p.maxLife = p.life;
        p.hue = Math.random();
        p.size = 3 + Math.random() * 4;
        p.active = true;
        spawned++;
      }
    }
  }

  _spawnBurst(count, cx, cy, speed) {
    let spawned = 0;
    for (const p of this._fxParticles) {
      if (!p.active && spawned < count) {
        const angle =
          (spawned / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const spd = speed * (0.5 + Math.random() * 0.5);
        p.x = cx;
        p.y = cy;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.life = 0.3 + Math.random() * 0.5;
        p.maxLife = p.life;
        p.hue = spawned / count;
        p.size = 4 + Math.random() * 5;
        p.active = true;
        spawned++;
      }
    }
  }

  _spawnRipple(cx, cy, speed, life) {
    for (const r of this._ripplePool) {
      if (!r.active) {
        r.cx = cx;
        r.cy = cy;
        r.radius = 0.003;
        r.speed = speed;
        r.life = life;
        r.maxLife = life;
        r.active = true;
        return;
      }
    }
    let oldest = this._ripplePool[0];
    for (const r of this._ripplePool) {
      if (r.life < oldest.life) oldest = r;
    }
    oldest.cx = cx;
    oldest.cy = cy;
    oldest.radius = 0.003;
    oldest.speed = speed;
    oldest.life = life;
    oldest.maxLife = life;
    oldest.active = true;
  }

  _updateEffectParticles(dt, time, xC) {
    const pos = this._fxDotGeo.attributes.position;
    const col = this._fxDotGeo.attributes.customColor;
    const siz = this._fxDotGeo.attributes.size;

    for (let i = 0; i < EFFECT_PARTICLE_COUNT; i++) {
      const p = this._fxParticles[i];
      if (p.active) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-3.0 * dt);
        p.vy *= Math.exp(-3.0 * dt);
        p.vy -= 0.015 * dt;
        p.life -= dt;
        if (p.life <= 0) p.active = false;

        const t = Math.max(0, p.life / p.maxLife);
        pos.setXYZ(i, p.x, p.y, 0);
        const [hr, hg, hb] = hueToRgb(p.hue);
        const bright = t * t * 1.2;
        col.setXYZ(i, hr * bright, hg * bright, hb * bright);
        siz.setX(i, p.size * (0.3 + t * 0.7) * this._scale);
      } else {
        pos.setXYZ(i, 0, 0, 0);
        col.setXYZ(i, 0, 0, 0);
        siz.setX(i, 0);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    siz.needsUpdate = true;
  }

  _updateRipples(dt, time, xC) {
    const pos = this._rippleGeo.attributes.position;
    const col = this._rippleGeo.attributes.color;
    let vi = 0;
    const setV = (x, y, r, g, b) => {
      pos.setXYZ(vi, x, y, 0);
      col.setXYZ(vi, r, g, b);
      vi++;
    };

    for (let ri = 0; ri < RIPPLE_MAX; ri++) {
      const r = this._ripplePool[ri];
      if (r.active) {
        r.radius += r.speed * dt;
        r.life -= dt;
        if (r.life <= 0) r.active = false;
        const t = Math.max(0, r.life / r.maxLife);
        for (let s = 0; s < RIPPLE_SEGS; s++) {
          const a1 = (s / RIPPLE_SEGS) * Math.PI * 2;
          const a2 = ((s + 1) / RIPPLE_SEGS) * Math.PI * 2;
          const hue = s / RIPPLE_SEGS;
          const [hr, hg, hb] = hueToRgb(hue);
          const bright = t * t * 0.5;
          setV(
            r.cx + Math.cos(a1) * r.radius * xC,
            r.cy + Math.sin(a1) * r.radius,
            hr * bright,
            hg * bright,
            hb * bright,
          );
          setV(
            r.cx + Math.cos(a2) * r.radius * xC,
            r.cy + Math.sin(a2) * r.radius,
            hr * bright,
            hg * bright,
            hb * bright,
          );
        }
      } else {
        for (let s = 0; s < RIPPLE_SEGS * 2; s++) setV(0, 0, 0, 0, 0);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  setParticleSize(scale) {
    this._scale = scale / 6.0;
  }
  setShowSkeleton(show) {
    this._showSkeleton = show;
  }
  setSensitivity(val) {
    this._sensitivity = Math.max(0, Math.min(1, val));
  }
  _easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this._lineGeo.dispose();
    this._lineMat.dispose();
    this._outlineGeo.dispose();
    this._outlineMat.dispose();
    this._barGeo.dispose();
    this._barMat.dispose();
    this._cubeGeo.dispose();
    this._cubeMat.dispose();
    this._dotGeo.dispose();
    this._dotMat.dispose();
    this._trailGeo.dispose();
    this._trailMat.dispose();
    this._fxDotGeo.dispose();
    this._fxDotMat.dispose();
    this._rippleGeo.dispose();
    this._rippleMat.dispose();
  }
}

const DOT_VERT = `
attribute vec3 customColor;
attribute float size;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
    vColor = customColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = size * uPixelRatio;
}
`;

const DOT_FRAG = `
precision highp float;
varying vec3 vColor;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    // Thick bright white border + coloured core = fairy dust
    float core   = smoothstep(0.55, 0.0, d);
    float border = smoothstep(1.0, 0.55, d) - smoothstep(0.55, 0.35, d);
    float glow   = exp(-d * d * 3.0) * 0.3;
    float alpha  = max(core, border) + glow;
    if (alpha < 0.02) discard;
    vec3 col = vColor * core + vec3(1.0) * border * 1.2 + vColor * glow * 0.5;
    gl_FragColor = vec4(col, alpha);
}
`;
