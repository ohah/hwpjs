// Generated cell namespace is disjoint from native source paragraph indices.
export const sameCreatedCell = (a, b) =>
  Boolean(
    a?.createdCell &&
    b?.createdCell &&
    a.section === b.section &&
    a.createdCell.identity === b.createdCell.identity &&
    a.createdCell.row === b.createdCell.row &&
    a.createdCell.column === b.createdCell.column,
  );
