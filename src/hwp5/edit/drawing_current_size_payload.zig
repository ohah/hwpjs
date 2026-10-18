//! 원값 크기 작성만 소유합니다. 시각적 resize와 행렬 변경은 별도입니다.
const std = @import("std");
const component = @import("../body/shape_component.zig");
pub const Size = struct { width: u32, height: u32 };

pub fn write(a: std.mem.Allocator, payload: []const u8, layout: component.Layout, size: Size, limit: usize) ![]u8 {
    const parsed = try component.Component.parse(payload, layout);
    if (payload.len > limit) return error.LimitExceeded;
    const output = try a.dupe(u8, payload);
    const offset = parsed.current_size_offset;
    std.mem.writeInt(u32, output[offset..][0..4], size.width, .little);
    std.mem.writeInt(u32, output[offset + 4 ..][0..4], size.height, .little);
    return output;
}

test "HWP5 drawing current size payload actual fourteen pictures retain every other byte" {
    const a = std.testing.allocator;
    var count: usize = 0;
    var grouped: usize = 0;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
        defer a.free(pictures);
        var tree = try @import("../body/tree.zig").Tree.parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        for (pictures) |picture| {
            const layout = try @import("../body/shape_validation.zig").componentLayout(tree, picture.component_node);
            const payload = tree.nodes[picture.component_node].record.framing.payload;
            const parsed = try component.Component.parse(payload, layout);
            const same = try write(a, payload, layout, .{ .width = parsed.current_width, .height = parsed.current_height }, payload.len);
            defer a.free(same);
            try std.testing.expectEqualSlices(u8, payload, same);
            const changed = try write(a, payload, layout, .{ .width = 10000, .height = 6000 }, payload.len);
            defer a.free(changed);
            const reparsed = try component.Component.parse(changed, layout);
            try std.testing.expectEqual(@as(u32, 10000), reparsed.current_width);
            try std.testing.expectEqual(@as(u32, 6000), reparsed.current_height);
            const offset = parsed.current_size_offset;
            try std.testing.expectEqualSlices(u8, payload[0..offset], changed[0..offset]);
            try std.testing.expectEqualSlices(u8, payload[offset + 8 ..], changed[offset + 8 ..]);
            count += 1;
            grouped += @intFromBool(layout == .single_id);
        }
    }
    try std.testing.expectEqual(@as(usize, 14), count);
    try std.testing.expectEqual(@as(usize, 1), grouped);
}

test "HWP5 drawing current size payload preserves explicit layout matrices and opaque tail" {
    const a = std.testing.allocator;
    for ([_]component.Layout{ .single_id, .double_id }) |layout| {
        const minimum: usize = if (layout == .single_id) 96 else 100;
        var bytes = @as([107]u8, @splat(0));
        bytes[minimum] = 0xa5;
        const input = bytes[0 .. minimum + 1];
        const parsed = try component.Component.parse(input, layout);
        const unchanged = try write(a, input, layout, .{ .width = 0, .height = 0 }, input.len);
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, input, unchanged);
        const Probe = struct {
            fn run(allocator: std.mem.Allocator, source: []const u8, selected: component.Layout, offset: usize) !void {
                const changed = try write(allocator, source, selected, .{ .width = 0xffffffff, .height = 12345 }, source.len);
                defer allocator.free(changed);
                try std.testing.expectEqualSlices(u8, source[0..offset], changed[0..offset]);
                try std.testing.expectEqualSlices(u8, source[offset + 8 ..], changed[offset + 8 ..]);
                const result = try component.Component.parse(changed, selected);
                try std.testing.expectEqual(@as(u32, 0xffffffff), result.current_width);
                try std.testing.expectEqual(@as(u32, 12345), result.current_height);
            }
        };
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{ input, layout, parsed.current_size_offset });
        for (0..minimum) |length| try std.testing.expectError(error.UnexpectedEnd, write(a, input[0..length], layout, .{ .width = 1, .height = 2 }, input.len));
        try std.testing.expectError(error.LimitExceeded, write(a, input, layout, .{ .width = 1, .height = 2 }, input.len - 1));
    }
}
