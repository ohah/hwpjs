const Reader = @import("../../binary/reader.zig").Reader;
const types = @import("type_table.zig");
const requireType = @import("type_checks.zig").require;
const objectId = @import("object_ids.zig").readInline;

pub const Backdrop = struct {
    object_ids: [3]u32,
    raw_backdrop: [50]u8,
    raw_fill: [34]u8,
    raw_picture: [4]u8,
    fill_suffix: u16,
    end: usize,
};

/// Caller establishes an inline Backdrop position and owns the serialization
/// type table. Explicit observed v1 layout with an EMPTY picture only. Opaque
/// fields are copied, not assigned API property meanings. On failure the cursor
/// is unchanged, but the caller MUST discard the table (new types may exist).
pub fn readObservedEmptyPicture(reader: *Reader, table: *types.Table) !Backdrop {
    var next = reader.*;
    var out: Backdrop = undefined;
    out.object_ids[0] = try objectId(&next);
    try requireType(table, &next, "VtBackdrop\x00", 1);
    out.raw_backdrop = (try next.take(50))[0..50].*;
    out.object_ids[1] = try objectId(&next);
    if (out.object_ids[1] == out.object_ids[0]) return error.UnsupportedChartObjectReference;
    try requireType(table, &next, "VtFill\x00", 1);
    out.raw_fill = (try next.take(34))[0..34].*;
    out.object_ids[2] = try objectId(&next);
    if (out.object_ids[2] == out.object_ids[0] or out.object_ids[2] == out.object_ids[1])
        return error.UnsupportedChartObjectReference;
    try requireType(table, &next, "VtPicture\x00", 1);
    out.raw_picture = (try next.take(4))[0..4].*;
    if (try next.readInt(u32) != 0xffffffff) return error.UnsupportedChartPictureData;
    try requireType(table, &next, "VtObject\x00", 1);
    out.fill_suffix = try next.readInt(u16);
    try requireType(table, &next, "VtObject\x00", 1);
    try requireType(table, &next, "VtObject\x00", 1);
    out.end = next.offset;
    reader.* = next;
    return out;
}
