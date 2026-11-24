---
version: 1
slug: "src-renderer-app-tsx"
primary_target: "src/renderer/App.tsx"
related_targets: ["src/renderer/components","src/renderer/styles"]
---

# Surface: converter main window

Scope: the single main window (src/renderer/App.tsx and src/renderer/components/**, styles in src/renderer/styles/**). Mode: Operate.

Audience and job: public users (often gamers/creators) with large recordings; drop files, check what will happen, Convert, walk away, come back. Owner brief, binding: "as simple and as detailed as possible" — every fact visible, one obvious path (add → check → Convert), few control types.

Constraints: logic files untouched (state hooks/store, main, shared, preload); components stay presentational; app name is a placeholder ("File Converter") until the owner chooses a pop-culture name; keyboard: Ctrl+O, Ctrl+Enter, Delete, Ctrl+A, Esc; follows OS light/dark; reduced motion respected; future audio/image files must fit the same row grammar.

## Direction contract

THESIS: Every file is a journey on a published route. Before anything runs, each row draws its plan as one transit line: origin station (what the file is), interchange stations (what will be done to it), terminus (what it becomes). It refuses the category default of a rounded card per file with grey spec chips and a generic blue progress bar.

OWN-WORLD: Midnight-enamel ground (#0B1230) with a second, lighter enamel layer for the settings panel; porcelain ink; scarlet, cobalt, amber and green line inks colour each route by output container (MP4 scarlet, MKV cobalt, MOV amber, WebM green); porcelain station ticks and white-ringed interchange circles; thin porcelain-outlined panels and inputs with small radii; Barlow Semi Condensed in tracked capitals for section heads, labels and station names, Barlow for data and copy, tabular figures. Light theme is the same map printed on porcelain with midnight ink.

STORY: The visitor drops files and reads each route left to right: what it is now, each step the converter will take, what it becomes, plus any service notice (HDR switched, VFR kept, copy not possible). They press Convert and watch a marker travel each line; finished routes offer Play and Show in folder, failed ones show the plain-language reason with the raw log one click away.

FIRST VIEWPORT: Header 56px: wordmark left, outlined Add files / Add folder right. Body: route list fills the left; settings panel 360px on the right in condensed-caps sections (Preset, Format, Video, Audio, Output, Advanced collapsed). Footer 76px: an overall line with one station per file in the run, filled as each finishes, plus count and ETA; the primary scarlet "Convert N files" button sits far right. Empty state: one three-station explainer route (your file → match source → MP4) centred, with Add files / Add folder.

FORM: Midnight Line Map — dealt challenger (catalog wayfinding-cartography-signage-midnight-transit-diagram), chosen by the user over the assigned direction; seed:0d4ac5fe519a9fe4. Signature interaction: the marker advancing along each route as ffmpeg reports progress, travelled segment at full ink, untravelled at reduced ink. Motion grammar: state changes 180ms ease-out; the marker moves linearly with progress; reduced motion removes transitions and keeps positions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Product name (owner to choose; pop-culture and relevant; trademark check before release).
