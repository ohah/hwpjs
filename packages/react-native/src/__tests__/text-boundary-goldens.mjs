export const boundaryCases = [
  { name: 'Latin', text: 'abc', cuts: [0, 1, 2, 3] },
  { name: '한글', text: '한글', cuts: [0, 1, 2] },
  { name: '한글 조합', text: '한', cuts: [0, 3] },
  { name: 'surrogate', text: 'A😀B', cuts: [0, 1, 3, 4] },
  { name: 'ZWJ', text: '👩‍💻', cuts: [0, 5] },
  { name: '가족 ZWJ', text: '👨‍👩‍👧‍👦', cuts: [0, 11] },
  { name: 'flags', text: '🇰🇷🇺🇸', cuts: [0, 4, 8] },
  { name: 'combining', text: 'áb', cuts: [0, 2, 3] },
  { name: 'CRLF', text: 'A\r\nB', cuts: [0, 1, 3, 4] },
  { name: '피부색', text: '👍🏽', cuts: [0, 4] },
];
