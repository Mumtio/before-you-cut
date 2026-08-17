# Before You Cut

Draw a garment on a body, cut it into swappable parts, render it as real cloth, and see it
worn by real people.

**→ [before-you-cut.onrender.com](https://before-you-cut.onrender.com)**

Built for the YouCam API Skin AI & Apparel VTO Hackathon.

## What it does

- **Body** — pick a template and shape it with sliders. Generated on your machine, never
  sent anywhere, never part of an export.
- **Draw** — layers, brushes, colour, undo, pan and zoom, mirror mode.
- **Parts** — draw a boundary around any area, name it, and save what is inside as a
  version. Save alternatives and switch between them; everything outside stays untouched.
- **Combinations** — every way the parts can go together, as flat drawings. Free and
  instant.
- **Fabrics** — paint an area and say what it is made of: "silk chiffon", "heavy crepe".
- **Render** — turn the flat drawing into photographic cloth, carrying every fabric note.
- **Try-on** — put the result on your own model photos through the Apparel VTO API.

Everything up to Render costs nothing and happens instantly. Only the last two steps call
the API.

## How to use it

1. **Body** — pick a shape, adjust the sliders, press *Start drawing*.
2. **Studio** — draw the garment. Use *Parts* to enclose an area and save versions of it.
3. **Fabrics** — paint over an area and write what it is made of.
4. **Render** — press *Render* to get the garment back as real cloth. **1 unit.**
5. **Fitting** — add a model photo and press *Try it on*. **1 unit per person.**

Projects save themselves in the browser. **Export this project** writes a single
self-contained `.sampleroom.json` holding the drawing, every version, and every mask.

## Run it locally

```bash
cd server && npm install && cp .env.example .env   # add your YOUCAM_API_KEY
npm start                                          # http://localhost:8787

cd ../app && npm install && npm run dev            # open the URL Vite prints
```

`npm run probe` in `server/` checks the key against the live API without spending a unit.
The key lives only on the server and never reaches the browser.

Deployment notes are in [DEPLOY.md](DEPLOY.md).
