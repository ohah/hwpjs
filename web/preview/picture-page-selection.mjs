// Page and column scope is shared by reservation advancement and text fragments.
export function selectPicturePageReservations(line, pageOrdinal, reservations) {
  if (
    !line ||
    ![line.x, line.width, line.x + line.width].every(Number.isFinite) ||
    line.width < 0 ||
    !Number.isSafeInteger(pageOrdinal) ||
    pageOrdinal < 0 ||
    !Array.isArray(reservations)
  )
    return null;
  if (
    reservations.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        (item.columnBox !== undefined &&
          (!item.columnBox ||
            ![
              item.columnBox.x,
              item.columnBox.width,
              item.columnBox.x + item.columnBox.width,
            ].every(Number.isFinite) ||
            item.columnBox.width <= 0)),
    )
  )
    return null;
  return reservations.filter(
    (item) =>
      item.pageOrdinal === pageOrdinal &&
      (!item.columnBox ||
        (line.x < item.columnBox.x + item.columnBox.width &&
          line.x + line.width > item.columnBox.x)),
  );
}
