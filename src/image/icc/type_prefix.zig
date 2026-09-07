const std = @import("std");
/// Common tag-type prefix. Does not validate the type-specific payload.
pub fn inspect(data: []const u8) ![4]u8 {
    if (data.len < 8) return error.InvalidIccTagDataSize;
    if (!std.mem.allEqual(u8, data[4..8], 0)) return error.InvalidIccTagReserved;
    return data[0..4].*;
}
