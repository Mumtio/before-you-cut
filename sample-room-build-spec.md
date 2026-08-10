# Sample Room — Build Specification

A tool for garment designers. Draw a dress on a body template, cut it into swappable regions, try many versions of each region, assign a real fabric to each part, render the whole thing as realistic cloth, then see it worn by real people.

This document is written to be handed to a coding agent. It describes what the software does, how the data is shaped, and the order to build it in.

---

## 1. The flow, end to end

1. **Set up the body.** Pick a body template and adjust its shape with sliders. Guide lines appear on it (shoulder, bust, waist, hip, centre front, knee, hem levels).
2. **Draw the dress.** Freehand drawing on layers above the body, using brushes and a colour wheel.
3. **Create parts.** Draw a boundary around any area and name it whatever makes sense. What is inside that boundary is saved as a variant. Erase inside the boundary, draw something different, save that as a second variant.
4. **Swap.** Switch any region between its saved variants. Everything outside the boundary stays untouched.
5. **Assign fabrics.** Paint over an area of the dress with a selection brush, confirm it, then say what that area is made of — "silk chiffon", "heavy crepe", "cotton poplin". A garment rarely uses one material throughout. These painted areas are a separate thing from the boundaries used for swapping.
6. **Make it real.** Send the flat drawing plus the fabric notes to the API and get back a realistic garment image.
7. **Put it on people.** Send the realistic garment to the try-on API with real model photos. See the finished design worn.

Steps 1 to 5 cost nothing and are instant. Only steps 6 and 7 call the API. This split is deliberate and is what keeps the tool usable on a limited allowance.

---

## 2. Two different kinds of "body" — do not confuse them

**The drawing body** is a template the designer draws on. It is generated locally, adjusted with sliders, and never sent anywhere. Its only job is to give the designer something to draw against and to hold the guide lines.

**The try-on bodies** are photographs of real people, used at the very end. These are fixed images the designer selects from.

The sliders affect the drawing body only. Do **not** call an API when a slider moves — it would be slow, expensive, and pointless.

---

## 3. The drawing body and guide lines

Build the drawing body as a shape defined by a handful of numbers, drawn with code. Sliders change the numbers, the shape redraws instantly.

Suggested sliders: height, shoulder width, bust, waist, hip, arm length, leg length.

Suggested implementation: an SVG or canvas figure built from a small set of control points, where each slider moves specific points. It does not need anatomical accuracy. It needs to be a believable silhouette that responds smoothly and never breaks.

**Guide lines** are horizontal lines drawn across the body at: shoulder, bust, natural waist, hip, knee, plus a vertical centre-front line. They move with the sliders — the waist line always sits at whatever the current waist is.

Guide lines live on their own layer. Visible while drawing, hidden on export. They serve two purposes: the designer draws relative to them, and region boundaries snap to them.

**Mirror mode:** because there is a centre-front line, offer a toggle where drawing on one side automatically mirrors to the other. Most necklines and bodices are symmetrical, so this saves substantial time.

---

## 4. Layers

Standard layer behaviour, kept minimal.

- An ordered list, drawn bottom to top.
- Each layer: name, visible on/off, locked on/off, opacity.
- Locked layers cannot be drawn on or erased, but are still visible. This is what lets a designer lock the finished dress underneath and add an overlay of sheer fabric on top without disturbing it.
- The body layer and the guide layer are special: always at the bottom, always locked, never exported.

Three or four user layers is enough. Do not build a full art application.

---

## 5. Regions and variants — the core mechanism

This is the heart of the product. Build it carefully.

**Creating a region.** The designer presses "Create part", then draws a closed boundary on the canvas. On release, the shape closes and becomes a region, and the designer gives it a name.

The app has no built-in idea of what a neckline or a sleeve is, and should not try to have one. A region is a closed shape the artist drew and a label the artist typed. It might be "collar", "left sleeve", "that bit around the hip", or anything else. Do not offer preset body-part regions, do not detect garment areas automatically, and do not attach meaning to region names anywhere in the code.

This is what keeps the tool useful beyond dresses. The same mechanism works for a jacket, a shirt, trousers, a saree blouse — because the software never assumed what it was looking at.

Boundaries are freehand. Optionally offer light snapping to nearby guide lines as a drawing aid for precision, but it is not required for correctness.

Regions belong to the design they were drawn in. They do not transfer to other garments, because a different garment will be divided differently. This is expected, not a limitation to engineer around.

**Overlapping regions.** Two regions on the same layer must not overlap — reject the new boundary with a clear message, or trim it to fit. If the designer wants overlapping areas, they put them on separate layers, where ordering already exists and is already under their control. This avoids inventing a second ordering system that competes with layers.

A region belongs to one layer.

**Saving a variant.** When a region is created, whatever is currently drawn inside it is immediately saved as variant 1. The designer then erases inside the boundary and draws something else. Pressing "Save variant" stores that as variant 2. Repeat freely.

Only pixels inside the boundary belong to the variant. Drawing that crosses the boundary is allowed — the strokes can spill over visually while drawing, but the saved variant is clipped to the boundary shape. Do not prevent drawing outside it, only clip on save.

**Swapping.** Each region shows its variants as thumbnails. Clicking one makes it active. Switching is instant and local — nothing else on the canvas changes.

**How the canvas is composed.** For each layer, bottom to top:

1. Draw the layer's base image (everything not inside any region).
2. For each region on that layer, in a fixed order: clip to the region path, draw the active variant.

Store each layer as a base raster plus a set of regions. When a region is created, cut its pixels out of the base and move them into variant 1, leaving that area of the base transparent.

**Combination browsing.** With several regions each holding several variants, offer a grid view showing many combinations at once as flat drawings. This is pure local compositing, so it is free and instant. The designer eliminates most options by eye here, before spending anything on rendering.

---

## 6. Drawing tools

Keep this small and good rather than large and mediocre.

- Brush with adjustable size and opacity. Two or three types is plenty: a hard pencil for outlines, a soft brush for shading, a flat fill.
- Eraser, same size control.
- Colour wheel with a saved swatch row.
- Undo and redo, per layer.
- Pan and zoom.

If time is short, consider allowing import of layered artwork (one PNG per layer) from tools designers already use, so the built-in canvas only needs to handle region cutting and swapping.

---

## 7. Fabric zones

**These are not the same thing as parts. Keep them completely separate in the code.**

| | Parts | Fabric zones |
|---|---|---|
| What it is | A closed boundary the artist draws | An area the artist paints over |
| What it is for | Swapping design variants | Telling the render what material to use |
| How it is made | Draw an outline, name it | Paint with a selection brush, confirm |
| Shape | A path | A painted mask |
| When it is used | While designing | Just before rendering |

They do not line up and are not meant to. A sheer overlay might cover the whole bodice and half the skirt regardless of where the artist chose to cut their swap boundaries. Do not try to derive one from the other.

**How fabric zones are made.** The designer picks the selection brush and paints over part of the dress. The painted area shows as a coloured wash on top of the artwork so they can see what they have covered. Brush and eraser both work. When they are happy, they confirm the selection, and a text field appears: what is this made of.

Examples they might type: "silk chiffon, semi-sheer, soft drape", "structured cotton twill", "matte satin". Offer a few common fabrics as one-click presets but always allow free text — a designer's vocabulary is more precise than any dropdown.

Painting over an area that already belongs to another zone reassigns those pixels to the new one. Last paint wins. This is how selection tools normally behave and needs no explanation to the user.

Anything left unpainted uses a default fabric note for the garment as a whole.

**Keep the number of zones small.** Each one costs an API call at render time. Three to five is a realistic dress. Show the designer how many zones they have and what that will cost before they render.

**Timing matters.** Fabric zones are painted on a specific combination of variants. If the designer goes back and swaps a variant afterwards, the painted masks may no longer match the new shape. Warn them and let them repaint. Do not attempt to transform masks automatically when variants change — it will produce wrong results silently, which is worse than asking.

---

## 8. Making it realistic

Export the flat design first: hide the body layer and the guide layer, composite everything else, produce a PNG with a transparent background. This is the garment on its own.

Then send it to be rendered as real cloth, along with the fabric notes.

**Render zone by zone.** The painted fabric zones are already masks, which is exactly what a masked replacement call needs. For each zone, send the current image plus that zone's mask plus its fabric description, and apply them one after another, feeding each result into the next.

This is the natural fit for the way fabric zones are made, and it is the only way to get different materials in different places reliably. The cost is one call per zone, which is why the zone count should be kept small.

If a single combined call turns out to respect the zones well enough in testing, use that instead and save the units — but do not assume it will.

**Important:** this step can reinterpret the drawing — that is the risk of any generative render. Always keep the original flat version and show both. Let the designer choose which one goes forward to try-on. If the realistic render distorts the design, the flat version is still a valid thing to put on a body, because the try-on works on drawings.

---

## 9. Try-on

Send the rendered garment plus a model photo to the clothes try-on API. Repeat across several model photos to see it on different people.

Show results in a row alongside the design that produced them.

Let the designer mark each result as working or not working, with a short note. Collect these into a simple summary they can export.

---

## 10. Talking to the API

Server: `https://yce-api-01.makeupar.com`
Authentication: header `Authorization: Bearer YOUR_API_KEY`

**The API key must never reach the browser.** Build a small backend that holds the key and proxies every call. The front end talks only to your backend.

Every operation follows the same four steps:

1. `POST /s2s/v2.0/file/{feature}` with the file name, type, and size. Returns a `file_id` and a pre-signed upload URL.
2. `PUT` the actual image bytes to that URL. **This step is separate and required** — calling the file endpoint alone does not upload anything, and skipping it produces confusing 404 and 500 errors later.
3. `POST /s2s/v2.0/task/{feature}` with the `file_id` (or a public image URL). Returns a `task_id`.
4. `GET /s2s/v2.0/task/{feature}/{task_id}` repeatedly until status is `success` or `error`.

Replace `{feature}` with the actual feature name — `cloth` for try-on, and whichever endpoint testing shows works best for the realistic render.

**Things that will cause bugs if ignored:**

- Poll until the task finishes. If you stop polling and check later, you get an invalid-task error even though the task succeeded — and units are still consumed.
- Task IDs are long numbers. In JavaScript, parsing them as numbers silently corrupts them. Keep them as strings.
- A finished task returns a `dst_id`. Use it to feed the result straight into the next task without uploading again.
- Rate limits: roughly 250 requests per 300 seconds, 5 per second. Queue requests and back off on failure.
- Uploaded files last 24 hours; result download links may expire in around 2 hours. **Download every result to your own storage immediately.** Do not rely on their URLs for anything the designer expects to keep, and never for a demo.
- Units are only consumed on success, not on failure or while polling.

**Cost control:** show the designer a running count of units used, and warn before any action that will spend a large number at once.

---

## 11. Data shape

```
Project
  id, name, updatedAt
  body: { templateId, sliders: {height, shoulder, bust, waist, hip, armLength, legLength} }
  guideLines: [ {name, type: horizontal|vertical, position} ]
  layers: [
    {
      id, name, order, visible, locked, opacity,
      baseImage,                    // pixels not inside any region
      regions: [
        {
          id, name,
          path,                     // closed boundary, in canvas coordinates
          variants: [ {id, name, image, createdAt} ],
          activeVariantId
        }
      ]
    }
  ]
  fabricZones: [
    {
      id,
      mask,                         // painted area, 1-bit image at canvas size
      fabricNote,
      order,                        // application order at render time
      paintedForCombination         // which variant selection was active when painted
    }
  ]
  baseFabricNote
  renders: [ {id, sourceCombination, flatImage, realisticImage, createdAt} ]
  tryOns: [ {id, renderId, modelPhotoId, resultImage, verdict, note} ]
```

Store images as PNG data, region paths as coordinate lists. Everything is in the coordinate space of that project's drawing body, which is what makes a variant drop back into its own design exactly. Variants belong to their project and are not shared across projects.

Save to local storage or a small database, and support export and import of a whole project as a single file.

---

## 12. Screens

**Studio** — the main screen. Canvas in the centre, body sliders and layers on one side, tools and colour on the other. Region list with variant thumbnails along the bottom.

**Combinations** — grid of many flat combinations, generated locally. Select some to carry forward.

**Render** — chosen combinations shown flat and realistic side by side, with fabric notes editable.

**Fitting** — realistic garments shown worn on model photos, with pass/fail marking.

Use plain language in the interface. "Create part", "Save this version", "Try it on" — name things by what the designer does, not by how the system works.

---

## 13. Build order

Each step should work fully before starting the next.

1. Canvas with layers, brush, eraser, colour, undo.
2. Body template with sliders and guide lines.
3. Region creation, boundary drawing, snapping to guides.
4. Variants: save, list, swap. **Get this feeling instant and reliable — it is the product.**
5. Flat export with body and guides hidden.
6. Try-on with one model photo, end to end through the backend.
7. Fabric notes and realistic rendering.
8. Multiple model photos, verdict marking, combination grid.

Steps 1 to 6 are a complete, demonstrable product. Everything after that is improvement.

---

## 14. Known limits to design around

- Very thin details — narrow straps, thin ties, fine piping — may not survive rendering or try-on. Warn the designer when a region contains mostly thin strokes.
- The realistic render may reinterpret the design. Always keep and show the flat original.
- Model photos where hair covers the shoulders, or arms cross the body, will hide exactly the areas being judged. Choose try-on photos with clear shoulders, arms away from the torso, and a neutral stance.
- This does not replace a real fitting. It replaces the guesswork before the first one.
