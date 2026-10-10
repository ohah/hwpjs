const shade = @import("shade_color.zig");
pub const Row = struct { id: u32, state: enum { absent, none, color, unknown }, color: ?u32 };
pub fn row(id: u32, value: ?shade.Value) Row {
    const source = value orelse return .{ .id = id, .state = .absent, .color = null };
    return switch (source) {
        .none => .{ .id = id, .state = .none, .color = null },
        .unknown => .{ .id = id, .state = .unknown, .color = null },
        .color => |color| .{ .id = id, .state = .color, .color = color },
    };
}

test "shade snapshot preserves source absence explicit none unknown black and white" {
    const std = @import("std");
    try std.testing.expectEqualDeep(Row{ .id = 7, .state = .absent, .color = null }, row(7, null));
    try std.testing.expectEqualDeep(Row{ .id = 7, .state = .none, .color = null }, row(7, .none));
    try std.testing.expectEqualDeep(Row{ .id = 7, .state = .unknown, .color = null }, row(7, .unknown));
    for ([_]u32{ 0, 0xffffff, 0x123456 }) |color| {
        try std.testing.expectEqualDeep(Row{ .id = 7, .state = .color, .color = color }, row(7, .{ .color = color }));
    }
}
