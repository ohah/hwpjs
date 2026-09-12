const Reader = @import("../../binary/reader.zig").Reader;
const Table = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const fonts = @import("font.zig");
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
pub const Options = struct {
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 131070,
};
pub const Block = struct {
    object_id: u32,
    prefix: [12]u8,
    font: fonts.Font,
    middle: [24]u8,
    text: strings.String,
    suffix: [26]u8,
    end: usize,
};

/// Explicit observed v2 block with a null auxiliary reference. String bytes
/// borrow input; raw fields are copied. Failure preserves reader, NOT table.
pub fn readObservedV2(reader: *Reader, table: *Table, options: Options) !Block {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try requireType(table, &next, "VtTextBlock\x00", 2);
    const prefix = (try next.take(12))[0..12].*;
    if (try next.readInt(u32) != 0xffffffff) return error.UnsupportedChartTextReference;
    const font = try fonts.readObservedV1(&next, table, @min(options.max_string_bytes, options.max_total_string_bytes));
    const middle = (try next.take(24))[0..24].*;
    const text = try strings.readObservedV1(&next, table, @min(options.max_string_bytes, options.max_total_string_bytes - font.name.bytes.len));
    try ids.requireUnique(&.{ id, font.object_id, font.name.object_id, text.object_id });
    const suffix = (try next.take(26))[0..26].*;
    try requireType(table, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .object_id = id, .prefix = prefix, .font = font, .middle = middle, .text = text, .suffix = suffix, .end = next.offset };
}
