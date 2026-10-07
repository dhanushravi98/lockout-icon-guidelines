// Generates dist/ from @phosphor-icons/core.
// Re-run after `npm update @phosphor-icons/core` to pick up new icons.
import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

// The package's exports map hides package.json, so locate it on disk instead.
const coreDir = path.join(root, "node_modules", "@phosphor-icons", "core");
const corePkgPath = path.join(coreDir, "package.json");
const corePkg = JSON.parse(await readFile(corePkgPath, "utf8"));
const { icons } = await import(pathToFileURL(path.join(coreDir, "dist/index.mjs")).href);

const WEIGHTS = ["thin", "light", "regular", "bold", "fill", "duotone"];
const fileFor = (name, weight) =>
  path.join(coreDir, "assets", weight, weight === "regular" ? `${name}.svg` : `${name}-${weight}.svg`);

const innerOf = (svg) =>
  svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "data"), { recursive: true });

// Manifest: what the search runs against.
const categoryCounts = new Map();
const manifestIcons = icons.map((i) => {
  for (const c of i.categories) categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
  return {
    n: i.name,
    p: i.pascal_name,
    c: i.categories,
    t: i.tags.filter((t) => !t.startsWith("*")).map((t) => t.toLowerCase()),
    v: i.published_in,
  };
});

const manifest = {
  source: "@phosphor-icons/core",
  version: corePkg.version,
  count: manifestIcons.length,
  weights: WEIGHTS,
  categories: [...categoryCounts].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id)),
  icons: manifestIcons,
};
await writeFile(path.join(dist, "data/manifest.json"), JSON.stringify(manifest));

// One bundle per weight (name -> inner SVG markup) so the grid needs a single request,
// plus individual static files for direct linking and for tools that want a file path.
let fileCount = 0;
for (const weight of WEIGHTS) {
  const bundle = {};
  const outDir = path.join(dist, "icons", weight);
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    icons.map(async (i) => {
      const svg = await readFile(fileFor(i.name, weight), "utf8");
      bundle[i.name] = innerOf(svg);
      await writeFile(path.join(outDir, `${i.name}.svg`), svg);
      fileCount++;
    })
  );
  const sorted = Object.fromEntries(Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path.join(dist, "data", `${weight}.json`), JSON.stringify(sorted));
}

// Projects: every folder in projects/ with a project.json becomes an entry in the dropdown.
// Add a project by copying projects/example and editing its colors and logo.
const projects = [];
const projectsDir = path.join(root, "projects");
for (const entry of await readdir(projectsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const cfgPath = path.join(projectsDir, entry.name, "project.json");
  let cfg;
  try { cfg = JSON.parse(await readFile(cfgPath, "utf8")); } catch { continue; }
  const hexes = cfg.groups.flatMap((g) => g.colors.map((c) => c.hex));
  const bad = hexes.find((h) => !/^#[0-9a-fA-F]{6}$/.test(h));
  if (bad) throw new Error(`projects/${entry.name}: "${bad}" is not a 6-digit hex color`);
  projects.push({ id: entry.name, order: 50, ...cfg });
  await cp(path.join(projectsDir, entry.name), path.join(dist, "projects", entry.name), { recursive: true });
}
projects.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
await writeFile(path.join(dist, "data/projects.json"), JSON.stringify(projects));

// App shell + Phosphor's MIT license (required when redistributing the icons).
await cp(path.join(root, "src"), dist, { recursive: true });
await cp(path.join(coreDir, "LICENSE"), path.join(dist, "LICENSE-phosphor.txt"));

console.log(`Projects: ${projects.map((p) => p.name).join(", ")}`);
console.log(
  `Built ${manifest.count} icons x ${WEIGHTS.length} weights (${fileCount} SVG files) from ${manifest.source}@${manifest.version}`
);
