import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { openBoard } from "./board.js";
import { openLaptop } from "./laptop.js";

// ---------------------------------------------------------------------------
// Basic scene / renderer / camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.05,
  50
);
// NOTE on coordinates: the Blender scene was Z-up; the glTF export converts
// it to Three.js's Y-up convention as (x, z, -y). Every position below is
// written as the original Blender (x, y, z) run through that same swap, so
// it's easy to cross-check against the Blender scripts if something's off.
function fromBlender(x, y, z) {
  return [x, z, -y];
}

camera.position.set(...fromBlender(4.2, -2.8, 2.0));

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...fromBlender(1.4, 1.0, 0.85));
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 7;

// Keep dragging confined to a window around whatever the camera is
// currently framing — ±35° left/right, ±20° up/down — instead of letting
// the user spin all the way around the object.
const ORBIT_AZIMUTH_RANGE = THREE.MathUtils.degToRad(35);
const ORBIT_POLAR_RANGE = THREE.MathUtils.degToRad(20);

// Whatever view we're currently "anchored" to (the default overview, or
// the focused object) — used to spring the camera back after a drag.
let referenceView = { position: null, target: null };

function constrainOrbitAround(position, target) {
  referenceView = { position, target };
  const offset = new THREE.Vector3(...position).sub(new THREE.Vector3(...target));
  const spherical = new THREE.Spherical().setFromVector3(offset);
  controls.minAzimuthAngle = spherical.theta - ORBIT_AZIMUTH_RANGE;
  controls.maxAzimuthAngle = spherical.theta + ORBIT_AZIMUTH_RANGE;
  controls.minPolarAngle = Math.max(0.01, spherical.phi - ORBIT_POLAR_RANGE);
  controls.maxPolarAngle = Math.min(Math.PI - 0.01, spherical.phi + ORBIT_POLAR_RANGE);
}

constrainOrbitAround(camera.position.toArray(), controls.target.toArray());
controls.update();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Lighting rig — mirrors the Blender day / dusk / night presets
// ---------------------------------------------------------------------------
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(...fromBlender(1.86, 5.0, 2.6));
sunLight.target.position.set(...fromBlender(1.86, 0, 1.0));
sunLight.castShadow = true;
// Default shadow-camera near/far (0.5/500) are sized for a huge outdoor
// scene; against this room's few-meter scale that leaves almost no depth
// precision in the shadow map, which shows up as moiré/banding on every
// shadowed surface. Tighten near/far and the frustum to the room's actual
// size instead.
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 12;
sunLight.shadow.camera.left = -4;
sunLight.shadow.camera.right = 4;
sunLight.shadow.camera.top = 4;
sunLight.shadow.camera.bottom = -4;
sunLight.shadow.bias = -0.0008;
sunLight.shadow.normalBias = 0.02;
scene.add(sunLight, sunLight.target);

const windowLight = new THREE.RectAreaLight(0xffffff, 0, 1.0, 0.75);
windowLight.position.set(...fromBlender(1.86, 2.02, 1.35));
windowLight.rotation.set(0, Math.PI, 0);
scene.add(windowLight);

const lampLight = new THREE.PointLight(0xffc060, 0, 3, 2);
lampLight.position.set(...fromBlender(1.43, 1.99, 0.9));
lampLight.castShadow = true;
// Same depth-precision fix as sunLight, scaled to this light's own 3-unit range.
lampLight.shadow.mapSize.set(1024, 1024);
lampLight.shadow.camera.near = 0.05;
lampLight.shadow.camera.far = 3;
lampLight.shadow.bias = -0.0015;
lampLight.shadow.normalBias = 0.02;
scene.add(lampLight);

const fillLight = new THREE.RectAreaLight(0xffffff, 1.0, 2.0, 1.4);
fillLight.position.set(...fromBlender(0.8, -0.6, 2.0));
fillLight.rotation.set(0.5, 0.15, 0.0);
scene.add(fillLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

// ---------------------------------------------------------------------------
// Floating globe beyond the door — appears when the door opens.
// Stylized, hand-painted-looking continents on a canvas texture, to match
// the rest of the room rather than a photographic Earth map.
// ---------------------------------------------------------------------------
function createEarthTexture() {
  const w = 512, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3a7ca5";
  ctx.fillRect(0, 0, w, h);

  const blobs = [
    [0.12, 0.35, 0.16, 0.22], [0.20, 0.55, 0.10, 0.20], [0.30, 0.30, 0.07, 0.10],
    [0.46, 0.28, 0.14, 0.16], [0.50, 0.55, 0.09, 0.14], [0.58, 0.20, 0.10, 0.10],
    [0.70, 0.35, 0.13, 0.18], [0.80, 0.60, 0.10, 0.12], [0.88, 0.25, 0.08, 0.10],
    [0.05, 0.75, 0.10, 0.08],
  ];
  ctx.fillStyle = "#7ea86b";
  for (const [cx, cy, rx, ry] of blobs) {
    ctx.beginPath();
    ctx.ellipse(cx * w, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const globeGeometry = new THREE.IcosahedronGeometry(0.32, 3);
const globeMaterial = new THREE.MeshStandardMaterial({
  map: createEarthTexture(),
  roughness: 0.8,
  metalness: 0.0,
  transparent: true,
  opacity: 0,
});
const floatingGlobe = new THREE.Mesh(globeGeometry, globeMaterial);
// beyond the doorway, out in the unmodeled "outside" void
const GLOBE_BASE_POS = fromBlender(-0.85, 0.65, 1.0);
floatingGlobe.position.set(...GLOBE_BASE_POS);
floatingGlobe.visible = false;
scene.add(floatingGlobe);

let globeFadeTarget = 0;
function setGlobeVisible(show) {
  globeFadeTarget = show ? 1 : 0;
  if (show) floatingGlobe.visible = true;
}

// ---------------------------------------------------------------------------
// Poly Haven HDRI (preller_drive_4k) — used as the environment map so
// furniture gets natural, direction-aware ambient light + soft reflections
// instead of the flat fill-light hack. It replaces most of fillLight/ambient's
// job; those two stay on at low values just to lift the deepest shadows.
// ---------------------------------------------------------------------------
console.log("[hdri] starting load of assets/preller_drive_4k.hdr …");
new RGBELoader().load(
  "assets/preller_drive_4k.hdr",
  (hdrTexture) => {
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdrTexture;
    console.log("[hdri] loaded and applied as scene.environment", hdrTexture);
    // background stays the flat day/dusk/night color (set in applyLightPreset)
    // so the room's open sides read as a stylized void, not a literal photo.
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      console.log(`[hdri] ${((xhr.loaded / xhr.total) * 100).toFixed(0)}% loaded`);
    }
  },
  (err) => {
    console.error("[hdri] FAILED to load:", err);
  }
);

// Recorded from Blender. Colors are 0-1 RGB; "energy" values are the raw
// Blender watt numbers, rescaled below for Three.js's different light units.
const LIGHT_PRESETS = {
  // Reverted to the manual lighting balance that was already approved
  // against the Blender renders. HDRI stays loaded but at a low, supporting
  // intensity so it adds a little material richness without changing the mood.
  day: {
    // warmed toward a golden-hour peach/orange, to match the lofi-room mood
    sunColor: [1.0, 0.82, 0.60], sunEnergy: 4.2,
    windowColor: [1.0, 0.80, 0.55], windowEnergy: 8.0,
    lampEnergy: 0.0, lampColor: [1.0, 0.75, 0.35],
    fillColor: [0.95, 0.78, 0.62], fillEnergy: 11.0,
    ambientColor: [0.80, 0.60, 0.50], ambientStrength: 0.5,
    envIntensity: 0.3,
  },
  dusk: {
    sunColor: [0.85, 0.55, 0.68], sunEnergy: 1.6,
    windowColor: [0.85, 0.55, 0.68], windowEnergy: 2.5,
    lampEnergy: 14.0, lampColor: [1.0, 0.75, 0.35],
    fillColor: [0.78, 0.60, 0.68], fillEnergy: 14.0,
    ambientColor: [0.42, 0.32, 0.42], ambientStrength: 0.20,
    envIntensity: 0.15,
  },
  night: {
    sunColor: [0.22, 0.28, 0.52], sunEnergy: 0.3,
    windowColor: [0.22, 0.28, 0.52], windowEnergy: 1.5,
    lampEnergy: 19.0, lampColor: [1.0, 0.75, 0.35],
    fillColor: [0.30, 0.35, 0.50], fillEnergy: 3.153,
    ambientColor: [0.05, 0.06, 0.12], ambientStrength: 0.10,
    envIntensity: 0.05,
  },
};

// Anchor each preset to a time of day (24h clock) for interpolation.
const TIME_ANCHORS = [
  { hour: 6, preset: "night" },
  { hour: 8, preset: "day" },
  { hour: 17, preset: "day" },
  { hour: 19, preset: "dusk" },
  { hour: 21, preset: "night" },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpArr(a, b, t) { return a.map((v, i) => lerp(v, b[i], t)); }

function blendPresets(pA, pB, t) {
  const out = {};
  for (const key of Object.keys(pA)) {
    const a = pA[key], b = pB[key];
    out[key] = Array.isArray(a) ? lerpArr(a, b, t) : lerp(a, b, t);
  }
  return out;
}

function getCurrentPreset(date = new Date()) {
  const hourFloat = date.getHours() + date.getMinutes() / 60;
  const anchors = TIME_ANCHORS;
  let prev = anchors[anchors.length - 1];
  let next = anchors[0];
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i].hour > hourFloat) {
      next = anchors[i];
      prev = anchors[(i - 1 + anchors.length) % anchors.length];
      break;
    }
  }
  let span = next.hour - prev.hour;
  let pos = hourFloat - prev.hour;
  if (span <= 0) { span += 24; }
  if (pos < 0) { pos += 24; }
  const t = span === 0 ? 0 : pos / span;
  return blendPresets(LIGHT_PRESETS[prev.preset], LIGHT_PRESETS[next.preset], t);
}

// Rough rescale from Blender Watts to Three.js light intensity units —
// tuned by eye against the Blender reference renders, not physically exact.
function applyLightPreset(p) {
  sunLight.color.setRGB(...p.sunColor);
  sunLight.intensity = p.sunEnergy * 0.55;

  windowLight.color.setRGB(...p.windowColor);
  windowLight.intensity = p.windowEnergy * 0.35;

  lampLight.color.setRGB(...p.lampColor);
  lampLight.intensity = p.lampEnergy * 0.09;

  fillLight.color.setRGB(...p.fillColor);
  fillLight.intensity = p.fillEnergy * 0.35;

  ambient.color.setRGB(...p.ambientColor);
  ambient.intensity = p.ambientStrength;

  scene.environmentIntensity = p.envIntensity; // Three.js r162+
  currentEnvIntensity = p.envIntensity;
  syncMaterialEnvIntensity(); // fallback for older Three.js: per-material envMapIntensity

  scene.background = new THREE.Color(...p.ambientColor);
}

let currentEnvIntensity = 1.0;
const trackedMaterials = new Set();
function syncMaterialEnvIntensity() {
  trackedMaterials.forEach((mat) => {
    if ("envMapIntensity" in mat) {
      mat.envMapIntensity = currentEnvIntensity;
      mat.needsUpdate = true;
    }
  });
}

applyLightPreset(getCurrentPreset());
// Re-check the real clock every few minutes so the room drifts with the day.
setInterval(() => applyLightPreset(getCurrentPreset()), 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// Fake a plush/fuzzy look for the rug (Blender's hair particles don't
// survive glTF export — this fakes the same read with a bump map + sheen).
// ---------------------------------------------------------------------------
function createFuzzBumpTexture(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 150 + Math.floor(Math.random() * 105); // mid-high frequency noise
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // soften slightly so it reads as nap, not pure static
  ctx.globalAlpha = 0.35;
  ctx.filter = "blur(1px)";
  ctx.drawImage(canvas, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  return texture;
}

function applyRugFuzz(rugMesh) {
  const bump = createFuzzBumpTexture();
  const baseColor = rugMesh.material.color
    ? rugMesh.material.color.clone()
    : new THREE.Color(0.8, 0.75, 0.62);

  console.log("[rug] applying fuzz material to", rugMesh.name, rugMesh);

  rugMesh.material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    roughness: 1.0,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(1, 1, 1),
    bumpMap: bump,
    bumpScale: 0.03,
  });
  rugMesh.material.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Load the room
// ---------------------------------------------------------------------------
const loader = new GLTFLoader();
const mixer_holder = { mixer: null };
const clipActions = {};
let doorAction = null;
let doorOpen = false;

const raycastTargets = [];

loader.load(
  "assets/study_room.glb",
  (gltf) => {
    const root = gltf.scene;
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        raycastTargets.push(obj);
        if (obj.name === "Rug") {
          applyRugFuzz(obj);
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m && trackedMaterials.add(m));
      }
    });
    scene.add(root);
    syncMaterialEnvIntensity();

    // Animation playback: curtains loop forever, door plays on demand.
    const mixer = new THREE.AnimationMixer(root);
    mixer_holder.mixer = mixer;

    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      clipActions[clip.name] = action;
      if (clip.name.includes("DoorHinge")) {
        doorAction = action;
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
      } else {
        // curtain flutter clips
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      }
    });

    document.getElementById("loading").classList.add("hidden");

    // Land on the personal homepage by default — the room is already
    // loaded right behind it, so "exit" can reveal it immediately.
    camera.position.set(...FOCUS_VIEWS.laptop.position);
    controls.target.set(...FOCUS_VIEWS.laptop.target);
    controls.update();
    controls.enabled = false;
    focusedId = "laptop";
    openLaptop(() => {
      returnToOverview();
      document.getElementById("hint").classList.remove("hidden");
    });
  },
  undefined,
  (err) => {
    console.error("Failed to load study_room.glb", err);
    document.querySelector(".loading-text").textContent = "加载失败,检查 assets/study_room.glb 是否存在";
  }
);

// ---------------------------------------------------------------------------
// Interaction map — name prefixes -> logical interactive object
// ---------------------------------------------------------------------------
const INTERACTIVE_GROUPS = [
  { id: "laptop", prefixes: ["LaptopBase", "LaptopScreen", "Keyboard", "Mouse"] },
  { id: "books", prefixes: ["Book_", "BookLie"] },
  { id: "recordPlayer", prefixes: ["RecordPlayer"] },
  { id: "guitar", prefixes: ["GuitarBody", "Pickguard", "Pickup_", "GuitarNeck", "Headstock", "GuitarString", "TunerButton", "TunerPost", "NeckPlate", "NeckStripe", "FretDot", "Bridge", "TremArm", "Knob"] },
  { id: "board", prefixes: ["BoardFrame", "BoardCork", "BoardNote", "BoardPin"] },
  { id: "sketches", prefixes: ["Sketch_", "SketchLine_"] },
  { id: "coatRack", prefixes: ["RackLeg", "RackRung", "RackTopRod", "RackShelf", "FoldedBlanket", "Hgr", "Sweater", "Scarf", "Hat", "Pants"] },
  { id: "door", prefixes: ["DoorSlab", "DoorPanel", "DoorHandle"] },
];

const GLOBE_GROUP = { id: "globe" };

function findGroupForObject(obj) {
  let node = obj;
  while (node) {
    for (const group of INTERACTIVE_GROUPS) {
      if (group.prefixes.some((p) => node.name && node.name.startsWith(p))) {
        return group;
      }
    }
    node = node.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pointer interaction: hover + click
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById("tooltip");

function setPointerFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

let hoveredGroup = null;

function raycastGlobeHit() {
  if (!floatingGlobe.visible) return false;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(floatingGlobe, false).length > 0;
}

window.addEventListener("pointermove", (e) => {
  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);

  const onGlobe = raycastGlobeHit();
  const hits = onGlobe ? [] : raycaster.intersectObjects(raycastTargets, false);
  const group = onGlobe
    ? GLOBE_GROUP
    : hits.length ? findGroupForObject(hits[0].object) : null;

  if (group !== hoveredGroup) {
    hoveredGroup = group;
    canvas.classList.toggle("hoverable", !!group);
  }
if (group && group.label) {
    tooltip.textContent = group.label;
    tooltip.style.left = `${e.clientX}px`;
    tooltip.style.top = `${e.clientY}px`;
    tooltip.classList.remove("hidden");
} else {
    tooltip.classList.add("hidden");
}

});

// Distinguish a real click from an OrbitControls drag: only fire the
// interaction if pointerup lands close to where pointerdown started.
let downX = 0, downY = 0;
window.addEventListener("pointerdown", (e) => {
  downX = e.clientX;
  downY = e.clientY;
});

window.addEventListener("pointerup", (e) => {
  if (e.target !== canvas) return; // click landed on a UI overlay, not the 3D scene

  const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (dist > 6) {
    // was a drag/orbit, not a click — let go and spring back to center
    if (referenceView.position) flyCameraTo(referenceView, 600);
    return;
  }

  setPointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);

  if (raycastGlobeHit()) {
    openMapModal();
    return;
  }

  const hits = raycaster.intersectObjects(raycastTargets, false);
  const group = hits.length ? findGroupForObject(hits[0].object) : null;

  if (group) {
    handleInteraction(group.id);
  } else if (focusedId) {
    // clicked empty space (or unlabeled geometry) while zoomed in — back out
    returnToOverview();
  }
});

// ---------------------------------------------------------------------------
// Camera fly-to: zoom to an object's front on click, fly back on empty click
// ---------------------------------------------------------------------------
const DEFAULT_VIEW = {
  position: fromBlender(4.2, -2.8, 2.0),
  target: fromBlender(1.4, 1.0, 0.85),
};

// Best-estimate framing per object, written as Blender (x, y, z) and run
// through fromBlender() so they line up with the Blender scene coordinates.
// Approximate — flag any that look off and they get tuned individually
// rather than re-deriving the whole set.
const FOCUS_VIEWS = {
  laptop: {
    // elevated, angled down, roughly perpendicular to the screen's tilt
    position: fromBlender(1.86, 1.55, 1.35),
    target: fromBlender(1.86, 2.08, 0.83),
  },
  books: {
    position: fromBlender(0.675, 1.5, 0.45),
    target: fromBlender(0.675, 2.08, 0.4),
  },
  recordPlayer: {
    // near top-down, small y offset only so the angle isn't a perfect
    // gimbal-lock-prone vertical
    position: fromBlender(0.675, 2.0, 1.55),
    target: fromBlender(0.675, 2.08, 0.855),
  },
  guitar: {
    position: fromBlender(2.72, 1.3, 0.55),
    target: fromBlender(2.72, 1.95, 0.5),
  },
  board: {
    position: fromBlender(0.6, 1.45, 1.3),
    target: fromBlender(0.06, 1.45, 1.3),
  },
  sketches: {
    position: fromBlender(0.675, 1.5, 1.3),
    target: fromBlender(0.675, 2.2, 1.3),
  },
  coatRack: {
    // approached from a room-side diagonal instead of straight down the
    // wall's normal, so the desk chair doesn't sit in the sightline
    position: fromBlender(0.75, 0.9, 0.75),
    target: fromBlender(0.22, 1.45, 0.6),
  },
  door: {
    position: fromBlender(1.2, 0.65, 0.95),
    target: fromBlender(0.05, 0.65, 0.95),
  },
};

let cameraTweenHandle = null;
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function flyCameraTo({ position, target }, duration = 900, onDone) {
  controls.enabled = false;
  // Lift the angle constraints for the duration of the flight — otherwise
  // OrbitControls.update() clamps every in-between frame to the *next*
  // preset's narrow window and the camera appears to snap partway there
  // before the lerp catches up. Full range restored once we arrive.
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(...position);
  const endTarget = new THREE.Vector3(...target);
  const startTime = performance.now();
  if (cameraTweenHandle) cancelAnimationFrame(cameraTweenHandle);

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = easeInOutQuad(t);
    camera.position.lerpVectors(startPos, endPos, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    controls.update();
    if (t < 1) {
      cameraTweenHandle = requestAnimationFrame(step);
    } else {
      cameraTweenHandle = null;
      controls.enabled = true;
      // Now that we've arrived, re-center the ±35°/±20° drag window here.
      constrainOrbitAround(position, target);
      controls.update();
      if (onDone) onDone();
    }
  }
  cameraTweenHandle = requestAnimationFrame(step);
}

let focusedId = null;

function handleInteraction(id) {
  if (id === "door") {
    if (!doorAction) return;
    doorAction.paused = false;
    doorAction.timeScale = doorOpen ? -1 : 1;
    if (doorOpen) {
      doorAction.play();
    } else {
      doorAction.reset();
      doorAction.play();
    }
    doorOpen = !doorOpen;
    setGlobeVisible(doorOpen);
  } else if (id === "recordPlayer") {

  openMusic();

  } else if (id === "board") {

  openBoard();

  } else if (id === "laptop") {

  // handled once the camera arrives, via the onDone callback below

  } else {
  // Placeholder
  console.log(`[interaction] clicked "${id}" — content page TODO`);
  }

  if (focusedId === id) return; // already zoomed in on this one
  focusedId = id;
  const view = FOCUS_VIEWS[id];
  if (view) {
    const onDone = id === "laptop"
      ? () => {
          controls.enabled = false;
          openLaptop(() => returnToOverview());
        }
      : undefined;
    flyCameraTo(view, 900, onDone);
  }
}

function returnToOverview() {
  if (!focusedId) return;
  focusedId = null;
  flyCameraTo(DEFAULT_VIEW);
}

// ---------------------------------------------------------------------------
// World map modal — click the globe to open it. Pins are stored as
// {x, y} percentages of the map image so they stay put at any zoom level,
// persisted in localStorage so they're still there next visit.
// ---------------------------------------------------------------------------
const MAP_PINS_KEY = "studyroom.visitedPlaces";
const mapModal = document.getElementById("map-modal");
const mapCanvas = document.getElementById("map-canvas");
const mapImage = document.getElementById("map-image");
const mapCloseBtn = document.getElementById("map-close");

// Baked into the site so every visitor sees the same map, not just this
// browser. {x, y} are percentages of the map image (equirectangular:
// x = (lon+180)/360*100, y = (90-lat)/180*100). Home gets its own style.
const HOME_PLACE = { name: "长沙 · 家乡", x: 81.37, y: 34.32 };
const DEFAULT_PLACES = [
  // 北美
  { name: "麦迪逊", x: 25.17, y: 26.07 },
  { name: "旧金山", x: 15.99, y: 29.02 },
  { name: "纽约", x: 29.44, y: 27.38 },
  { name: "波士顿", x: 30.26, y: 26.47 },
  { name: "华盛顿", x: 28.60, y: 28.38 },
  { name: "奥兰多", x: 27.39, y: 34.14 },
  { name: "多伦多", x: 27.95, y: 25.75 },
  { name: "魁北克旧城", x: 30.22, y: 23.99 },
  { name: "蒙特利尔", x: 29.56, y: 24.72 },
  { name: "墨西哥", x: 22.46, y: 39.21 },
  // 中国
  { name: "济南", x: 82.50, y: 29.64 },
  { name: "烟台", x: 83.74, y: 29.19 },
  { name: "青岛", x: 83.44, y: 29.96 },
  { name: "聊城", x: 82.22, y: 29.74 },
  { name: "开封", x: 81.75, y: 30.67 },
  { name: "西安", x: 80.26, y: 30.96 },
  { name: "乌鲁木齐", x: 74.34, y: 25.65 },
  { name: "湘潭", x: 81.37, y: 34.54 },
  { name: "常德", x: 81.03, y: 33.88 },
  { name: "益阳", x: 81.21, y: 34.12 },
  { name: "武汉", x: 81.75, y: 33.01 },
  { name: "上海", x: 83.74, y: 32.65 },
  { name: "北京", x: 82.34, y: 27.83 },
  { name: "天津", x: 82.56, y: 28.28 },
  { name: "秦皇岛", x: 83.22, y: 27.81 },
  { name: "北海", x: 80.31, y: 38.07 },
  { name: "广州", x: 81.46, y: 37.15 },
  { name: "深圳", x: 81.68, y: 37.48 },
  { name: "东莞", x: 81.60, y: 37.21 },
  { name: "腾冲", x: 77.36, y: 36.09 },
  { name: "芒市", x: 77.39, y: 36.43 },
  // 欧洲
  { name: "米兰", x: 52.55, y: 24.74 },
  { name: "贝加莫", x: 52.69, y: 24.61 },
  { name: "克雷马", x: 52.69, y: 24.80 },
  { name: "佛罗伦萨", x: 53.13, y: 25.68 },
  { name: "罗马", x: 53.47, y: 26.72 },
  { name: "因斯布鲁克", x: 53.17, y: 23.74 },
  { name: "汉堡", x: 52.78, y: 20.25 },
  { name: "阿姆斯特丹", x: 51.36, y: 20.91 },
].map((p) => ({ ...p, isDefault: true }));

function loadCustomPins() {
  try {
    return JSON.parse(localStorage.getItem(MAP_PINS_KEY)) || [];
  } catch {
    return [];
  }
}
function saveCustomPins(pins) {
  localStorage.setItem(MAP_PINS_KEY, JSON.stringify(pins));
}

let customPlaces = loadCustomPins();

function renderPins() {
  mapCanvas.querySelectorAll(".map-pin").forEach((el) => el.remove());

  const addPin = (place, onRemove) => {
    const pin = document.createElement("div");
    pin.className = "map-pin" + (place.name === HOME_PLACE.name ? " home" : "");
    pin.style.left = `${place.x}%`;
    pin.style.top = `${place.y}%`;
    const label = document.createElement("span");
    label.className = "map-pin-label";
    label.textContent = place.name || "标记";
    pin.appendChild(label);
    if (onRemove) {
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        onRemove();
      });
    }
    mapCanvas.appendChild(pin);
  };

  addPin(HOME_PLACE, null);
  DEFAULT_PLACES.forEach((place) => addPin(place, null));
  customPlaces.forEach((place, index) => {
    addPin(place, () => {
      customPlaces.splice(index, 1);
      saveCustomPins(customPlaces);
      renderPins();
    });
  });
}

mapCanvas.addEventListener("click", (e) => {
  const rect = mapImage.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return;
  const name = prompt("这个地方叫什么名字?(可留空)") || "";
  customPlaces.push({ x, y, name });
  saveCustomPins(customPlaces);
  renderPins();
});

function openMapModal() {
  renderPins();
  mapModal.classList.remove("hidden");
}
function closeMapModal() {
  mapModal.classList.add("hidden");
}
mapCloseBtn.addEventListener("click", closeMapModal);
mapModal.addEventListener("click", (e) => {
  if (e.target === mapModal) closeMapModal(); // click on the dim backdrop
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMapModal();
    closeMusicPanel();
  }
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function animateGlobe(delta, elapsed) {
  // fade toward whatever setGlobeVisible last requested
  const fadeSpeed = 1.5; // per second
  const diff = globeFadeTarget - globeMaterial.opacity;
  if (Math.abs(diff) > 0.001) {
    globeMaterial.opacity += Math.sign(diff) * Math.min(Math.abs(diff), fadeSpeed * delta);
  } else if (globeFadeTarget === 0) {
    floatingGlobe.visible = false;
  }
  floatingGlobe.rotation.y += delta * 0.25;
  floatingGlobe.position.y = GLOBE_BASE_POS[1] + Math.sin(elapsed * 0.6) * 0.04;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer_holder.mixer) mixer_holder.mixer.update(delta);
  animateGlobe(delta, clock.getElapsedTime());
  controls.update();
  renderer.render(scene, camera);
}
animate();

//record player
// ===============================
// Record Player Music System
// ===============================


// HTML elements
const musicModal = document.getElementById("music-modal");
const playlist = document.getElementById("playlist");
const player = document.getElementById("audioPlayer");
const closeMusic = document.getElementById("closeMusic");


// Your fixed playlist
const songs = [
    {
        name: "counterfactual",
        url: "/public/music/counterfactual.mp3"
    },
    {
        name: "claire",
        url: "/public/music/claire.mp3"
    },
    {
        name: "等我到你的年纪",
        url: "/public/music/等我到你的年纪.mp3"
    }
];


// Create playlist UI
function showPlaylist(){
    playlist.innerHTML = "";
    songs.forEach((song)=>{
        const li = document.createElement("li");
        li.textContent = "▶ " + song.name;
        li.onclick = ()=>{
            player.src = song.url;
            player.play();
        };
        playlist.appendChild(li);
    });
}



// Open music window
function openMusic(){
    musicModal.classList.remove("hidden");
    showPlaylist();
}



// Close music window
function closeMusicPanel(){
    musicModal.classList.add("hidden");
}



if(closeMusic){
    closeMusic.onclick = closeMusicPanel;
}

// Click on the dim backdrop (outside the panel) closes it
musicModal.addEventListener("click", (e) => {
    if (e.target === musicModal) closeMusicPanel();
});

// ---- Floating music notes next to the record player, while it plays ----
const noteLayer = document.getElementById("note-layer");
const recordPlayerAnchor = new THREE.Vector3(...FOCUS_VIEWS.recordPlayer.target);
const NOTE_GLYPHS = ["♪", "♫", "♬"];
let noteSpawnHandle = null;

function spawnNote() {
    const screenPos = recordPlayerAnchor.clone().project(camera);
    if (screenPos.z > 1) return; // anchor is behind the camera

    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top;

    const note = document.createElement("span");
    note.className = "music-note";
    note.textContent = NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)];
    note.style.left = `${x + (Math.random() * 30 - 15)}px`;
    note.style.top = `${y}px`;
    note.style.setProperty("--rot", `${Math.random() * 24 - 12}deg`);
    note.addEventListener("animationend", () => note.remove());
    noteLayer.appendChild(note);
}

function startNotes() {
    if (noteSpawnHandle) return;
    spawnNote();
    noteSpawnHandle = setInterval(spawnNote, 450);
}

function stopNotes() {
    clearInterval(noteSpawnHandle);
    noteSpawnHandle = null;
}

player.addEventListener("play", startNotes);
player.addEventListener("pause", stopNotes);
player.addEventListener("ended", stopNotes);