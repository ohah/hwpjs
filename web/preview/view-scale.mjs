// Presentation policy only; native document units and styles never change.
export const VIEW_SCALES = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
export const isViewScale = value => VIEW_SCALES.includes(value);
