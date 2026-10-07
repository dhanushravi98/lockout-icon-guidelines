# Brand design guidelines: rules for AI coding tools

This repo is the source of truth for icons. Follow it when building UI.

## Setup (once per checkout)
Run npm install && npm run build. This generates dist/, which holds the icon manifest and SVG files. dist/ is generated and not committed, so never edit it.

## Icons
- The web app is React. Use @phosphor-icons/react. Do not draw, invent or download other icons.
- Find icons by searching dist/data/manifest.json. Each entry has n (file name, like shield-check), p (React component name, like ShieldCheck), c (categories) and t (tags). Search names and tags before guessing.
- Default weight is regular. Use fill for selected or active states.
- The React package cannot set a second color for the duotone weight. If a design needs two colors, inline the SVG from dist/icons/duotone/<name>.svg. The lighter layer is the path with opacity="0.2"; give it its own fill.

