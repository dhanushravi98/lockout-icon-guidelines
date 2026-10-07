# Brand design guidelines: rules for AI coding tools

Source of truth for icons. Follow it when building UI.
Nothing needs to be installed or built. Read everything from the live site.

Site: https://dhanushravi98.github.io/lockout-icon-guidelines

## Finding an icon
- The web app is React. Use `@phosphor-icons/react`. Do not draw, invent or download other icons.
- Search the manifest. It is about 200 KB, so filter it instead of reading all of it (requires `jq`):

  curl -s https://dhanushravi98.github.io/lockout-icon-guidelines/data/manifest.json | jq -r --arg q "alert" '.icons[] | select((.n | contains($q)) or any(.t[]; contains($q))) | "\(.n)\t\(.p)"'

- Each entry has `n` (file name), `p` (React component name, like `ShieldCheck`), `c` (categories) and `t` (tags). If nothing matches, try synonyms.
- Import the component named in `p`: `import { ShieldCheck } from "@phosphor-icons/react"`.

## Weights
- Default is `regular`. Use `fill` for selected or active states. Others: `thin`, `light`, `bold`. Never use the `duotone` weight.

## Existing code
- Apply these rules only to icons you add or change. If you notice an existing icon that breaks them, mention it, but don't rewrite it unless asked.
