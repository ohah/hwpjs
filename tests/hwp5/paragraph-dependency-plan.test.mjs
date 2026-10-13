import test from "node:test";
import assert from "node:assert/strict";
import { planParagraphDependencies } from "../../web/preview/paragraph-dependency-plan.mjs";

test("late sparse window retains transitive owner identities without filling a huge gap", () => {
  const dependencies = new Map([[50000, [19999]], [19999, [0]], [50001, [19999]], [0, [19999]]]);
  const before = [...dependencies].map(([key, values]) => [key, [...values]]);
  assert.deepEqual(planParagraphDependencies({ total: 53448, offset: 50000, count: 2, dependencies, maxParagraphs: 4 }), { requestedOffset: 50000, requestedCount: 2, ordinals: [0, 19999, 50000, 50001] });
  assert.deepEqual([...dependencies], before);
  assert.throws(() => planParagraphDependencies({ total: 53448, offset: 50000, count: 2, dependencies, maxParagraphs: 3 }), /ParagraphWindowBudgetExceeded/);
  assert.deepEqual(planParagraphDependencies({ total: 53448, offset: 53448, count: 0, dependencies, maxParagraphs: 0 }).ordinals, []);
});

test("sparse dependency planning rejects invalid and duplicate identities even outside selection", () => {
  const request = { total: 10, offset: 5, count: 2, dependencies: new Map(), maxParagraphs: 4 };
  for (const key of ["total", "offset", "count", "maxParagraphs"]) for (const value of [-1, 1.5, NaN, Infinity, null, "2", Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => planParagraphDependencies({ ...request, [key]: value }), /InvalidParagraphWindow/);
  for (const dependencies of [new Map([[10, []]]), new Map([[0, [10]]]), new Map([[0, [1, 1]]]), new Map([[0, null]])]) assert.throws(() => planParagraphDependencies({ ...request, dependencies }), /InvalidParagraphDependencies/);
  assert.throws(() => planParagraphDependencies({ ...request, offset: 9 }), /InvalidParagraphWindow/);
  assert.throws(() => planParagraphDependencies({ ...request, dependencies: {} }), /InvalidParagraphWindow/);
  assert.throws(() => planParagraphDependencies({ ...request, count: 5 }), /ParagraphWindowBudgetExceeded/);
});
