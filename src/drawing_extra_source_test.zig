const std = @import("std");
const extras = @import("hwp5/edit/drawing_object_extras.zig");

comptime {
    _ = @import("hwp5/edit/drawing_object_extras.zig");
}

fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var header: [8]u8 = undefined;
    const extended = payload.len >= 4095;
    const size: u32 = if (extended) 4095 else @intCast(payload.len);
    std.mem.writeInt(u32, header[0..4], tag | (level << 10) | (size << 20), .little);
    if (extended) std.mem.writeInt(u32, header[4..8], @intCast(payload.len), .little);
    try out.appendSlice(a, header[0..if (extended) @as(usize, 8) else 4]);
    try out.appendSlice(a, payload);
}

test "drawing opaque tails own derived source bytes and clean partial rows at every failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/HWP5-nopassword-123456.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const geometry = try @import("hwp5/edit/drawing_sources.zig").read(a, raw, source.header.version());
    defer a.free(geometry);
    try std.testing.expect(geometry.len > 0);
    var tree = try @import("hwp5/body/tree.zig").Tree.parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const row = geometry[0];
    try std.testing.expectEqual(@as(usize, 2), row.object_extra_bytes);
    const control = try a.dupe(u8, tree.nodes[row.control_node].record.framing.payload);
    defer a.free(control);
    control[control.len - 2] = 255;
    control[control.len - 1] = 128;
    var derived: std.ArrayList(u8) = .empty;
    defer derived.deinit(a);
    try frame(a, &derived, 66, 0, tree.nodes[row.paragraph_node].record.framing.payload);
    for (0..2) |_| {
        try frame(a, &derived, 71, 1, control);
        try frame(a, &derived, 76, 2, tree.nodes[row.component_node].record.framing.payload);
    }
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("hwp5/version.zig").Version) !void {
            const copied = try allocator.dupe(u8, bytes);
            defer allocator.free(copied);
            const actual = try extras.read(allocator, copied, version);
            defer extras.deinit(allocator, actual);
            @memset(copied, 0);
            try std.testing.expectEqual(@as(usize, 2), actual.len);
            for (actual) |value| {
                try std.testing.expectEqualStrings("ff80", value.extra_hex);
                try std.testing.expectEqual(@as(usize, 2), value.extra_bytes);
            }
        }
    }.run, .{ derived.items, source.header.version() });
}
