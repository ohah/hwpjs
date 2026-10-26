import test from "node:test";
import { createdBodyNoteCase } from "../canvas/created-body-note-case.mjs";
test("HWPX generated body and four note tables share pages and history", (t) =>
  createdBodyNoteCase(t, "hwpx"));
