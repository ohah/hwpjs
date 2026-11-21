//! Independent portable margin wire. Never serialize the SHA byte array as a JSON string.
const std = @import("std");
const t = @import("../model/object_outer_margins.zig");
pub fn encode(a: std.mem.Allocator, value: t.Observation) ![]u8 {
    const g = value.geometry;
    var digest: [32]u32 = undefined;
    for (g.owner.sourceSha256, &digest) |byte, *item| item.* = byte;
    return std.json.Stringify.valueAlloc(a, .{
        .geometry = .{
            .format = g.format,
            .selector = g.selector,
            .owner = .{ .ownerNode = g.owner.ownerNode, .componentNode = g.owner.componentNode, .paragraph = g.owner.paragraph, .anchorUnit = g.owner.anchorUnit, .sourceSha256 = digest, .link = g.owner.link },
            .frame = g.frame,
            .editable = g.editable,
            .reason = g.reason,
            .historyRevision = g.historyRevision,
            .binding = g.binding,
        },
        .margins = value.margins,
    }, .{});
}
test "object outer margins wire keeps all digest bytes in a portable integer array" {
    const a = std.testing.allocator;
    const value: t.Observation = .{ .geometry = .{ .format = .hwpx, .selector = .{ .kind = .drawing, .section = 0, .node = 3 }, .owner = .{ .ownerNode = 3, .componentNode = null, .paragraph = 0, .anchorUnit = 0, .sourceSha256 = @splat(255), .link = "rect:owned" }, .frame = .{ .width = 10, .height = 20, .horizontalOffset = 0, .verticalOffset = 0, .treatAsCharacter = false }, .editable = .{ .size = true, .position = true }, .reason = null, .historyRevision = 0, .binding = .{ .session = "native-session", .serial = "18446744073709551615" } }, .margins = .{ .left = 0, .right = 1, .top = 2, .bottom = 32767 } };
    const bytes = try encode(a, value);
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const digest = parsed.value.object.get("geometry").?.object.get("owner").?.object.get("sourceSha256").?;
    try std.testing.expect(digest == .array);
    try std.testing.expectEqual(@as(usize, 32), digest.array.items.len);
    for (digest.array.items) |item| try std.testing.expectEqual(@as(i64, 255), item.integer);
}
