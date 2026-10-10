//! 명시적으로 선택한 LIST_HEADER 배치 뒤 셀 폭/높이만 교체합니다.
const std = @import("std");
const lists = @import("../body/list_header.zig");
pub const Size = struct { width: u32, height: u32 };

pub fn write(a: std.mem.Allocator, payload: []const u8, layout: lists.Layout, size: Size, limit: usize) ![]u8 {
    const header = try lists.Header.parse(payload);
    const view = try header.view(layout);
    _ = try @import("../body/table_cell.zig").Cell.parse(view.extra);
    if (payload.len > limit) return error.LimitExceeded;
    const offset = payload.len - view.extra.len;
    const output = try a.dupe(u8, payload);
    std.mem.writeInt(u32, output[offset + 8 ..][0..4], size.width, .little);
    std.mem.writeInt(u32, output[offset + 12 ..][0..4], size.height, .little);
    return output;
}

test "HWP5 cell size payload preserves both explicit layouts and opaque tails under all allocation failures" {
    const a = std.testing.allocator;
    for ([_]lists.Layout{ .spec6, .observed8 }) |layout| {
        const base: usize = if (layout == .spec6) 6 else 8;
        var payload: [38]u8 = undefined;
        for (&payload, 0..) |*byte, index| byte.* = @intCast(index + 1);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, input: []const u8, selected: lists.Layout, offset: usize) !void {
                const output = try write(allocator, input, selected, .{ .width = 0, .height = std.math.maxInt(u32) }, 1000);
                defer allocator.free(output);
                try std.testing.expectEqualSlices(u8, input[0 .. offset + 8], output[0 .. offset + 8]);
                try std.testing.expectEqualSlices(u8, input[offset + 16 ..], output[offset + 16 ..]);
                const cell = try @import("../body/table_cell.zig").Cell.parse((try (try lists.Header.parse(output)).view(selected)).extra);
                try std.testing.expectEqual(@as(u32, 0), cell.width);
                try std.testing.expectEqual(std.math.maxInt(u32), cell.height);
            }
        }.run, .{ &payload, layout, base });
        for (0..base + 26) |length| {
            const result = write(a, payload[0..length], layout, .{ .width = 1, .height = 2 }, 1000);
            if (result) |unexpected| {
                a.free(unexpected);
                return error.AcceptedTruncatedCell;
            } else |_| {}
        }
        try std.testing.expectError(error.LimitExceeded, write(a, &payload, layout, .{ .width = 1, .height = 2 }, 1));
    }
}

test "HWP5 cell size payload keeps actual nested cell extensions and original values intact" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var tree = try @import("../body/tree.zig").Tree.parse(a, decoded, source.header.version(), .{});
    defer tree.deinit(a);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer document.deinit(a);
    const bindings = try @import("table_display_bindings.zig").read(a, decoded, source.header.version(), document.sections[0].paragraphs);
    defer a.free(bindings);
    try std.testing.expect(bindings.len > 0);
    for (bindings) |binding| {
        const payload = tree.nodes[binding.list_node].record.framing.payload;
        const unchanged = try write(a, payload, .observed8, .{ .width = binding.width, .height = binding.height }, payload.len);
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, payload, unchanged);
        const changed = try write(a, payload, .observed8, .{ .width = 0, .height = std.math.maxInt(u32) }, payload.len);
        defer a.free(changed);
        try std.testing.expectEqualSlices(u8, payload[0..16], changed[0..16]);
        try std.testing.expectEqualSlices(u8, payload[24..], changed[24..]);
    }
}
