import test from "node:test";
import { verifyRangePrefixes } from "./style-preservation/range-prefix-fixture.mjs";

test("Onsaemiro every range paragraph preserves explicit prefix mapping and history", async () => {
  await verifyRangePrefixes("reference/rhwp/samples/[2027] 온새미로 1 본교재.hwp", 104, { normalizeObservedCfb: false });
});
