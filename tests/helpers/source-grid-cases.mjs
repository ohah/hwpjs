export const cases = {
  vertical: {
    'insert-row': {
      matrix: [
        ['A', 'B', 'C'],
        ['A', '+B', '+C'],
        ['A', 'E', 'F'],
        ['G', 'H', 'I'],
      ],
      rowTemplates: [0, 0, 1, 2],
      index: 1,
    },
    'delete-row': {
      matrix: [
        ['A', 'E', 'F'],
        ['G', 'H', 'I'],
      ],
      rowTemplates: [1, 2],
      index: 0,
    },
    'insert-column': {
      matrix: [
        ['A', '+A', 'B', 'C'],
        ['A', '+A', 'E', 'F'],
        ['G', '+G', 'H', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 1,
    },
    'delete-column': {
      matrix: [
        ['B', 'C'],
        ['E', 'F'],
        ['H', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 0,
    },
  },
  horizontal: {
    'insert-row': {
      matrix: [
        ['A', 'A', 'C'],
        ['+A', '+A', '+C'],
        ['D', 'E', 'F'],
        ['G', 'H', 'I'],
      ],
      rowTemplates: [0, 0, 1, 2],
      index: 1,
    },
    'delete-row': {
      matrix: [
        ['D', 'E', 'F'],
        ['G', 'H', 'I'],
      ],
      rowTemplates: [1, 2],
      index: 0,
    },
    'insert-column': {
      matrix: [
        ['A', 'A', 'A', 'C'],
        ['D', '+D', 'E', 'F'],
        ['G', '+G', 'H', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 1,
    },
    'delete-column': {
      matrix: [
        ['A', 'C'],
        ['E', 'F'],
        ['H', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 0,
    },
  },
  nested: {
    'insert-row': {
      matrix: [
        ['A', 'B', 'C'],
        ['+A', '+B', '+C'],
        ['D', 'E', 'F'],
        ['G', 'H', 'I'],
      ],
      rowTemplates: [0, 0, 1, 2],
      index: 1,
    },
    'delete-row': {
      matrix: [
        ['D', 'E', 'F'],
        ['G', 'H', 'I'],
      ],
      rowTemplates: [1, 2],
      index: 0,
    },
    'insert-column': {
      matrix: [
        ['A', '+A', 'B', 'C'],
        ['D', '+D', 'E', 'F'],
        ['G', '+G', 'H', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 1,
    },
    'delete-column': {
      matrix: [
        ['B', 'C'],
        ['E', 'F'],
        ['H', 'I'],
      ],
      rowTemplates: [0, 1, 2],
      index: 0,
    },
  },
};
