const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const lists = @import("list_header.zig");
const windows = @import("window_type_body.zig");
pub const Tail = struct { list: lists.Header, raw: [26]u8, window: windows.Body, end: usize };

/// Selected no-item List layout, opaque 26 bytes, and Window TYPE body.
/// Raw ownership/identity semantics are unresolved. No scanning or EOF rule.
/// Raw bytes are copied. Failure preserves reader; discard both tables.
pub fn readObservedNoItems(reader: *Reader, types: *Types, objects: *Objects) !Tail {
    var next = reader.*;
    const list = try lists.readObservedV1(&next, types, objects);
    const raw = (try next.take(26))[0..26].*;
    const window = try windows.readObservedV2(&next, types);
    reader.* = next;
    return .{ .list = list, .raw = raw, .window = window, .end = next.offset };
}
