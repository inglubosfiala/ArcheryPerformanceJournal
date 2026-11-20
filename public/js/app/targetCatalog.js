// Circular paper target definitions. Radii are normalized to the printed scoring face.
// Keep geometry, colours, scoring and camera capability independent for future detector adapters.
// Sources and intentionally excluded round-level rules: specs/target-faces.md.
export const TARGET_FAMILIES = {
  'wa-target': 'WA Target',
  'wa-field': 'WA Field',
  'ifaa-field': 'IFAA Field',
  'ifaa-hunter': 'IFAA Hunter',
  'ifaa-expert': 'IFAA Expert Field',
  'ifaa-indoor': 'IFAA Indoor',
  'ifaa-flint': 'IFAA Flint',
};
export const TARGET_COLOURS = {
  gold: '#FFE11A',
  red: '#D22B2B',
  blue: '#00A2E8',
  black: '#1A1A1A',
  white: '#FFFFFF',
  teal: '#147D92',
  navy: '#041E42',
};
export const TARGET_LAYOUTS = {
  single: [[0, 0]],
  triple: [
    [0, -220],
    [0, 0],
    [0, 220],
  ],
  double: [
    [-110, 0],
    [110, 0],
  ],
  four: [
    [-110, -110],
    [110, -110],
    [-110, 110],
    [110, 110],
  ],
  five: [
    [-220, -220],
    [220, -220],
    [0, 0],
    [-220, 220],
    [220, 220],
  ],
};
const zones = (edges, values) => edges.map((edge, i) => ({ edge, value: values[i] }));
const bands = (edges, colours) => edges.map((edge, i) => ({ edge, zone: colours[i] }));
const fieldEdges = [0.2, 0.6, 1];
export const SCORING_PROFILES = {
  'wa-field': { zones: zones([0.1, 0.2, 0.4, 0.6, 0.8, 1], [6, 5, 4, 3, 2, 1]), max: 6, boundary: 'inner' },
  'ifaa-field': { zones: zones(fieldEdges, [5, 4, 3]), max: 5, boundary: 'outer' },
  'ifaa-hunter': { zones: zones(fieldEdges, [5, 4, 3]), max: 5, boundary: 'outer' },
  'ifaa-expert': {
    zones: zones([0.1, 0.2, 0.4, 0.6, 0.8, 1], ['X', 5, 4, 3, 2, 1]),
    max: 5,
    xValue: 5,
    boundary: 'outer',
  },
  'ifaa-indoor': {
    zones: zones([0.1, 0.2, 0.4, 0.6, 0.8, 1], ['X', 5, 4, 3, 2, 1]),
    max: 5,
    xValue: 5,
    boundary: 'outer',
  },
  'ifaa-five': { zones: zones([0.5, 1], [5, 4]), max: 5, boundary: 'outer' },
  'ifaa-flint-centre': { zones: zones([1 / 3, 1], [5, 4]), max: 5, boundary: 'outer' },
};
export const EXTRA_FACES = {};
function add(family, size, layout, variant, profile, colourBands) {
  const kind = `${family}-${variant}-${layout}`;
  const id = `${kind}-${size}`;
  EXTRA_FACES[id] = {
    family,
    size,
    kind,
    layout,
    variant,
    profile,
    label: `${TARGET_FAMILIES[family]} ${size} cm · ${variant} · ${layout === 'five' ? 'five-spot' : layout}`,
    setup: true,
    camera: 'experimental',
    ...(layout === 'single' ? {} : { spots: TARGET_LAYOUTS[layout] }),
    bands: colourBands,
  };
}
for (const size of [20, 40, 60, 80]) {
  const layouts =
    size === 20
      ? ['single', 'triple']
      : size === 40
        ? ['single', 'four']
        : size === 60
          ? ['single', 'double']
          : ['single'];
  for (const variant of ['black', 'teal'])
    for (const layout of layouts) {
      add('wa-field', size, layout, variant, 'wa-field', bands([0.2, 1], ['gold', variant]));
    }
}
for (const family of ['ifaa-field', 'ifaa-hunter', 'ifaa-expert']) {
  for (const size of [20, 35, 50, 65])
    for (const layout of size === 20 ? ['single', 'four'] : ['single']) {
      add(
        family,
        size,
        layout,
        'standard',
        family,
        family === 'ifaa-hunter'
          ? bands([0.2, 1], ['white', 'black'])
          : bands(fieldEdges, ['black', 'white', 'black']),
      );
    }
}
add('ifaa-indoor', 40, 'single', 'blue', 'ifaa-indoor', bands([0.2, 1], ['white', 'navy']));
add('ifaa-indoor', 16, 'five', 'blue', 'ifaa-five', bands([0.5, 1], ['white', 'navy']));
for (const size of [20, 35, 50])
  for (const layout of size === 20 ? ['single', 'four'] : ['single']) {
    add('ifaa-flint', size, layout, 'field', 'ifaa-field', bands(fieldEdges, ['black', 'white', 'black']));
  }
add('ifaa-flint', 21, 'four', 'centre', 'ifaa-flint-centre', bands([1 / 3, 1], ['black', 'white']));
