// Literal expected tiles, independent of the production interval solver.
export const cases = {
  'interval-columns': {
    'insert-row': {
      matrix: [
        ['A', 'A', 'C'],
        ['+A', '+A', '+C'],
        ['D', 'E', 'E'],
        ['G', 'G', 'I'],
      ],
      rowTemplates: [0, 0, 1, 2],
      index: 1,
    },
    'delete-row': {
      matrix: [
        ['D', 'E', 'E'],
        ['G', 'G', 'I'],
      ],
      rowTemplates: [1, 2],
      index: 0,
    },
    'insert-column': {
      matrix: [
        ['A', 'A', 'A', 'C'],
        ['D', '+D', 'E', 'E'],
        ['G', 'G', 'G', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 1,
    },
    'delete-column': {
      matrix: [
        ['A', 'C'],
        ['E', 'E'],
        ['G', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 0,
    },
  },
  'interval-rows': {
    'insert-row': {
      matrix: [
        ['A', 'B', 'C'],
        ['A', '+B', 'C'],
        ['A', 'E', 'C'],
        ['G', 'E', 'I'],
      ],
      rowTemplates: [0, 0, 1, 2],
      index: 1,
    },
    'delete-row': {
      matrix: [
        ['A', 'E', 'C'],
        ['G', 'E', 'I'],
      ],
      rowTemplates: [1, 2],
      index: 0,
    },
    'insert-column': {
      matrix: [
        ['A', '+A', 'B', 'C'],
        ['A', '+A', 'E', 'C'],
        ['G', '+G', 'E', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 1,
    },
    'delete-column': {
      matrix: [
        ['B', 'C'],
        ['E', 'C'],
        ['E', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 0,
    },
  },
};
