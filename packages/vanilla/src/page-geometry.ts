/** Visible measured ordinal/count; never source numbering or a caret page. */
export interface CanvasPageStatus {
  readonly current: number | null;
  readonly total: number | null;
  readonly partial: boolean;
}

/** Read-only projection of the currently painted page, in CSS pixels at scale 1. */
export interface CanvasPageGeometry {
  readonly current: number;
  readonly partial: boolean;
  readonly paper: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly page: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly scale: number;
  /** Screen coordinates share the Surface stage and scroll viewport. */
  readonly paperLeft: number;
  readonly viewportLeft: number;
  readonly viewportWidth: number;
}

export function projectPageGeometry(
  page: Pick<CanvasPageGeometry, 'paper' | 'page'> | undefined,
  current: number,
  partial: boolean,
  scale: number,
  stageLeft: number,
  viewportLeft: number,
  viewportWidth: number,
): CanvasPageGeometry | null {
  if (!page || !Number.isSafeInteger(current) || current < 1) return null;
  const { paper, page: body } = page;
  if (
    !paper ||
    !body ||
    ![
      paper.x,
      paper.y,
      paper.width,
      paper.height,
      body.x,
      body.y,
      body.width,
      body.height,
      scale,
      stageLeft,
      viewportLeft,
      viewportWidth,
      stageLeft + paper.x * scale,
      paper.x + paper.width,
      paper.y + paper.height,
      body.x + body.width,
      body.y + body.height,
    ].every(Number.isFinite) ||
    Math.min(paper.width, paper.height, body.width, body.height, scale, viewportWidth) <= 0 ||
    body.x < paper.x ||
    body.y < paper.y ||
    body.x + body.width > paper.x + paper.width + 1e-6 ||
    body.y + body.height > paper.y + paper.height + 1e-6
  )
    return null;
  return Object.freeze({
    current,
    partial,
    paper: Object.freeze({ ...paper }),
    page: Object.freeze({ ...body }),
    scale,
    paperLeft: stageLeft + paper.x * scale,
    viewportLeft,
    viewportWidth,
  });
}
