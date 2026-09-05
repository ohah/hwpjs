const std = @import("std");
const Entry = @import("types.zig").Entry;
const h = @import("header.zig");

/// Live-entry metadata invariants shared by strict reading and canonical writing.
pub fn validate(e: Entry, index: usize) !void {
    switch (e.kind) {
        1 => if (e.start != 0 or e.size != 0) return error.InvalidStorage,
        2 => if (!std.mem.allEqual(u8, &e.clsid, 0) or e.created != 0 or e.modified != 0) return error.InvalidStreamMetadata,
        5 => if (index != 0 or !std.mem.eql(u8, e.name, "Root Entry") or e.created != 0) return error.InvalidRoot,
        else => return error.InvalidDirectory,
    }
    if ((e.kind == 2 or e.kind == 5) and e.size == 0 and e.start != h.end) return error.InvalidChain;
}
