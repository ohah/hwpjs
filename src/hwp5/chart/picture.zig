const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const ids = @import("object_ids.zig");
pub const Body = struct { raw: [4]u8, end: usize };
pub const Picture = struct { object_id: u32, body: Body, end: usize };

/// Body starts at the Picture type. Caller has already checked/registered its
/// inline ID. Shared with Backdrop so its earlier duplicate checks stay intact.
/// Only empty data references are observed; raw bits have no assigned meaning.
/// On failure reader is unchanged, but caller must discard changed tables.
pub fn readEmptyBodyObservedV1(reader: *Reader, types: *Types) !Body {
    var next = reader.*;
    try requireType(types, &next, "VtPicture\x00", 1);
    const raw = (try next.take(4))[0..4].*;
    if (try next.readInt(u32) != 0xffffffff) return error.UnsupportedChartPictureData;
    try requireType(types, &next, "VtObject\x00", 1);
    reader.* = next;
    return .{ .raw = raw, .end = next.offset };
}

/// Inline empty Picture with full preceding object identity scope.
pub fn readEmptyObservedV1(reader: *Reader, types: *Types, objects: *Objects) !Picture {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    const body = try readEmptyBodyObservedV1(&next, types);
    reader.* = next;
    return .{ .object_id = id, .body = body, .end = next.offset };
}
