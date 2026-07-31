import L from "leaflet";
import { t, onLangChange } from "./i18n.js";

// ---------------------------------------------------------------------------
// World map modal — a real pannable/zoomable OpenStreetMap, opened by
// clicking the globe. Pins are stored as {x, y} percentages of an
// equirectangular projection (x = (lon+180)/360*100, y = (90-lat)/180*100) —
// the same scheme the old flat-image map used — so existing saved pins in
// visitors' localStorage keep working; we just convert to/from lat/lng when
// talking to Leaflet.
// ---------------------------------------------------------------------------
const MAP_PINS_KEY = "studyroom.visitedPlaces";

const mapModal = document.getElementById("map-modal");
const mapCloseBtn = document.getElementById("map-close");
const mapTitleEl = document.querySelector("#map-panel h2");
const mapHintEl = document.querySelector(".map-hint");
const mapContainer = document.getElementById("leaflet-map");

function refreshMapText() {
  mapCloseBtn.setAttribute("aria-label", t("mapClose"));
  mapTitleEl.textContent = t("mapTitle");
  mapHintEl.textContent = t("mapHint");
}
refreshMapText();
onLangChange(refreshMapText);

function xyToLatLng(x, y) {
  return [90 - (y / 100) * 180, (x / 100) * 360 - 180];
}
function latLngToXY(lat, lng) {
  return { x: ((lng + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 };
}

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

const map = L.map(mapContainer, { worldCopyJump: true, minZoom: 2 }).setView([20, 10], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

const homeIcon = L.divIcon({ className: "map-pin-icon map-pin-home", iconSize: [18, 18] });
const defaultIcon = L.divIcon({ className: "map-pin-icon", iconSize: [14, 14] });

const pinLayer = L.layerGroup().addTo(map);

function renderPins() {
  pinLayer.clearLayers();

  const addPin = (place, onRemove) => {
    const [lat, lng] = xyToLatLng(place.x, place.y);
    const marker = L.marker([lat, lng], {
      icon: place === HOME_PLACE ? homeIcon : defaultIcon,
    });
    marker.bindTooltip(place.name || t("mapMarkerFallback"), {
      direction: "top",
      className: "map-pin-tooltip",
    });
    if (onRemove) {
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onRemove();
      });
    }
    marker.addTo(pinLayer);
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
renderPins();

map.on("click", (e) => {
  const name = prompt(t("mapPromptName")) || "";
  const { x, y } = latLngToXY(e.latlng.lat, e.latlng.lng);
  customPlaces.push({ x, y, name });
  saveCustomPins(customPlaces);
  renderPins();
});

function closeMapModal() {
  mapModal.classList.add("hidden");
}
mapCloseBtn.addEventListener("click", closeMapModal);
mapModal.addEventListener("click", (e) => {
  if (e.target === mapModal) closeMapModal(); // click on the dim backdrop
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !mapModal.classList.contains("hidden")) closeMapModal();
});

export function openMapModal() {
  mapModal.classList.remove("hidden");
  map.invalidateSize();
}
