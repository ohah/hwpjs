//! Allocate a free ID from a validated sorted resource table without mutation.
const std = @import("std");

pub fn next(sorted: []const u32) !u32 {
    var candidate: u64 = 0;
    var previous: ?u32 = null;
    for (sorted) |id| {
        if (previous) |before| if (id <= before) return error.InvalidResourceIdOrder;
        previous = id;
        if (id == candidate) candidate += 1;
    }
    if (candidate > std.math.maxInt(u32)) return error.ResourceIdExhausted;
    return @intCast(candidate);
}

test "HWPX resource ID allocation handles holes maximum IDs and invalid order" {
    try std.testing.expectEqual(@as(u32, 0), try next(&.{}));
    try std.testing.expectEqual(@as(u32, 1), try next(&.{ 0, 9, 300, 0xffffffff }));
    try std.testing.expectEqual(@as(u32, 0), try next(&.{0xffffffff}));
    try std.testing.expectEqual(@as(u32, 3), try next(&.{ 0, 1, 2 }));
    try std.testing.expectError(error.InvalidResourceIdOrder, next(&.{ 0, 0 }));
    try std.testing.expectError(error.InvalidResourceIdOrder, next(&.{ 9, 0 }));
    // Exhaustively compare all small sparse tables against an independent search.
    for (0..256) |mask| {
        var storage: [8]u32 = undefined;
        var length: usize = 0;
        for (0..8) |bit| {
            if (mask & (@as(usize, 1) << @intCast(bit)) == 0) continue;
            storage[length] = @intCast(bit);
            length += 1;
        }
        const result = try next(storage[0..length]);
        var expected: u32 = 0;
        while (std.mem.indexOfScalar(u32, storage[0..length], expected) != null) expected += 1;
        try std.testing.expectEqual(expected, result);
    }
}
