# Sample Room

A tool for garment designers. Draw a dress on a body template, cut it into swappable
regions, try many versions of each region, assign a real fabric to each part, render the
whole thing as realistic cloth, then see it worn by real people.

Built against [`sample-room-build-spec.md`](sample-room-build-spec.md) for the YouCam API
Skin AI & Apparel VTO Hackathon.

## Run it

Two processes: the front end, and a small backend that holds the API key.

```bash
# backend — the only place the key exists
cd server
cp .env.example .env        # then put your YouCam key in YOUCAM_API_KEY
npm install
npm run probe               # checks the key against the live API, spends nothing
npm start                   # http://localhost:8787

# front end
cd ../app
npm install
npm run dev
```

Then open the URL Vite prints. `/api` is proxied to the backend, so the browser never
holds a key. The app opens on **Body** — pick a shape, adjust it, and
press *Start drawing* to go through to the **Studio**. `Change body` in the studio, or the
`Body` step in the header, takes you back; the drawing is untouched either way.

## Build order

Each part works fully before the next one starts.

| # | Part | Status |
|---|------|--------|
| 1 | Drawing surface — layers, brushes, colour, undo, pan/zoom | ✅ done |
| 2 | Body setup screen — templates, sliders, guide lines, mirror mode | ✅ done |
| 3 | Parts & versions — draw a boundary, save versions, swap | ✅ done |
| 4 | Projects & flat export | ✅ done |
| 5 | Try-on through the YouCam Apparel VTO API (via backend proxy) | ✅ done |
| 6 | Fabric zones & realistic render | ✅ done |
| 7 | Combination grid & fitting board | — |

## Layout

```
app/                 front end (Vite + React + TypeScript)
  src/canvas/        pixel work — rasters, strokes, fill, history, compositing
  src/body/          the drawing body: silhouette maths and guide lines
  src/regions/       parts: boundaries, snapping, overlap, versions
  src/fabric/        fabric zones: painted masks, presets, staleness
  src/project/       save/load (IndexedDB), file format, flat export
  src/state/         zustand store (metadata only; bitmaps live outside React)
  src/components/    UI
  scripts/           dev helpers that drive the app in a real browser
server/              backend proxy that holds the API key (added in part 5)
```

The API key never reaches the browser.

## Dev helpers

With the dev server running:

```bash
node scripts/shot.mjs out.png     # screenshot the app
node scripts/smoke.mjs out.png    # draw real strokes through it, then screenshot
node scripts/parts.mjs pt         # draw a dress, cut a part, save and swap versions
node scripts/project.mjs pj       # autosave, reload, restore, and check the flat export
node scripts/pan.mjs              # report whether each way of moving the canvas works
node scripts/panels.mjs pn        # collapse the panels and screenshot
node scripts/tryon.mjs to model.jpg   # full run: draw → fitting → worn (spends 1 unit)
node scripts/fabric.mjs fab --single  # paint two fabric zones, render as cloth (1 unit)
```

## What testing settled

§8 leaves the render method open: zone-by-zone masked replacement, or one combined call,
"if a single combined call turns out to respect the zones well enough in testing".

It does. One `image-to-image` pass carrying every fabric note came back as photographic
cloth with the crepe bodice and sheer chiffon skirt clearly distinct. One `obj-replace`
per zone — the approach with more control on paper — inpainted artefacts instead. So the
single call is the default, at 1 unit however many zones there are; zone-by-zone stays in
the UI to compare against.

Both drive the copy of Edge already on the machine, so there is no browser download.
