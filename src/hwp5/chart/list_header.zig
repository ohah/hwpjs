const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const Objects = @import("object_table.zig").Table;
const ids = @import("object_ids.zig");
const collections = @import("collection_header.zig");
pub const Header = struct { object_id: u32, collection: collections.Header, end: usize };

/// Inline List v1 prefix only; does not read items or infer an element count.
/// Failure preserves reader; discard both potentially changed tables.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects) !Header {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtList\x00", 1);
    const collection = try collections.readObservedV1(&next, types);
    reader.* = next;
    return .{ .object_id = id, .collection = collection, .end = next.offset };
}
