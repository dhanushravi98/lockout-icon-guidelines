const $ = (sel, root = document) => root.querySelector(sel);
const CHUNK = 240;
const INK = "#141A22";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const state = {
  project: null, q: "", weight: "regular", cat: "all", size: 32,
  color: null, color2: null, o2: null, icon: null,
};

let manifest;
let projects = [];
let byName = new Map();
let results = [];
let shown = 0;
const bundles = {}; // weight -> Promise<{ name: innerMarkup }>
const fileCache = new Map(); // "weight/name" -> Promise<innerMarkup>

const el = {
  app: $("#app"), q: $("#q"), project: $("#project"), logo: $("#logo"), weights: $("#weights"),
  size: $("#size"), sizeNum: $("#sizeNum"),
  colorField: $("#colorField"), colorLabel: $("#colorLabel"), color1: $("#color1"), color2: $("#color2"),
  sw1: $("#sw1"), sw2: $("#sw2"), ct1: $("#ct1"), ct2: $("#ct2"), ch1: $("#ch1"), ch2: $("#ch2"),
  opRow: $("#opRow"), op2: $("#op2"), op2v: $("#op2v"), colorHint: $("#colorHint"),
  cats: $("#cats"), meta: $("#meta"), count: $("#count"), grid: $("#grid"),
  empty: $("#empty"), emptyMsg: $("#emptyMsg"), clear: $("#clearFilters"), sentinel: $("#sentinel"), toast: $("#toast"),
  detail: $("#detail"), dName: $("#dName"), dPascal: $("#dPascal"), dClose: $("#dClose"),
  dPreview: $("#dPreview"), dWeights: $("#dWeights"), dCats: $("#dCats"), dTags: $("#dTags"),
  sReact: $("#sReact"), sName: $("#sName"), sPath: $("#sPath"), sNote: $("#sNote"),
  picker: $("#picker"), tabProject: $("#tabProject"), tabWheel: $("#tabWheel"),
  panelProject: $("#panelProject"), panelWheel: $("#panelWheel"),
  wheel: $("#wheel"), sv: $("#sv"), hueKnob: $("#hueKnob"), svKnob: $("#svKnob"),
  cmpOld: $("#cmpOld"), cmpNew: $("#cmpNew"), hex: $("#hex"), hexErr: $("#hexErr"),
  pReset: $("#pReset"), pDone: $("#pDone"),
};

const project = () => projects.find((p) => p.id === state.project) || projects[0];

/* ---------- color utilities ---------- */

function normHex(v) {
  let h = String(v).trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toUpperCase()}` : null;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb({ h, s, v }) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return [f(5), f(3), f(1)];
}

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (hex) => (luminance(hex) > 0.45 ? INK : "#FFFFFF");

/* ---------- duotone ---------- */

const isDuo = () => state.weight === "duotone";
const secondaryOpacity = () => state.o2 ?? (state.color2 ? 1 : 0.2);

// Phosphor duotone icons draw the light layer as a path with opacity="0.2".
// For exports we rewrite that path's fill and opacity.
function withDuotone(inner) {
  if (!isDuo()) return inner;
  const c2 = state.color2;
  const o = secondaryOpacity();
  if (!c2 && o === 0.2) return inner;
  return inner.replace(/<path([^>]*?) opacity="0\.2"/g, (_, a) => `<path${a}${c2 ? ` fill="${c2}"` : ""} opacity="${o}"`);
}

/* ---------- data ---------- */

const loadBundle = (w) =>
  (bundles[w] ??= fetch(`data/${w}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${w} icons`);
    return r.json();
  }));

const innerOf = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();

const loadInner = (weight, name) => {
  const key = `${weight}/${name}`;
  if (!fileCache.has(key)) {
    fileCache.set(
      key,
      fetch(`icons/${weight}/${name}.svg`).then((r) => {
        if (!r.ok) throw new Error("Icon file missing");
        return r.text();
      }).then(innerOf)
    );
  }
  return fileCache.get(key);
};

/* ---------- search ---------- */

function score(icon, t) {
  const n = icon.n;
  if (n === t) return 100;
  if (n.split("-").includes(t)) return 70;
  if (n.startsWith(t)) return 60;
  if (n.includes(t)) return 40;
  let best = 0;
  for (const g of icon.t) {
    if (g === t) best = Math.max(best, 30);
    else if (g.startsWith(t)) best = Math.max(best, 20);
    else if (g.includes(t)) best = Math.max(best, 10);
  }
  if (!best && icon.c.some((c) => c.includes(t))) best = 5;
  return best;
}

function runSearch() {
  const tokens = state.q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  let list = manifest.icons;
  if (state.cat !== "all") list = list.filter((i) => i.c.includes(state.cat));
  if (!tokens.length) return list;
  const scored = [];
  for (const icon of list) {
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = score(icon, t);
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push([total, icon]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].n.localeCompare(b[1].n));
  return scored.map((x) => x[1]);
}

/* ---------- markup builders ---------- */

const svgMarkup = (inner, size, color, fallback = "currentColor") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}" fill="${color || fallback}">${inner}</svg>`;

const jsxMarkup = (inner, size, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={${size}} height={${size}} fill="${color || "currentColor"}">${inner}</svg>`;

const reactSnippet = (icon) =>
  `import { ${icon.p} } from "@phosphor-icons/react";\n\n<${icon.p} size={${state.size}} weight="${state.weight}"${state.color ? ` color="${state.color}"` : ""} />`;

const filePath = (icon) => `icons/${state.weight}/${icon.n}.svg`;
const fileName = (icon, ext) => `${icon.n}-${state.weight}.${ext}`;

/* ---------- grid ---------- */

let bundle = {};
let observer;

function tileHTML(icon) {
  const inner = bundle[icon.n];
  if (!inner) return "";
  const cur = icon.n === state.icon ? ' aria-current="true"' : "";
  return `<li><button class="tile" type="button" data-name="${icon.n}"${cur} title="${icon.n}">` +
    `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${inner}</svg>` +
    `<span class="name">${icon.n}</span></button></li>`;
}

function renderMore() {
  if (shown >= results.length) return;
  const slice = results.slice(shown, shown + CHUNK);
  el.grid.insertAdjacentHTML("beforeend", slice.map(tileHTML).join(""));
  shown += slice.length;
}

async function renderResults() {
  const weight = state.weight;
  bundle = await loadBundle(weight);
  if (weight !== state.weight) return; // a newer change won the race
  results = runSearch();
  shown = 0;
  el.grid.innerHTML = "";
  renderMore();

  const total = results.length;
  el.count.textContent = `${total.toLocaleString()} ${total === 1 ? "icon" : "icons"}`;
  el.empty.hidden = total > 0;
  el.grid.hidden = total === 0;
  if (!total) {
    el.emptyMsg.textContent = state.q
      ? `No icons match “${state.q}”. Try a broader keyword, like a synonym.`
      : "No icons in this category.";
  }
}

// Size and color are CSS variables, so changing them never re-renders the grid.
function applyStyles() {
  // Grid previews render at 70% of the chosen size (capped), so more icons fit and each has room.
  el.grid.style.setProperty("--icon-size", `${Math.round(Math.min(state.size, 64) * 0.7 * 10) / 10}px`);
  el.detail.style.setProperty("--size", `${state.size}px`);
  for (const t of [el.grid, el.detail]) {
    if (state.color) t.style.setProperty("--icon-color", state.color);
    else t.style.removeProperty("--icon-color");
    if (state.color2) t.style.setProperty("--c2", state.color2);
    else t.style.removeProperty("--c2");
    t.style.setProperty("--o2", String(secondaryOpacity()));
  }
}

/* ---------- project ---------- */

// Icon colors a project starts with: its first color, plus the next brand color for duotone.
// Override per project with "iconColors": { "primary": "#...", "secondary": "#..." or null }.
function projectDefaults() {
  const p = project();
  const ic = p.iconColors || {};
  const brand = p.groups[0].colors;
  const secondary = "secondary" in ic ? ic.secondary : brand[1]?.hex;
  return {
    color: normHex(ic.primary || brand[0].hex),
    color2: secondary ? normHex(secondary) : null,
  };
}

function applyProjectColors() {
  const d = projectDefaults();
  state.color = d.color;
  state.color2 = d.color2;
  state.o2 = null;
}

function applyProject() {
  const p = project();
  state.project = p.id;
  const accent = normHex(p.accent || p.groups[0].colors[0].hex);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-ink", onColor(accent));
  document.title = `${p.name} brand design guidelines`;
  const card = el.logo.parentElement;
  card.hidden = false;
  el.logo.onerror = () => { card.hidden = true; };
  el.logo.src = `projects/${p.id}/${p.logo}`;
  el.logo.alt = p.company || p.name;
}

/* ---------- controls ---------- */

function buildControls() {
  el.weights.innerHTML = manifest.weights
    .map((w) => `<label><input type="radio" name="weight" value="${w}"><span>${cap(w)}</span></label>`)
    .join("");

  const cats = [{ id: "all", label: "All icons", count: manifest.count }].concat(
    manifest.categories.map((c) => ({ id: c.id, label: cap(c.id), count: c.count }))
  );
  el.cats.innerHTML = cats
    .map((c) => `<li><button type="button" data-cat="${c.id}" aria-pressed="false"><span>${c.label}</span><span class="n">${c.count}</span></button></li>`)
    .join("");

  el.project.innerHTML = projects.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  el.meta.textContent = `${manifest.count.toLocaleString()} icons in ${manifest.weights.length} weights`;
}

function syncColorControls() {
  const duo = isDuo();
  const base = state.color || INK;

  el.colorLabel.textContent = duo ? "Colors" : "Color";
  el.ct1.textContent = duo ? "Primary" : "Color";
  el.ch1.textContent = state.color || "Text color";
  el.sw1.style.setProperty("--c", base);
  el.sw1.classList.toggle("is-inherit", !state.color);

  el.color2.hidden = !duo;
  el.opRow.hidden = !duo;
  el.ct2.textContent = "Secondary";
  el.ch2.textContent = state.color2 || "Same as primary";
  el.sw2.style.setProperty("--c", state.color2 || `color-mix(in srgb, ${base} 20%, #fff)`);

  const pct = Math.round(secondaryOpacity() * 100);
  el.op2.value = pct;
  el.op2v.textContent = `${pct}%`;

  el.colorHint.textContent = duo
    ? "Set secondary opacity to 100% for a solid second color. PNG downloads use these colors."
    : state.color
      ? "PNG downloads use this color too."
      : "Icons inherit the surrounding text color. PNG downloads are black.";
}

function syncControls() {
  if (el.q.value !== state.q) el.q.value = state.q;
  el.project.value = state.project;
  for (const r of el.weights.querySelectorAll("input")) r.checked = r.value === state.weight;
  el.size.value = Math.min(state.size, +el.size.max);
  el.sizeNum.value = state.size;
  for (const b of el.cats.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat));
  syncColorControls();
  applyStyles();
}

/* ---------- URL state ---------- */

let urlTimer;
function writeURL() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const p = new URLSearchParams();
    if (state.project !== projects[0].id) p.set("project", state.project);
    if (state.q) p.set("q", state.q);
    if (state.weight !== "regular") p.set("weight", state.weight);
    if (state.cat !== "all") p.set("category", state.cat);
    if (state.size !== 32) p.set("size", state.size);
    const d = projectDefaults();
    if (state.color !== d.color) p.set("color", state.color ? state.color.slice(1).toLowerCase() : "text");
    if (state.color2 !== d.color2) p.set("color2", state.color2 ? state.color2.slice(1).toLowerCase() : "same");
    if (state.o2 !== null) p.set("o2", Math.round(state.o2 * 100));
    if (state.icon) p.set("icon", state.icon);
    const qs = p.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }, 120);
}

function readURL() {
  const p = new URLSearchParams(location.search);
  state.project = projects.some((x) => x.id === p.get("project")) ? p.get("project") : projects[0].id;
  state.q = p.get("q") || "";
  const w = p.get("weight");
  if (manifest.weights.includes(w)) state.weight = w;
  const c = p.get("category");
  if (c && manifest.categories.some((x) => x.id === c)) state.cat = c;
  const s = parseInt(p.get("size"), 10);
  if (s >= 8 && s <= 1024) state.size = s;
  const d = projectDefaults();
  state.color = p.has("color") ? (p.get("color") === "text" ? null : normHex(p.get("color"))) : d.color;
  state.color2 = p.has("color2") ? (p.get("color2") === "same" ? null : normHex(p.get("color2"))) : d.color2;
  const o = parseInt(p.get("o2"), 10);
  if (o >= 5 && o <= 100) state.o2 = o / 100;
  const icon = p.get("icon");
  if (icon && byName.has(icon)) state.icon = icon;
}

/* ---------- detail panel ---------- */

function updateSnippet() {
  const icon = byName.get(state.icon);
  if (!icon) return;
  el.sReact.textContent = reactSnippet(icon);
  el.sNote.hidden = !(isDuo() && (state.color2 || state.o2 !== null));
}

async function renderDetail({ focus = false } = {}) {
  const icon = byName.get(state.icon);
  if (!icon) { el.detail.hidden = true; el.app.classList.remove("has-detail"); return; }
  const weight = state.weight;
  const name = icon.n;

  el.detail.hidden = false;
  el.app.classList.add("has-detail");
  el.dName.textContent = icon.n;
  el.dPascal.textContent = icon.p;

  const inner = await loadInner(weight, name);
  if (state.icon !== name || state.weight !== weight) return;

  el.dPreview.innerHTML = `<svg viewBox="0 0 256 256" fill="currentColor" aria-label="${name}, ${weight} weight" role="img">${inner}</svg>`;
  el.sName.textContent = icon.n;
  el.sPath.textContent = filePath(icon);
  updateSnippet();

  el.dCats.innerHTML = icon.c.map((c) => `<button type="button" data-cat="${c}">${cap(c)}</button>`).join("");
  el.dTags.innerHTML = icon.t.map((t) => `<button type="button" data-tag="${t}">${t}</button>`).join("");

  const inners = await Promise.all(manifest.weights.map((w) => loadInner(w, name)));
  if (state.icon !== name) return;
  el.dWeights.innerHTML = manifest.weights
    .map((w, i) =>
      `<button type="button" data-weight="${w}" aria-pressed="${w === state.weight}" title="${cap(w)}">` +
      `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${inners[i]}</svg><span class="w">${cap(w)}</span></button>`
    ).join("");

  if (focus) el.dName.focus({ preventScroll: true });
}

function openIcon(name, opts) {
  state.icon = name;
  for (const t of el.grid.querySelectorAll('[aria-current="true"]')) t.removeAttribute("aria-current");
  el.grid.querySelector(`[data-name="${CSS.escape(name)}"]`)?.setAttribute("aria-current", "true");
  writeURL();
  return renderDetail(opts);
}

function closeDetail() {
  const name = state.icon;
  state.icon = null;
  for (const t of el.grid.querySelectorAll('[aria-current="true"]')) t.removeAttribute("aria-current");
  el.detail.hidden = true;
  el.app.classList.remove("has-detail");
  writeURL();
  if (name) el.grid.querySelector(`[data-name="${CSS.escape(name)}"]`)?.focus({ preventScroll: true });
}

/* ---------- actions ---------- */

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1800);
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) { toast("Couldn’t copy. Select the text and copy it manually."); return; }
  }
  toast(done);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const current = async () => {
  const icon = byName.get(state.icon);
  return { icon, inner: withDuotone(await loadInner(state.weight, icon.n)) };
};

async function copySvg() {
  const { inner } = await current();
  copyText(svgMarkup(inner, state.size, state.color), "SVG copied");
}

async function downloadSvg() {
  const { icon, inner } = await current();
  download(new Blob([svgMarkup(inner, state.size, state.color)], { type: "image/svg+xml" }), fileName(icon, "svg"));
  toast("SVG downloaded");
}

async function renderPng(inner) {
  const size = state.size;
  const svg = svgMarkup(inner, size, state.color, "#000000");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d").drawImage(img, 0, 0, size, size);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadPng() {
  try {
    const { icon, inner } = await current();
    download(await renderPng(inner), fileName(icon, "png"));
    toast("PNG downloaded");
  } catch {
    toast("Couldn’t create the PNG. Download the SVG instead.");
  }
}

function copyPng() {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    toast("Your browser can’t copy images here. Download the PNG instead.");
    return;
  }
  // The ClipboardItem is created inside the click handler and given a promise,
  // which is what Safari requires for async image copies.
  const blob = current().then(({ inner }) => renderPng(inner));
  navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
    .then(() => toast("PNG copied"))
    .catch(() => toast("Couldn’t copy the PNG. Download it instead."));
}

async function copyJsx() {
  const { inner } = await current();
  copyText(jsxMarkup(inner, state.size, state.color), "JSX copied");
}

/* ---------- state changes ---------- */

let searchTimer;
function setState(patch, { search = false, detail = false } = {}) {
  Object.assign(state, patch);
  syncControls();
  writeURL();
  if (search) renderResults();
  if (detail && state.icon) renderDetail();
  else updateSnippet();
}

/* ---------- color picker ---------- */

const picker = { open: false, target: "color", anchor: null, hsv: { h: 0, s: 0, v: 0 }, from: null };
const WHEEL = { size: 232, mid: 106, ringMin: 88, sqLeft: 54, sqSize: 124 };

const targetBase = () => (picker.target === "color2" ? state.color || INK : INK);
const pickerValue = () => state[picker.target];

function setHsvFromHex(hex) {
  const next = rgbToHsv(hexToRgb(hex));
  // Keep the hue when the color is gray, so the wheel doesn't jump to red.
  if (next.s === 0 || next.v === 0) next.h = picker.hsv.h;
  picker.hsv = next;
}

function pick(hex) {
  setState({ [picker.target]: hex });
  syncPickerUI();
}

function syncPickerUI() {
  const value = pickerValue();
  const shown = value || targetBase();
  const { h, s, v } = picker.hsv;
  const cur = hexToRgb(rgbToHex(hsvToRgb(picker.hsv)));

  // Project colors tab
  for (const b of el.panelProject.querySelectorAll(".swatch")) b.setAttribute("aria-pressed", String(b.dataset.hex === value));
  setReadout(value);

  // Wheel tab
  el.sv.style.setProperty("--h", Math.round(h));
  const a = (h * Math.PI) / 180;
  el.hueKnob.style.left = `${WHEEL.size / 2 + WHEEL.mid * Math.sin(a)}px`;
  el.hueKnob.style.top = `${WHEEL.size / 2 - WHEEL.mid * Math.cos(a)}px`;
  el.hueKnob.style.setProperty("--k", `hsl(${h} 100% 50%)`);
  el.svKnob.style.left = `${WHEEL.sqLeft + s * WHEEL.sqSize}px`;
  el.svKnob.style.top = `${WHEEL.sqLeft + (1 - v) * WHEEL.sqSize}px`;
  el.svKnob.style.setProperty("--k", rgbToHex(cur));
  el.cmpNew.style.background = shown;
  el.cmpOld.style.background = picker.from || targetBase();
  if (document.activeElement !== el.hex) {
    el.hex.value = shown;
    el.hex.setAttribute("aria-invalid", "false");
    el.hexErr.textContent = "";
  }

  el.pReset.disabled = !value;
}

function setReadout(hex, hovered) {
  const box = $("#readout");
  if (!box) return;
  const use = hovered || hex;
  if (!use) {
    box.innerHTML = `<span class="dot" style="--c:${targetBase()}"></span><span><b>${picker.target === "color2" ? "Same as primary" : "Text color"}</b></span>`;
    return;
  }
  const match = project().groups.flatMap((g) => g.colors).find((c) => normHex(c.hex) === use);
  box.innerHTML = `<span class="dot" style="--c:${use}"></span><span><b>${match ? match.name : "Custom color"}</b> <span class="v">${use}</span></span>`;
}

function renderProjectTab() {
  const check = `<svg viewBox="0 0 256 256" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M229.66 77.66l-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32Z"/></svg>`;
  el.panelProject.innerHTML =
    project().groups.map((g) =>
      `<div class="pgroup"><h4>${g.name}</h4><div class="swatches">` +
      g.colors.map((c) => {
        const hex = normHex(c.hex);
        return `<button type="button" class="swatch" data-hex="${hex}" data-name="${c.name}" aria-pressed="false" ` +
          `style="--c:${hex};--tick:${onColor(hex)}" title="${c.name} ${hex}" aria-label="${c.name} ${hex}"><span class="tick">${check}</span></button>`;
      }).join("") + `</div></div>`
    ).join("") + `<div class="readout" id="readout" aria-live="polite"></div>`;
}

function selectTab(which) {
  const proj = which === "project";
  el.tabProject.setAttribute("aria-selected", String(proj));
  el.tabWheel.setAttribute("aria-selected", String(!proj));
  el.tabProject.tabIndex = proj ? 0 : -1;
  el.tabWheel.tabIndex = proj ? -1 : 0;
  el.panelProject.hidden = !proj;
  el.panelWheel.hidden = proj;
  placePicker();
  syncPickerUI();
}

function placePicker() {
  if (!picker.open) return;
  const r = picker.anchor.getBoundingClientRect();
  const w = el.picker.offsetWidth;
  const h = el.picker.offsetHeight;
  let left = r.left;
  if (left + w > innerWidth - 8) left = innerWidth - w - 8;
  let top = r.bottom + 8;
  if (top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8);
  el.picker.style.left = `${Math.max(8, left)}px`;
  el.picker.style.top = `${top}px`;
}

function openPicker(target, anchor) {
  if (picker.open && picker.target === target) { closePicker(); return; }
  if (picker.open) closePicker(false);
  picker.open = true;
  picker.target = target;
  picker.anchor = anchor;
  picker.from = pickerValue();
  setHsvFromHex(pickerValue() || targetBase());
  el.pReset.textContent = target === "color2" ? "Same as primary" : "Use text color";
  el.picker.setAttribute("aria-label", target === "color2" ? "Choose secondary color" : isDuo() ? "Choose primary color" : "Choose a color");
  anchor.setAttribute("aria-expanded", "true");
  renderProjectTab();
  el.picker.hidden = false;
  selectTab("project");
  (el.panelProject.querySelector('.swatch[aria-pressed="true"]') || el.panelProject.querySelector(".swatch") || el.tabProject).focus();
}

function closePicker(restoreFocus = true) {
  if (!picker.open) return;
  picker.open = false;
  el.picker.hidden = true;
  picker.anchor.setAttribute("aria-expanded", "false");
  if (restoreFocus) picker.anchor.focus();
}

function wirePicker() {
  el.color1.addEventListener("click", () => openPicker("color", el.color1));
  el.color2.addEventListener("click", () => openPicker("color2", el.color2));
  el.pDone.addEventListener("click", () => closePicker());
  el.pReset.addEventListener("click", () => {
    setState({ [picker.target]: null });
    if (picker.target === "color2") setState({ o2: null });
    setHsvFromHex(targetBase());
    syncPickerUI();
  });

  el.tabProject.addEventListener("click", () => selectTab("project"));
  el.tabWheel.addEventListener("click", () => selectTab("wheel"));
  el.picker.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const toWheel = el.tabProject.getAttribute("aria-selected") === "true";
    selectTab(toWheel ? "wheel" : "project");
    (toWheel ? el.tabWheel : el.tabProject).focus();
  });

  // Project colors
  el.panelProject.addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    setHsvFromHex(b.dataset.hex);
    pick(b.dataset.hex);
  });
  const hover = (e) => {
    const b = e.target.closest?.(".swatch");
    if (b) setReadout(pickerValue(), b.dataset.hex);
  };
  el.panelProject.addEventListener("mouseover", hover);
  el.panelProject.addEventListener("focusin", hover);
  const unhover = () => setReadout(pickerValue());
  el.panelProject.addEventListener("mouseleave", unhover);
  el.panelProject.addEventListener("focusout", unhover);

  // Color wheel: hue ring plus saturation/brightness square
  let mode = null;
  const local = (e) => {
    const r = el.wheel.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const drag = (e) => {
    const [x, y] = local(e);
    if (mode === "sv") {
      picker.hsv.s = Math.min(1, Math.max(0, (x - WHEEL.sqLeft) / WHEEL.sqSize));
      picker.hsv.v = 1 - Math.min(1, Math.max(0, (y - WHEEL.sqLeft) / WHEEL.sqSize));
    } else {
      const c = WHEEL.size / 2;
      picker.hsv.h = ((Math.atan2(x - c, -(y - c)) * 180) / Math.PI + 360) % 360;
    }
    pick(rgbToHex(hsvToRgb(picker.hsv)));
  };
  el.wheel.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e);
    const c = WHEEL.size / 2;
    const inSquare = x >= WHEEL.sqLeft && x <= WHEEL.sqLeft + WHEEL.sqSize && y >= WHEEL.sqLeft && y <= WHEEL.sqLeft + WHEEL.sqSize;
    const d = Math.hypot(x - c, y - c);
    if (inSquare) mode = "sv";
    else if (d >= WHEEL.ringMin && d <= c + 6) mode = "hue";
    else return;
    el.wheel.setPointerCapture(e.pointerId);
    drag(e);
  });
  el.wheel.addEventListener("pointermove", (e) => { if (mode) drag(e); });
  const end = () => { mode = null; };
  el.wheel.addEventListener("pointerup", end);
  el.wheel.addEventListener("pointercancel", end);

  // Hex field
  el.hex.addEventListener("focus", () => el.hex.select());
  el.hex.addEventListener("input", () => {
    const hex = normHex(el.hex.value);
    if (hex) {
      el.hex.setAttribute("aria-invalid", "false");
      el.hexErr.textContent = "";
      setHsvFromHex(hex);
      pick(hex);
    }
  });
  const commitHex = () => {
    const hex = normHex(el.hex.value);
    if (!hex) {
      el.hex.setAttribute("aria-invalid", "true");
      el.hexErr.textContent = "Enter a 6-digit hex code, like #25395C.";
      return false;
    }
    el.hex.value = hex;
    return true;
  };
  el.hex.addEventListener("blur", commitHex);
  el.hex.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (commitHex()) closePicker(); }
  });

  document.addEventListener("pointerdown", (e) => {
    if (picker.open && !el.picker.contains(e.target) && !e.target.closest(".color-btn")) closePicker(false);
  });
  addEventListener("resize", placePicker);
  addEventListener("scroll", (e) => {
    if (picker.open && !el.picker.contains(e.target)) closePicker(false);
  }, true);
}

/* ---------- wiring ---------- */

function wire() {
  el.q.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setState({ q: el.q.value.trim() }, { search: true }), 90);
  });
  el.q.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.q.value) { el.q.value = ""; setState({ q: "" }, { search: true }); }
  });

  el.project.addEventListener("change", () => {
    closePicker(false);
    state.project = el.project.value;
    applyProject();
    applyProjectColors();
    syncControls();
    updateSnippet();
    writeURL();
  });

  el.weights.addEventListener("change", (e) => {
    if (e.target.name === "weight") { closePicker(false); setState({ weight: e.target.value }, { search: true, detail: true }); }
  });

  const setSize = (v) => setState({ size: Math.max(8, Math.min(1024, parseInt(v, 10) || 32)) });
  el.size.addEventListener("input", () => setSize(el.size.value));
  el.sizeNum.addEventListener("change", () => setSize(el.sizeNum.value));

  el.op2.addEventListener("input", () => setState({ o2: +el.op2.value / 100 }));

  el.cats.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (b) setState({ cat: b.dataset.cat }, { search: true });
  });

  el.clear.addEventListener("click", () => {
    el.q.value = "";
    setState({ q: "", cat: "all" }, { search: true });
    el.q.focus();
  });

  el.grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-name]");
    if (b) openIcon(b.dataset.name, { focus: true });
  });

  // Infinite render: add the next chunk when the sentinel nears the viewport.
  observer = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting)) renderMore();
  }, { rootMargin: "800px" });
  observer.observe(el.sentinel);

  el.dClose.addEventListener("click", closeDetail);
  $("#aCopySvg").addEventListener("click", copySvg);
  $("#aDlSvg").addEventListener("click", downloadSvg);
  $("#aDlPng").addEventListener("click", downloadPng);
  $("#aCopyPng").addEventListener("click", copyPng);
  $("#aCopyJsx").addEventListener("click", copyJsx);
  el.sReact.addEventListener("click", () => copyText(el.sReact.textContent, "React component copied"));
  el.sName.addEventListener("click", () => copyText(el.sName.textContent, "Icon name copied"));
  el.sPath.addEventListener("click", () =>
    copyText(new URL(el.sPath.textContent, location.href.split("?")[0]).href, "File URL copied"));

  el.dWeights.addEventListener("click", (e) => {
    const b = e.target.closest("[data-weight]");
    if (b) { closePicker(false); setState({ weight: b.dataset.weight }, { search: true, detail: true }); }
  });
  el.dCats.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (b) setState({ cat: b.dataset.cat }, { search: true });
  });
  el.dTags.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]");
    if (b) { el.q.value = b.dataset.tag; setState({ q: b.dataset.tag, cat: "all" }, { search: true }); }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker.open) { e.preventDefault(); closePicker(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); el.q.focus(); el.q.select(); }
    if (e.key === "Escape" && state.icon && !typing) closeDetail();
  });

  wirePicker();
}

/* ---------- init ---------- */

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return r.json();
}

async function init() {
  try {
    [manifest, projects] = await Promise.all([getJSON("data/manifest.json"), getJSON("data/projects.json")]);
    if (!projects.length) throw new Error("No projects");
  } catch {
    el.meta.textContent = "Couldn’t load the icon data. Run npm run build, then serve the dist folder.";
    return;
  }
  byName = new Map(manifest.icons.map((i) => [i.n, i]));
  buildControls();
  readURL();
  applyProject();
  syncControls();
  wire();
  await renderResults();
  if (state.icon) renderDetail();
}

init();
