export interface CatalogEntry {
  name: string;
  rle: string;
}

export const PATTERNS: CatalogEntry[] = [
  { name: 'Glider', rle: 'x = 3, y = 3, rule = B3/S23\nbob$2bo$3o!' },
  { name: 'LWSS', rle: 'x = 5, y = 4, rule = B3/S23\nbo2bo$o4b$o3bo$4o!' },
  {
    name: 'MWSS',
    rle: 'x = 6, y = 5, rule = B3/S23\n3bo2b$bo3bo$o5b$o4bo$5o!',
  },
  {
    name: 'Gosper gun',
    rle:
      'x = 36, y = 9, rule = B3/S23\n24bo11b$22bobo11b$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o14b$2o8b' +
      'o3bob2o4bobo11b$10bo5bo7bo11b$11bo3bo20b$12b2o!',
  },
  {
    name: 'Pulsar',
    rle:
      'x = 13, y = 13, rule = B3/S23\n2b3o3b3o2b$11b$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b$11b$2b3o3b3o' +
      '2b$o4bobo4bo$o4bobo4bo$o4bobo4bo$11b$2b3o3b3o2b!',
  },
  { name: 'Pentadecathlon', rle: 'x = 10, y = 3, rule = B3/S23\n2bo4bo2b$2ob4ob2o$2bo4bo2b!' },
  { name: 'Acorn', rle: 'x = 7, y = 3, rule = B3/S23\nbo5b$3bo3b$2o2b3o!' },
  { name: 'R-pentomino', rle: 'x = 3, y = 3, rule = B3/S23\nb2o$2ob$bo!' },
  { name: 'Diehard', rle: 'x = 8, y = 3, rule = B3/S23\n6bob$2o6b$bo3b3o!' },
  {
    name: 'Spacefiller',
    rle:
      'x = 27, y = 21, rule = B3/S23\n13bo13b$12bobo12b$11bo3bo11b$10b2o3b2o10b$9bo7bo9b$8bobo5bobo8b$7bo3bo' +
      '3bo3bo7b$6b2o3b2ob2o3b2o6b$5bo7bobo7bo5b$4bobo5bo3bo5bobo4b$3bo3bo3b2o3b2o3bo3bo3b$2b2o3b2o' +
      '11b2o3b2o2b$bo7bo11bo7bob$obo5bobo9bobo5bobo$o3bo3bo11bo3bo3bo$2o3b2o13b2o3b2o$25b$4b2o17b2o' +
      '4b$3bobo17bobo3b$4bo19bo4b$25b!',
  },
];
