# Lamplight

A seated, hands-only shadow-puppet game for Meta Quest (WebXR, three.js).

## Run it on a Quest

WebXR needs HTTPS or localhost.

- **Quickest:** push this folder to a GitHub repo, turn on GitHub Pages, open the
  link in the Quest browser, press "Enter VR".
- **Local:** in this folder run `python -m http.server 8080`, connect the Quest by
  USB, run `adb reverse tcp:8080 tcp:8080`, open `http://localhost:8080` on the Quest.

## First run: teach the three shapes

The game ships with no shapes. On first run it asks you to teach it a bird, a dog
and a rabbit: make the shape, hold still about 2.5 seconds. They are saved on that
headset. Then the story starts.

To ship them to everyone: open "Export shapes" on the page, copy the line, and
paste it over the contents of `shapes.js`.

- `?record` re-teaches all shapes.
- `?th=0.5` makes matching easier (default 0.55, higher is stricter).

## Files

- `main.js`: room, lamp, hand tracking, shadow projection
- `theatre.js`: game flow, story scenes and all drawing (edit `SCENES` to add levels)
- `matcher.js`: silhouette matching
- `shapes.js`: built-in hand shapes
