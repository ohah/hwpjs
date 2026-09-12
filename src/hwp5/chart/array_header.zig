const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
pub const Header = struct {
    object_id: u32,
    first_word: u16,
    second_word: u16,
    end: usize,
    /// Explicit selected consumer layout, not a universal capacity/count rule.
    pub fn observedEqualCount(self: Header, max_count: usize) !usize {
        if (self.first_word != self.second_word) return error.UnsupportedChartArrayLayout;
        if (self.first_word > max_count) return error.LimitExceeded;
        return self.first_word;
    }
};

/// Header only; preserves both words without inferring their meaning. Does not
/// consume elements. On failure reader is unchanged; discard both tables.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects) !Header {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtArray\x00", 1);
    const first = try next.readInt(u16);
    try requireType(types, &next, "VtCollection\x00", 1);
    const second = try next.readInt(u16);
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .first_word = first, .second_word = second, .end = next.offset };
}
