import * as THREE from "three";
import { HandTracker, HandState, SimulatedHand } from "./HandTracker.js";
import { RadialParticleSystem } from "./ParticleSystem.js";
import { PRESETS } from "./presets.js";

const canvas = document.getElementById("canvas3d");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  premultipliedAlpha: false,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 10);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);

let currentPreset = "medium";

let particleSystem = new RadialParticleSystem(
  PRESETS[currentPreset].particleCount,
);
scene.add(particleSystem.mesh);

const video = document.getElementById("video-feed");
const tracker = new HandTracker(video);

const simHandState = new HandState();
const simHand = new SimulatedHand(simHandState);
let useSimulatedHand = false;
let trackingInitDone = false;
let noHandTimer = 0;
const AUTO_SIM_DELAY = 3.0;

async function initTracking() {
  try {
    await tracker.init();
    console.log("MediaPipe Hands ready — show your hand!");
    trackingInitDone = true;
  } catch (err) {
    console.warn("Camera unavailable — switching to simulated hand:", err);
    useSimulatedHand = true;
    simHand.active = true;
    trackingInitDone = true;
    document.getElementById("toggleSim").textContent = "🤖 Simulated Mode";
  }
}
initTracking();

const fpsEl = document.getElementById("fpsDisplay");
const particleEl = document.getElementById("particleDisplay");
const spreadEl = document.getElementById("spreadDisplay");
const clenchEl = document.getElementById("clenchDisplay");
const trackStatus = document.getElementById("trackStatus");
const trackLabel = document.getElementById("trackLabel");

document.getElementById("presetSelect")?.addEventListener("change", (e) => {
  applyPreset(e.target.value);
});

document.getElementById("particleSize")?.addEventListener("input", (e) => {
  particleSystem.setParticleSize(parseFloat(e.target.value));
});

document.getElementById("sensitivitySlider")?.addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  particleSystem.setSensitivity(val);
  const label = document.getElementById("sensVal");
  if (label) label.textContent = val.toFixed(2);
});

document.getElementById("toggleSim")?.addEventListener("click", () => {
  useSimulatedHand = !useSimulatedHand;
  simHand.active = useSimulatedHand;
  noHandTimer = 0;
  document.getElementById("toggleSim").textContent = useSimulatedHand
    ? "🤖 Simulated Mode"
    : "✋ Camera Mode";
});

let showSkeleton = false;
document.getElementById("toggleSkeleton")?.addEventListener("click", () => {
  showSkeleton = !showSkeleton;
  particleSystem.setShowSkeleton(showSkeleton);
  document.getElementById("toggleSkeleton").textContent = showSkeleton
    ? "🦴 Skeleton: ON"
    : "🦴 Skeleton: OFF";
});

function applyPreset(name) {
  currentPreset = name;
  const p = PRESETS[name];

  scene.remove(particleSystem.mesh);
  particleSystem.dispose();
  particleSystem = new RadialParticleSystem(p.particleCount);
  particleSystem.setShowSkeleton(showSkeleton);
  scene.add(particleSystem.mesh);
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let prevTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;
let currentFPS = 0;

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  const time = now / 1000;

  frameCount++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    currentFPS = frameCount / fpsTimer;
    frameCount = 0;
    fpsTimer = 0;
  }

  let state;
  if (useSimulatedHand) {
    simHand.tick(dt);
    simHandState.tick(dt * 1000);
    state = simHandState;
  } else {
    tracker.handState.tick(dt * 1000);
    state = tracker.handState;

    if (trackingInitDone && !state.isTracked) {
      noHandTimer += dt;
      if (noHandTimer >= AUTO_SIM_DELAY) {
        console.log("No hand detected — auto-enabling simulated hand");
        useSimulatedHand = true;
        simHand.active = true;
        document.getElementById("toggleSim").textContent = "🤖 Simulated Mode";
        simHand.tick(dt);
        simHandState.tick(dt * 1000);
        state = simHandState;
      }
    } else {
      noHandTimer = 0;
    }
  }

  particleSystem.update(dt, time, state);

  renderer.render(scene, camera);

  if (fpsEl) fpsEl.textContent = currentFPS.toFixed(0);
  if (particleEl)
    particleEl.textContent = particleSystem.actualCount.toLocaleString();
  if (spreadEl) spreadEl.textContent = state.fingerSpreadNorm.toFixed(2);
  if (clenchEl) clenchEl.textContent = state.clenchFactor.toFixed(2);

  if (trackStatus && trackLabel) {
    if (state.isTracked) {
      trackStatus.className = "status-dot active";
      trackLabel.textContent = useSimulatedHand
        ? "Simulated hand"
        : "Hand tracked";
    } else {
      trackStatus.className = "status-dot inactive";
      trackLabel.textContent = "Show your hand ✋";
    }
  }
}

animate();
