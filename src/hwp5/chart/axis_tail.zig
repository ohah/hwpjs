const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
pub const Tail = struct { prefix: [36]u8, extra: ?[24]u8, suffix: [14]u8, end: usize };
/// Selected raw +6 selector, not an API scale enum. No length fallback.
pub fn readObserved(reader: *Reader, types: *Types, selector: u16) !Tail {
    if (selector > 1) return error.UnsupportedChartAxisTailLayout;
    var next = reader.*;
    const prefix = (try next.take(36))[0..36].*;
    const extra = if (selector == 1) (try next.take(24))[0..24].* else null;
    const suffix = (try next.take(14))[0..14].*;
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .prefix = prefix, .extra = extra, .suffix = suffix, .end = next.offset };
}
