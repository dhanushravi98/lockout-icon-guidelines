# Brand design guidelines

A searchable, static site for the full Phosphor icon set (1,512 icons x 6 weights).
Developers search, pick a weight, size and color, then copy or download the icon.

## Run it

    npm install
    npm start          # builds, then serves http://localhost:4173

`npm run build` alone writes the deployable site to `dist/`.

## Deploy

Any static host works. On Vercel or Netlify set:

- Build command: `npm run build`
- Output directory: `dist`

## Update the icons

    npm update @phosphor-icons/core
    npm run build

New icons, tags and categories are picked up from the package. No code changes needed.

## What the build generates

| Output | Purpose |
| --- | --- |
| `dist/data/projects.json` | Project list with palettes, built from `projects/`. |
| `dist/data/manifest.json` | Name, tags, categories for every icon. Search runs on this. |
| `dist/data/<weight>.json` | One bundle per weight. The grid loads only the weight in use (about 190 KB gzipped). |
| `dist/icons/<weight>/<name>.svg` | Individual files for direct linking and for coding tools that need a path. |

## Features

- Search by name, keyword or category, ranked by match quality
- Project dropdown with logo and per-project color palettes; switching projects recolors the icons
- Weight, size and color controls that apply to the grid, the copied code and downloads
- Duotone support with separate primary and secondary colors
- Detail panel: Copy SVG, Copy PNG, Copy JSX, Download SVG, Download PNG, React component snippet, icon name, file URL
- Shareable URLs: `?project=lockout&q=shield&weight=duotone&color=25395c&color2=e8872b&icon=shield`
- Keyboard: `/` focuses search, `Esc` closes the detail panel

## Projects, logos and color palettes

The dropdown at the top lists every folder in `projects/`. Selecting one swaps the logo, the site accent color, the swatches in the color picker, and the icon preview colors. Icons start in the project's first color, and Duotone adds the second brand color. To choose different starting colors, add `"iconColors": { "primary": "#25395C", "secondary": "#45B1BF" }` to `project.json`.

To add a project, copy an existing folder in `projects/`, then edit two files:

- `project.json`: project name, company, and color groups (each color is a name and a 6-digit hex). The first color is used as the site accent.
- The logo image: SVG or PNG, with the file name set in `project.json`. Crop away empty margins so it fills the logo card.

Run `npm run build` and the project appears in the dropdown.

The Info Services logo at the top of the sidebar lives in `src/brand/`.

Kioti is dummy content for now. Its orange and black are sampled from the logo; the other colors are placeholders. Lockout's navy (`#25395C`) and blue (`#1F6FEB`) come from the existing designs and its teal from the logo; the Lockout status colors are estimates. Replace them with the real tokens.

## Color picker

Click a color swatch in the sidebar to open the picker:

- **Project colors**: the active project's swatches, grouped, with the color name and hex shown on hover.
- **Color wheel**: a hue ring with a saturation and brightness square, plus a hex field (accepts `#25395C`, `25395c` or `#abc`).

With the Duotone weight selected, there are two pickers (primary and secondary) and a secondary opacity slider. Phosphor draws the light layer at 20% opacity. When you choose a secondary color it switches to 100% so the second color shows solid, and you can adjust it from there.

The site is light mode only. Grid previews display at 70% of the chosen size. Radius and fonts are tokens at the top of `src/styles.css`.

## Files

    scripts/build.mjs   reads the Phosphor package, writes dist/
    scripts/serve.mjs   local preview server
    projects/           one folder per project: project.json and logo
    src/brand/          company logo (Info Services)
    src/                page, styles and app logic (copied into dist/)

Phosphor Icons is MIT licensed. The license is copied to `dist/LICENSE-phosphor.txt` on every build.
