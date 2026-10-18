//! 선택한 행렬6계수만 작성합니다. resize 정책/그림 소유권은 상위 책임입니다.
const std = @import("std");
const component = @import("../body/shape_component.zig");
pub const Selection = union(enum) { translation, scale: usize, rotation: usize };

pub fn write(a: std.mem.Allocator, source: []const u8, layout: component.Layout, selection: Selection, values: [6]f64, limit: usize) ![]u8 {
    const parsed = try component.Component.parse(source, layout);
    if (source.len > limit) return error.LimitExceeded;
    for (values) |value| if (!std.math.isFinite(value)) return error.NonFiniteMatrix;
    const offset = parsed.rendering_offset + 2 + switch (selection) {
        .translation => @as(usize, 0),
        .scale, .rotation => |index| blk: {
            if (index >= parsed.rendering.pairs.count()) return error.InvalidMatrixIndex;
            break :blk 48 + index * 96 + @as(usize, if (selection == .rotation) 48 else 0);
        },
    };
    const output = try a.dupe(u8, source);
    for (values, 0..) |value, index| std.mem.writeInt(u64, output[offset + index * 8 ..][0..8], @bitCast(value), .little);
    return output;
}

test "HWP5 drawing matrix payload actual fourteen pictures roundtrip all matrices without other changes" {
    const a = std.testing.allocator;
    var pictures_checked: usize = 0;
    var matrices_checked: usize = 0;
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
            for (0..1 + parsed.rendering.pairs.count() * 2) |ordinal| {
                const selection: Selection = if (ordinal == 0) .translation else if (ordinal % 2 == 1) .{ .scale = (ordinal - 1) / 2 } else .{ .rotation = (ordinal - 1) / 2 };
                const matrix = if (ordinal == 0) parsed.rendering.translation else if (ordinal % 2 == 1) parsed.rendering.pairs.get((ordinal - 1) / 2).?.scale else parsed.rendering.pairs.get((ordinal - 1) / 2).?.rotation;
                var values: [6]f64 = undefined;
                for (matrix.bits, 0..) |bits, index| values[index] = @bitCast(bits);
                const same = try write(a, payload, layout, selection, values, payload.len);
                defer a.free(same);
                try std.testing.expectEqualSlices(u8, payload, same);
                values[0] += 1;
                const changed = try write(a, payload, layout, selection, values, payload.len);
                defer a.free(changed);
                const offset = parsed.rendering_offset + 2 + ordinal * 48;
                try std.testing.expectEqualSlices(u8, payload[0..offset], changed[0..offset]);
                try std.testing.expectEqualSlices(u8, payload[offset + 48 ..], changed[offset + 48 ..]);
                for (values, 0..) |value, index| try std.testing.expectEqual(@as(u64, @bitCast(value)), std.mem.readInt(u64, changed[offset + index * 8 ..][0..8], .little));
                _ = try component.Component.parse(changed, layout);
                matrices_checked += 1;
            }
            pictures_checked += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 14), pictures_checked);
    try std.testing.expect(matrices_checked >= 42);
}

test "HWP5 drawing matrix payload writes selected pair only and preserves signed zero under failures" {
    const a = std.testing.allocator;
    for ([_]component.Layout{ .single_id, .double_id }) |layout| {
        const rendering_offset: usize = if (layout == .single_id) 46 else 50;
        var bytes = @as([295]u8, @splat(0));
        std.mem.writeInt(u16, bytes[rendering_offset..][0..2], 2, .little);
        bytes[294] = 0xab;
        const values: [6]f64 = .{ 1, -0.0, 3, 4, 5, 6 };
        const selections = [_]Selection{ .translation, .{ .scale = 0 }, .{ .rotation = 0 }, .{ .scale = 1 }, .{ .rotation = 1 } };
        for (selections, 0..) |selection, ordinal| {
            const offset = rendering_offset + 2 + ordinal * 48;
            try std.testing.checkAllAllocationFailures(a, struct {
                fn run(allocator: std.mem.Allocator, source: []const u8, selected_layout: component.Layout, selected: Selection, expected: [6]f64, start: usize) !void {
                    const changed = try write(allocator, source, selected_layout, selected, expected, source.len);
                    defer allocator.free(changed);
                    try std.testing.expectEqualSlices(u8, source[0..start], changed[0..start]);
                    try std.testing.expectEqualSlices(u8, source[start + 48 ..], changed[start + 48 ..]);
                    for (expected, 0..) |value, index| try std.testing.expectEqual(@as(u64, @bitCast(value)), std.mem.readInt(u64, changed[start + index * 8 ..][0..8], .little));
                    _ = try component.Component.parse(changed, selected_layout);
                }
            }.run, .{ &bytes, layout, selection, values, offset });
        }
        try std.testing.expectError(error.InvalidMatrixIndex, write(a, &bytes, layout, .{ .scale = std.math.maxInt(usize) }, values, bytes.len));
        var bad = values;
        bad[0] = std.math.inf(f64);
        try std.testing.expectError(error.NonFiniteMatrix, write(a, &bytes, layout, .translation, bad, bytes.len));
        bad[0] = std.math.nan(f64);
        try std.testing.expectError(error.NonFiniteMatrix, write(a, &bytes, layout, .translation, bad, bytes.len));
        try std.testing.expectError(error.LimitExceeded, write(a, &bytes, layout, .translation, values, bytes.len - 1));
    }
}
