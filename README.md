# Lamplight

A seated, hands-only shadow-puppet story for Meta Quest (WebXR, three.js).

A lamp glows behind you and throws your hands onto a paper wall. Each scene shows a
problem, never the answer: "A wolf blocks the path." "A wall stands before home." You
decide which creature (bird, dog or rabbit) can solve it, and make that shape with your
hands. The game scores your hands against all three shapes at once, and whichever passes
comes alive. Pick wrongly and that creature reacts for three seconds (the rabbit sees the
wolf and bolts, the dog jumps in the river and paddles back, the bird pecks at the wall and
gives up) and the same scene is offered again. The last four scenes are two pairs that
need two creatures in a row: the bird fetches the rope, then the dog pulls it; the bird
fetches the key, then the rabbit digs under the gate. There are ten scenes, and a first
playthrough takes about four minutes. No controllers, no menus, no build step.

Made for the Meta VR Start Developer Competition.

## Controls

There are none. Sit down, put the controllers away and use your hands.

- **Title:** hold both hands up. The story starts once both are tracked.
- **Each scene:** read the problem, make the shape of the creature you think solves it
  and hold it for about half a second. Tilting your hands up to 20 degrees either way is
  fine. There is no hint in normal play. After 30 seconds without a correct answer the
  target shape and its gesture icon appear, and matching gets a little easier every 10
  seconds after that.
- **Hands out of view:** the game pauses its timers and asks you to bring them
  back.
- **No headset (desktop preview):** press Space to pass a step, or **1**, **2**, **3** to
  bring a bird, dog or rabbit to life (a wrong one plays its reaction).

Hand tracking must be on in the Quest settings. If the session has none, the
wall says so.

## Run it

WebXR needs HTTPS or localhost.

- **Quickest:** open the GitHub Pages link in the Quest Browser and press
  "Enter VR".
- **Local:** in this folder run `python -m http.server 8080`, connect the Quest
  by USB, run `adb reverse tcp:8080 tcp:8080`, and open `http://localhost:8080`
  on the Quest.
- **Desktop:** the same local server, in any browser, to preview the story with
  Space, or to replay a capture (see below).

Everything is plain ES modules; three.js comes from a CDN through an import map
in `index.html`. There is nothing to install or build.

## Record the shapes

The game ships with no shapes: they have to be made on a real headset, because
that is the only way to get genuine hand data.

1. Open the game on the Quest. On first run it asks for a bird, a dog and a
   rabbit: make the shape, hold still about 2.5 seconds. They are saved on that
   headset (localStorage), and the story starts.
2. Open "Export shapes" on the page (desktop browser, or the Quest Browser
   before entering VR), copy the text, and paste it over the contents of
   `shapes.js`.
3. Commit and push. Everyone who opens the game now gets your shapes.

A shape can have several templates, and the best match wins, so recording two or
three variations of each (different sizes, one hand versus two) makes the game
more forgiving. Tilts of up to 20 degrees are handled automatically.

| Add to the URL    | What it does |
| ----------------- | ------------ |
| `?record`         | Re-teach every shape, replacing the saved ones. `?record=bird,dog` re-teaches only those. |
| `?add`            | Teach one more template for every shape, keeping the old ones. `?add=rabbit` does one shape. |
| `?th=0.5`         | Matching threshold. Lower is easier, higher is stricter (default 0.55). |
| `?start=4`        | Start at scene 4 instead of scene 1. |
| `?debug`          | Show the phase, target, match score and frame rate on the page. |

## Tune matching without a headset

Record your hands once, then replay them on a desktop as often as you like.

1. Open `?capture` in the headset and play. The hand joints (about 30 samples a
   second, roughly 1 MB a minute) are recorded for the whole VR session, and the
   file downloads when you leave VR. There is also a "Download capture" button
   on the page.
2. Put the file in a `captures/` folder next to `index.html`. Capture files are
   git-ignored by default.
3. On a desktop, serve the folder and open
   `http://localhost:8080/?replay=captures/yourfile.json`. The hands play back
   through exactly the same code as live tracking and the page shows the live
   match score and best tilt angle.

To test one shape directly, use `?start=` to jump to its scene, for example
`?replay=captures/dog.json&start=2&th=0.5`. Scenes are numbered in `SCENES` order:
1 river (bird), 2 wolf (dog), 3 pines (bird), 4 sheep (dog), 5 gate (rabbit),
6 wall (rabbit). The replay starts at the title scene and needs both hands in
view for a second, like a live session.

## Files

- `index.html`: the page and the import map
- `main.js`: room, lamp, hand tracking, shapes storage, the main loop
- `theatre.js`: game flow, story scenes and all drawing (edit `SCENES` to add
  scenes)
- `matcher.js`: silhouette matching, with tilted and multiple templates
- `shadow.js`: projects hand joints from the lamp onto the wall
- `audio.js`: night ambience, chime and creature sounds, all synthesised
- `capture.js`: `?capture` recorder and `?replay` player
- `icons.js`: the gesture icons. They use the hand illustrations from the Meta UI kit
  (`assets/hands/`), with hand-tracking skeleton icons as a fallback
- `outline.js`: traces a recorded shape into a smooth outline for the hint
- `shapes.js`: the built-in hand shapes (paste your exported shapes here)

## Notes on performance

Tuned for a steady 72 fps on Quest 3. The wall canvas is repainted and
re-uploaded to the GPU only when something on it changed (idle repaints are
around 20 a second instead of 72), the per-frame code reuses its buffers instead
of allocating, and the session asks the headset for a 72 Hz target frame rate.

## License

MIT, see `LICENSE`.
