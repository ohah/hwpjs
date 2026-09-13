const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const backdrops = @import("backdrop.zig");
pub const Block = struct { raw: [26]u8, backdrop: backdrops.Backdrop, end: usize };

/// Selected post-cell raw26 and empty-Picture Backdrop. Not a full Grid end;
/// no Section type, guessed identity, following Object base, or EOF consumed.
/// Backdrop validates its local inline IDs; enclosing scopes register them.
/// Raw bytes are copied. Failure preserves reader; discard the type table.
pub fn readObservedEmptyPicture(reader: *Reader, types: *Types) !Block {
    var next = reader.*;
    const raw = (try next.take(26))[0..26].*;
    const backdrop = try backdrops.readObservedEmptyPicture(&next, types);
    reader.* = next;
    return .{ .raw = raw, .backdrop = backdrop, .end = next.offset };
}
