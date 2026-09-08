const Reader = @import("../../binary/reader.zig").Reader;
pub const Segment = struct {
    raw: []const u8,
    stuffed_bytes: usize,
    /// Entropy bytes after removing stuffed zeros; not pixels or coefficients.
    coded_bytes: usize,
};
/// Scans to a marker without consuming its FF prefix/fill bytes.
/// Caller owns scan/restart/DNL/TEM semantics and when to resume entropy mode.
/// A terminating marker is required; errors preserve the supplied cursor.
pub fn takeUntilMarker(reader: *Reader, max_bytes: usize) !Segment {
    var r = reader.*;
    const start = r.offset;
    var stuffed: usize = 0;
    while (true) {
        const at = r.offset;
        const byte = try r.readInt(u8);
        if (byte == 0xff) {
            var code = try r.readInt(u8);
            var fill: usize = 0;
            while (code == 0xff) {
                fill += 1;
                code = try r.readInt(u8);
            }
            if (code != 0) {
                const raw = r.bytes[start..at];
                reader.offset = at;
                return .{ .raw = raw, .stuffed_bytes = stuffed, .coded_bytes = raw.len - stuffed };
            }
            if (fill != 0) return error.InvalidJpegStuffing;
            stuffed += 1;
        }
        if (r.offset - start > max_bytes) return error.LimitExceeded;
    }
}
