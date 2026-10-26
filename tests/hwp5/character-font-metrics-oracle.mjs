/** Independent fixed source offsets, deliberately not the product projection. */
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
export function expectedCharacterFontMetrics(bytes) {
  const source = inspect(bytes);
  return records(source.decode(source.streams.get("DocInfo")))
    .filter((row) => row.tag === 21)
    .map((row, id) => ({
      id,
      values: Object.fromEntries(
        ["ratio", "spacing", "relativeSize", "offset"].map((key, field) => [
          key,
          Array.from({ length: 7 }, (_, i) =>
            field === 1 || field === 3
              ? row.payload.readInt8(14 + field * 7 + i)
              : row.payload.readUInt8(14 + field * 7 + i),
          ),
        ]),
      ),
    }));
}
