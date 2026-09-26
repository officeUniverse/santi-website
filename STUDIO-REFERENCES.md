# Santi creative playground

Dependency-free adaptations of the user-supplied references. The Websites number experiment includes digit masks and pattern gradients adapted directly from cobra_winfrey’s source; the other interactions are original adaptations. Keep these credits with the project.

## Design
- Michael Schwartz / michaelsboost — HTML5 Canvas Whiteboard (Touch and Mouse): https://codepen.io/michaelsboost/pen/kQmwyq
  Inspected mouse/touch stroke handling. Adaptation uses scoped Pointer Events and capture, with keyboard drawing, undo and PNG export.
- Yasunobu Ikeda / clockmaker — Drawing with CSS3 mix-blend-mode: https://codepen.io/clockmaker/pen/vNyjxa
  Inspected layered trails, particles, colour blending and resize logic. Adaptation uses screen-composited light ribbons drawn on demand; no PIXI/EaselJS dependency or permanent animation loop.
- tucsky — The Gooey Effect: https://codepen.io/tucsky/pen/zvRzBO
  Inspected paint controls and blur/alpha SVG filter approach. Adaptation blurs and thresholds a canvas layer so liquid paint is included in PNG exports. Different brushes can coexist on one canvas.

## Websites
- ol-ivier — WebGL Concave Gallery: https://codepen.io/ol-ivier/pen/emdjmBQ
  Inspected image list, wrapping offsets, drag velocity, inertia and concave geometry parameters. Adaptation uses CSS perspective cards in a repeating draggable grid, with zoom and arrow buttons. It approximates the depth effect without the original WebGL shader. Case-study links below the gallery provide accessible navigation. Dragging a tile does not open its link; clicking does. No scroll wheel hijacking.

## AI / generative artwork
- cobra_winfrey — Procedurally Generated CSS Numbers: https://codepen.io/cobra_winfrey/pen/xvjbYy
  Inspected input, random cells, palette and orientation selection. Adaptation creates seeded geometric digit patterns with 1–3 numbers.
- soju22 — Simple Mandala drawing app: https://codepen.io/soju22/pen/gEYJoO
  Inspected radial repeats, mirrored SVG paths, strokes and undo. Adaptation combines mirrored canvas strokes with generated numbers, adjustable symmetry and PNG export.

The AI artwork is explicitly labelled generative code. It does not pretend to be a model response. The existing chat remains available in a disclosure below the artwork and still requires a configured provider, as described in api/STUDIO-CHAT.md.

## Adding a case study to the website showcase

> **v3:** case-study pages are now generated. Edit `content/case-studies/<slug>.json`, run `python3 scripts/build-site.py`, then `python3 scripts/sync-case-studies.py` — see AGENTS.md. The manual steps below describe the v2 workflow.

1. Create a project-*.html page with CreativeWork JSON-LD, including about.name.
2. Add real local case-study images under assets/imgs/projects/<project>/ and reference them in that page's img elements.
3. Run `python3 scripts/sync-case-studies.py` from the project root. This regenerates assets/js/case-studies.js, including new case studies and their images.
4. Add the case study to portfolio.html and the homepage Selected Work carousel.
5. Add its canonical URL to sitemap.xml.
6. Check every generated image path and project link. Do not use template placeholders as real client work.

The gallery repeats its image set to fill the space. It works from local files because the data is a JavaScript asset, not a fetch request. The original project pages are the source for names, links and image paths.

Drawing is bounded to 60 Design strokes / 50 mandala strokes, 800 points per stroke. Pointer and keyboard controls share the same path model. Resizing preserves artwork because the canvas uses fixed logical coordinates. PNG exports include the rendered liquid effect. Inertia stops for reduced motion, hidden tabs and background pages.

## Latest refinements

Design now offers eight brushes: light ribbons, classic ink, gooey paint, neon glow, dotted line, spray paint, calligraphy and rainbow trail. Undo and PNG export apply to all of them.

Following user feedback, the Websites gallery now uses flat, evenly spaced tiles. The perspective deformation, heavy shadows and edge-gradient overlays were removed. Full images are fitted into their tiles, with project names in separate caption bars.

The AI panel now contains only generated number tiles and decorative radial patterns. Freehand and keyboard strokes, stroke undo, and clear-drawing controls were removed from this panel. Number, colour, symmetry, variation and PNG export remain. Earlier descriptions of mandala drawing above document the original reference direction, not the current interaction.

## Current Websites tab

At the user’s request, the Websites tab now runs locally using HTML in index.html, assets/css/studio-numbers.css and assets/js/studio-numbers.js. Digit masks and ten cell-pattern gradients are adapted from cobra_winfrey’s Procedurally Generated CSS Numbers: https://codepen.io/cobra_winfrey/pen/xvjbYy . Native JavaScript replaces jQuery. The layout is scoped and responsive, with one-to-three-digit input, reset, pattern regeneration and reduced-motion support. No iframe or CodePen connection is needed. The previous gallery maintenance instructions above are historical.

## Current tab arrangement — 11 September 2026

The local CSS number experiment has moved from Websites to AI, replacing the previous radial canvas artwork. Existing AI chat remains below it.

Websites now uses assets/js/studio-gallery.js: a dependency-free repeating concave image gallery inspired by ol-ivier’s reference. It uses Canvas 2D mesh distortion rather than the reference’s WebGL renderer so local-file images can be drawn without WebGL texture-origin restrictions. Drag, arrow-key navigation, zoom and reset are scoped to the gallery. Controls and case-study links are outside the image area; page scrolling is preserved. Reduced motion removes distortion, and rendering happens only when something changes. No iframe or remote runtime is used. Images come from assets/js/case-studies.js; the case-study synchronisation workflow above is active again.

Gallery images now open their matching case study on click or tap. Hit detection follows the rendered mesh; gaps do not navigate. A six-pixel gesture threshold separates dragging from clicking, and cancelled gestures never navigate. The links below remain available for keyboard navigation.

The AI chat disclosure and its question form were removed from the homepage at the user’s request. The AI tab now contains only the orange number experiment.

The AI circles now support click/tap shooting with local circle collisions, gravity and floor/wall bounces (assets/js/studio-number-physics.js). Arrow keys aim and Space/Enter fire. Rebuild circles restarts play; Reset returns to number entry. Projectiles are capped at six, animation pauses in hidden tabs and stops after twelve seconds of inactivity.
