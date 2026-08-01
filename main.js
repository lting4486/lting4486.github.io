import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { openBoard } from "./board.js";
import { openLaptop } from "./laptop.js";
import { openMapModal } from "./map.js";
import { t, getLang, toggleLang, onLangChange } from "./i18n.js";

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
// Fixed to the "day" look — warmed toward a golden-hour peach/orange to
// match the lofi-room mood. (Used to cycle through dusk/night presets tied
// to the real clock, but those read as murky and low-contrast in the
// real-time renderer, so the room now always stays in day lighting.)
const DAY_PRESET = {
  sunColor: [0.961, 0.922, 0.659], sunEnergy: 0,
  windowColor: [1, 0.8, 0.973], windowEnergy: 11.43,
  lampEnergy: 13.89, lampColor: [0.898, 0.675, 0.6],
  fillColor: [0.773, 0.549, 0.549], fillEnergy: 11,
  ambientColor: [0.969, 0.831, 0.773], ambientStrength: 0.53,
  envIntensity: 0.53,
};

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

applyLightPreset(DAY_PRESET);

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
    openLaptop(handleLaptopExit, { animate: false });
  },
  undefined,
  (err) => {
    console.error("Failed to load study_room.glb", err);
    document.querySelector(".loading-text").textContent = t("loadError");
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
  const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (dist > 6) {
    // was a drag/orbit, not a click — let go and spring back to center
    if (referenceView.position) flyCameraTo(referenceView, 600);
    return;
  }

  // The welcome clip sits over furniture on the wall and is pointer-events:
  // none, so a click "on" it actually lands on the canvas underneath —
  // catch it here with a real pixel check before falling through to the 3D
  // raycast, so only the visible ink (not its whole black rectangle) is
  // clickable.
  if (isClickOnWelcomeInk(e.clientX, e.clientY)) {
    cycleWelcomeQuote();
    return;
  }

  if (e.target !== canvas) return; // click landed on a UI overlay, not the 3D scene

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
          openLaptop(handleLaptopExit);
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

// Shared by both the auto-opened landing view and manual laptop clicks —
// whichever one the visitor exits from first fires the "first exit" music cue.
let hasAutoPlayedMusic = false;
function handleLaptopExit() {
  returnToOverview();
  document.getElementById("hint").classList.remove("hidden");
  showWelcomeText();
  if (!hasAutoPlayedMusic) {
    hasAutoPlayedMusic = true;
    playSongByName("等我到你的年纪");
  }
}

const roomLangToggleBtn = document.getElementById("room-lang-toggle");
const hintEl = document.getElementById("hint");
const closeMusicBtn = document.getElementById("closeMusic");
const welcomeVideoEl = document.getElementById("welcome-video");

// Real handwritten black-bg/white-ink clips, composited with mix-blend-mode:
// screen (see style.css) so the black areas disappear and only the ink
// shows. Only the greeting follows the zh/en toggle — every click after
// that jumps to a random quote clip from one shared pool, independent of
// the current language.
const GREETING_VIDEOS = {
  en: "assets/sentences/welcome.mp4",
  zh: "assets/sentences/huanying.mp4",
};
const QUOTE_VIDEOS = [
  "assets/sentences/quote-teacher-talent.mp4",
  "assets/sentences/quote-osmanthus.mp4",
  "assets/sentences/quote-xia.mp4",
  "assets/sentences/quote-isee-zh.mp4",
  "assets/sentences/quote-chenziang.mp4",
  "assets/sentences/quote-isee-en.mp4",
  "assets/sentences/quote-landor-zh.mp4",
  "assets/sentences/quote-wilde-serious.mp4",
  "assets/sentences/quote-landor-en.mp4",
  "assets/sentences/quote-kind.mp4",
  "assets/sentences/quote-qinguan.mp4",
  "assets/sentences/quote-wilde-stars.mp4",
  "assets/sentences/quote-woolf.mp4",
];

let welcomeShown = false;
let showingGreeting = true;
let currentQuoteSrc = null;

function pickNextQuote() {
  if (QUOTE_VIDEOS.length === 1) return QUOTE_VIDEOS[0];
  let next;
  do {
    next = QUOTE_VIDEOS[Math.floor(Math.random() * QUOTE_VIDEOS.length)];
  } while (next === currentQuoteSrc);
  return next;
}

function playWelcomeVideo(src) {
  welcomeVideoEl.pause();
  welcomeVideoEl.src = src;
  welcomeVideoEl.currentTime = 0;
  welcomeVideoEl.play().catch(() => {});
}
function showWelcomeText() {
  welcomeShown = true;
  showingGreeting = true;
  playWelcomeVideo(GREETING_VIDEOS[getLang()]);
}
// Clicking the clip jumps to a random quote. Only the greeting itself is
// tied to the language toggle; quotes are drawn from one shared pool
// regardless of it. The video sits over furniture on the wall (see
// WELCOME_ANCHOR), so it stays pointer-events:none and gets a real pixel
// hit-test in the pointerup handler below instead of claiming its whole
// (mostly invisible, black) rectangle as clickable.
function cycleWelcomeQuote() {
  showingGreeting = false;
  currentQuoteSrc = pickNextQuote();
  playWelcomeVideo(currentQuoteSrc);
}

const welcomeHitCanvas = document.createElement("canvas");
const welcomeHitCtx = welcomeHitCanvas.getContext("2d", { willReadFrequently: true });
// Handwritten strokes are thin with lots of gaps (between letters, inside
// "o"/"e", etc.), so an exact single-pixel hit test is unreasonably hard to
// land with a real mouse. Check a small neighborhood around the click
// instead — a "close enough to the ink" tolerance — rather than demanding
// the literal stroke pixel.
const WELCOME_CLICK_TOLERANCE_PX = 16; // screen-space radius, independent of current scale

function isClickOnWelcomeInk(clientX, clientY) {
  if (welcomeVideoEl.style.visibility === "hidden") return false;
  if (!welcomeVideoEl.videoWidth || welcomeVideoEl.readyState < 2) return false;
  const rect = welcomeVideoEl.getBoundingClientRect();
  const tol = WELCOME_CLICK_TOLERANCE_PX;
  if (
    clientX < rect.left - tol || clientX > rect.right + tol ||
    clientY < rect.top - tol || clientY > rect.bottom + tol
  ) {
    return false;
  }
  const vw = welcomeVideoEl.videoWidth;
  const vh = welcomeVideoEl.videoHeight;
  welcomeHitCanvas.width = vw;
  welcomeHitCanvas.height = vh;
  welcomeHitCtx.drawImage(welcomeVideoEl, 0, 0, vw, vh);

  const px = ((clientX - rect.left) / rect.width) * vw;
  const py = ((clientY - rect.top) / rect.height) * vh;
  const radiusPx = Math.max(6, (tol / rect.width) * vw); // screen tolerance -> source-pixel radius

  const x0 = Math.max(0, Math.floor(px - radiusPx));
  const x1 = Math.min(vw - 1, Math.ceil(px + radiusPx));
  const y0 = Math.max(0, Math.floor(py - radiusPx));
  const y1 = Math.min(vh - 1, Math.ceil(py + radiusPx));
  if (x1 < x0 || y1 < y0) return false;

  const data = welcomeHitCtx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 40) return true;
  }
  return false;
}

function refreshRoomText() {
  document.title = t("siteTitle");
  roomLangToggleBtn.textContent = t("langToggle");
  hintEl.textContent = t("hint");
  closeMusicBtn.setAttribute("aria-label", t("musicClose"));
  if (welcomeShown && showingGreeting) playWelcomeVideo(GREETING_VIDEOS[getLang()]);
}
refreshRoomText();
onLangChange(refreshRoomText);
roomLangToggleBtn.addEventListener("click", () => toggleLang());

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
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

// Floating handwriting clip — anchored to a fixed spot in the room (not the
// screen), so it keeps its place and perspective size as the camera moves,
// with a gentle continuous bob layered on top of the anchor's world Y.
const WELCOME_ANCHOR = new THREE.Vector3(...fromBlender(1.4, 1.0, 1.7));
const WELCOME_REF_DISTANCE = 4; // camera distance at which the text renders at scale 1

function updateWelcomeText() {
  const pos = WELCOME_ANCHOR.clone();
  pos.y += Math.sin(clock.getElapsedTime() * 0.7) * 0.06;

  const screenPos = pos.clone().project(camera);
  if (screenPos.z > 1) {
    welcomeVideoEl.style.visibility = "hidden";
    return;
  }
  welcomeVideoEl.style.visibility = "visible";

  const rect = renderer.domElement.getBoundingClientRect();
  const x = (screenPos.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-screenPos.y * 0.5 + 0.5) * rect.height + rect.top;
  const scale = WELCOME_REF_DISTANCE / camera.position.distanceTo(pos);

  welcomeVideoEl.style.left = `${x}px`;
  welcomeVideoEl.style.top = `${y}px`;
  // translateZ(0) forces this onto its own GPU compositing layer — without
  // it, mix-blend-mode on a <video> often fails to blend with the canvas
  // behind it (the video stays on a hardware-decode path that skips normal
  // CSS blend compositing).
  welcomeVideoEl.style.transform = `translate(-50%, -50%) scale(${scale}) translateZ(0)`;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer_holder.mixer) mixer_holder.mixer.update(delta);
  animateGlobe(delta, clock.getElapsedTime());
  controls.update();
  renderer.render(scene, camera);
  updateWelcomeText();
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


function playSongByName(name) {
    const song = songs.find((s) => s.name === name);
    if (!song) return;
    player.src = song.url;
    player.play();
}

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