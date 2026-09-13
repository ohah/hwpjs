const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const pictures = @import("picture.zig");
pub const Block = struct { raw: [40]u8, picture: pictures.Picture, end: usize };

/// Selected raw40 and empty Picture. Does not consume the ambiguous following
/// fields or claim a Series end. Copies raw data; failure preserves reader but
/// requires both possibly changed tables to be discarded.
pub fn readObserved(reader: *Reader, types: *Types, objects: *Objects) !Block {
    var next = reader.*;
    const raw = (try next.take(40))[0..40].*;
    const picture = try pictures.readEmptyObservedV1(&next, types, objects);
    reader.* = next;
    return .{ .raw = raw, .picture = picture, .end = next.offset };
}
