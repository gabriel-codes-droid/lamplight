// Hand shapes the game ships with. Empty at first: the game asks you to teach
// it each missing shape in the headset, then shows the line to paste here
// (on the page, under "Export shapes") so judges get your shapes built in.
// Each shape is a list of templates, e.g. { bird: ["0f3c..."], dog: ["..."] }.
// A single string also works. More templates make matching more forgiving.
export const DEFAULT_SHAPES = {};
// Creatures the player added with "Add a shape": { name: { label, icon } }. Their gestures are
// in DEFAULT_SHAPES under the same name. Paste both from the Shapes box on the page.
export const DEFAULT_CUSTOM = {};
