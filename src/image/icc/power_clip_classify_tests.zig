const std = @import("std");
const classify = @import("power_clip_classify.zig");
const Raw = @import("power_partition.zig").Piece;
const Kind = @import("power_clip_types.zig").Kind;
test "clipping classification preserves uncertain initial side until precision increases" {
    const part = Raw{ .direction = .increasing, .power = .{
        .interval = .{ .start = .{ .numerator = 11749380235262596085, .denominator = 16616132878186749607 }, .end = .{ .numerator = 1, .denominator = 1 } },
        .a = 65536,
        .b = 0,
        .g = 131072,
        .offset = 32768,
    } };
    try std.testing.expectEqual(@as(?Kind, null), try classify.initial(128, part));
    try std.testing.expectEqual(@as(?Kind, .one), try classify.initial(512, part));
}
