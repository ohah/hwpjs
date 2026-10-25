// Shared preview weights, not a claim about Hancom's compound-line internals.
const weights = Object.freeze({ DOUBLE_SLIM: Object.freeze([1, 1]), SLIM_THICK: Object.freeze([1, 2]),
  THICK_SLIM: Object.freeze([2, 1]), SLIM_THICK_SLIM: Object.freeze([1, 2, 1]), DOUBLEWAVE: Object.freeze([1, 1]) });
export const compoundLineWeights = shape => Object.hasOwn(weights, shape) ? weights[shape] : null;
export const compoundLineGap = 2;
