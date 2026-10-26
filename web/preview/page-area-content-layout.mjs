import { composePageAreaBody } from './page-area-body-composition.mjs';

/** Compatibility entrypoint; composition and validation have one owner. */
export function layoutPageAreaContent(content, measure, maxRows, layoutBody, pageNumbers) {
  return composePageAreaBody(content, measure, maxRows, layoutBody, { pageNumbers });
}
