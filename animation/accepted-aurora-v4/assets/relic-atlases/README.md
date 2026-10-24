These transparent PNG atlases are baked from this project's existing six relic
models, using `scripts/bake-native-relic-atlases.cjs`. Each has 120 views at 3°
steps, 12 columns, 216 px per tile, model unit 1. The renderer blends adjacent
views and the two energy states of output relics 0 and 3. Input relics share
their unpowered atlas. World size, floating centres and reflection remain live.
Etching is fully present in these cached views rather than redrawn face by face.

Normal builds copy and checksum these files; baking is an optional developer
operation. It requires an existing Puppeteer module and Chromium, supplied with
`PUPPETEER_MODULE` and `CHROME_EXECUTABLE`. Run the native resource builder first,
then the baker, then `build-desktop.ps1` to copy the new assets. The baker opens
only the synthetic effect page. It never reads the real desktop or Codex UI.

`manifest.json` records the model source and all atlas SHA-256 hashes. Rebake
after changing that source. The accepted independent design draft is preserved.
