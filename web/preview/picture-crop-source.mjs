// Select an explicit display basis without rewriting stored image dimensions.
export function pictureCropSourceOptions(crop) {
  if (!Array.isArray(crop?.imageDimensions) || crop.imageDimensions.length !== 2) throw new Error("InvalidPictureCropReference");
  if (!Array.from(crop.imageDimensions).every(value => value === null || Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) throw new Error("InvalidPictureCropReference");
  const [referenceWidth, referenceHeight] = crop.imageDimensions;
  if (referenceWidth === 0 && referenceHeight === 0 && crop.zeroSizeUnitsPerPixel === 75) return { unitsPerPixel: 75 };
  return referenceWidth !== null || referenceHeight !== null ? { referenceWidth, referenceHeight } : { unitsPerPixel: 75 };
}
