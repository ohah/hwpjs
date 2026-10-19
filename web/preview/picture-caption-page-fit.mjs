/** Caption/image frame must fit the paper; never resize the source object. */
export function pictureCaptionPageFit(reservation, page) {
  const frame = reservation?.flowRectangle;
  if (!frame) return { state: "fits" };
  return pictureFramePaperFit(frame, page?.paper);
}

export function pictureFramePaperFit(frame, paper) {
  const valid = box => box && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
    && box.width > 0 && box.height > 0;
  if (!valid(frame) || !valid(paper) || frame.x < paper.x - 1e-8 || frame.x + frame.width > paper.x + paper.width + 1e-8
    || frame.y < paper.y - 1e-8 || frame.height > paper.height + 1e-8) return { state: "unavailable", error: "PictureCaptionPageOverflow" };
  return { state: frame.y + frame.height > paper.y + paper.height + 1e-8 ? "advance" : "fits" };
}
