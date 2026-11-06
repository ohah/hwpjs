//! Synthetic resource controls. These are NOT original Noori fixture evidence.
const std = @import("std");
const a = std.testing.allocator;
const p = @import("../../model/border_fill_patch.zig");
const values = @import("cell_background_values.zig");
const borders = @import("cell_border_values.zig");
const payloads = @import("border_fill_payload_patch.zig");
const owner: values.Edit = .{ .section = 0, .table_node = 1, .list_node = 2, .color = 0 };
fn border(edges: u8, style: p.Style, width: u16, color: u32) !p.Patch {
    return borders.toPatch(.{ .section = 0, .table_node = 1, .list_node = 2, .edges = edges, .style = style, .width_hundredth_mm = width, .color = color });
}

test "cell border HWP5 exact per-edge style width RGB black and unknown fill bytes preserved" {
    for ([_]p.Style{ .NONE, .SOLID, .DOUBLE_SLIM }, [_]u8{ 0, 1, 8 }) |style, wire| {
        for (p.widths, 0..) |width, code| for ([_]u8{ 1, 2, 4, 8, 15 }) |mask| {
            var input: [43]u8 = @splat(0xa5);
            // Unknown fill bits make the entire tail opaque; border-only must copy it.
            std.mem.writeInt(u32, input[32..36], 0x80000000, .little);
            const before = input;
            const output = try payloads.write(a, &input, try border(mask, style, width, 0), 4096);
            defer a.free(output);
            var expected = before;
            for (0..4) |index| if (mask & (@as(u8, 1) << @intCast(index)) != 0) {
                const at = 2 + index * 6;
                expected[at] = wire;
                expected[at + 1] = @intCast(code);
                @memset(expected[at + 2 ..][0..4], 0);
            };
            try std.testing.expectEqualSlices(u8, &expected, output);
            try std.testing.expectEqualSlices(u8, &before, &input);
        };
    }
    try std.testing.expectError(error.InvalidCellBorderEdges, border(0, .SOLID, 10, 0));
    try std.testing.expectError(error.InvalidCellBorderEdges, border(16, .SOLID, 10, 0));
    try std.testing.expectError(error.UnsupportedBorderWidth, border(1, .SOLID, 11, 0));
    try std.testing.expectError(error.UnsupportedBorderLineStyle, border(1, .DOT, 10, 0));
    try std.testing.expectError(error.InvalidCharacterColor, border(1, .SOLID, 10, 0x1000000));
}

test "cell border HWP5 mixed order same owner scalar restoration keeps sibling intents" {
    const input: [36]u8 = @splat(0);
    const bg = try values.solidPatch(&input, 0x123456);
    const edge = try border(5, .DOUBLE_SLIM, 25, 0);
    var first: values.Values = .{};
    defer first.deinit(a);
    var second: values.Values = .{};
    defer second.deinit(a);
    try first.applyResolved(a, &input, owner, 1, bg, 4096);
    try first.applyResolved(a, &input, owner, 1, edge, 4096);
    try second.applyResolved(a, &input, owner, 1, edge, 4096);
    try second.applyResolved(a, &input, owner, 1, bg, 4096);
    try std.testing.expect(first.equals(second));
    try std.testing.expectEqual(@as(usize, 1), first.entries.len);
    var snapshot = try first.clone(a);
    defer snapshot.deinit(a);
    try first.applyResolved(a, &input, owner, 1, edge, 4096);
    try std.testing.expect(first.equals(snapshot));
    // Restore only left style. Its width and top edge and background must survive.
    var style_only: p.Patch = .{};
    style_only.border.edges[0] = .{ .style = .NONE };
    try first.applyResolved(a, &input, owner, 1, style_only, 4096);
    const patch = first.entries[0].patch.?;
    try std.testing.expectEqual(@as(?p.Style, null), patch.border.edges[0].?.style);
    try std.testing.expectEqual(@as(?u16, 25), patch.border.edges[0].?.width_hundredth_mm);
    try std.testing.expectEqual(@as(?p.Style, .DOUBLE_SLIM), patch.border.edges[2].?.style);
    try std.testing.expectEqual(@as(?u32, 0x123456), first.color(owner));
    // Restore both complete edges to source; release border only.
    try first.applyResolved(a, &input, owner, 1, try border(5, .NONE, 10, 0), 4096);
    try std.testing.expectEqual(@as(usize, 1), first.entries.len);
    try std.testing.expect(!p.has(.{ .border = first.entries[0].patch.?.border }));
    try std.testing.expectEqual(@as(?u32, 0x123456), first.color(owner));
    // The reverse component restoration preserves a border-only owner.
    var solid: [48]u8 = @splat(0);
    std.mem.writeInt(u32, solid[32..36], 1, .little);
    std.mem.writeInt(u32, solid[36..40], 0x112233, .little);
    std.mem.writeInt(u32, solid[40..44], 0x445566, .little);
    std.mem.writeInt(i32, solid[44..48], -1, .little);
    var third: values.Values = .{};
    defer third.deinit(a);
    try third.applyResolved(a, &solid, owner, 1, try values.solidPatch(&solid, 0), 4096);
    try third.applyResolved(a, &solid, owner, 1, edge, 4096);
    try third.applyResolved(a, &solid, owner, 1, try values.solidPatch(&solid, 0x332211), 4096);
    try std.testing.expectEqual(@as(?u32, null), third.color(owner));
    try std.testing.expect(p.has(third.entries[0].patch.?));
    try third.applyResolved(a, &solid, owner, 1, try border(5, .NONE, 10, 0), 4096);
    try std.testing.expectEqual(@as(usize, 0), third.entries.len);
}

test "cell border HWP5 shared patch dedup and old resource exact under all allocation failures" {
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(alloc: std.mem.Allocator) !void {
            const payload: [36]u8 = @splat(0);
            var v: values.Values = .{};
            defer v.deinit(alloc);
            const requested = p.merge(try values.solidPatch(&payload, 0x123456), try border(10, .DOUBLE_SLIM, 30, 0));
            v.applyResolved(alloc, &payload, owner, 1, requested, 4096) catch |err| {
                try std.testing.expectEqual(@as(usize, 0), v.entries.len);
                return err;
            };
            var mapping: [60]u8 = @splat(0);
            std.mem.writeInt(i32, mapping[32..36], 1, .little);
            var info: std.ArrayList(u8) = .empty;
            defer info.deinit(alloc);
            try @import("../record_writer.zig").append(alloc, &info, 17, 0, &mapping, 4096);
            try @import("../record_writer.zig").append(alloc, &info, 20, 1, &payload, 4096);
            var entries: [64]values.Entry = undefined;
            for (&entries, 0..) |*entry, index| {
                entry.* = v.entries[0];
                entry.edit.list_node = @intCast(index + 2);
            }
            var prepared = try @import("cell_background_write.zig").info(alloc, info.items, .{ .raw = 0x05000000 }, &entries, 4096);
            defer prepared.deinit(alloc);
            const old = try @import("border_fill_docinfo_patch.zig").resource(prepared.bytes, 1);
            try std.testing.expectEqualSlices(u8, &payload, old);
            for (prepared.refs) |ref| try std.testing.expectEqual(@as(u16, 2), ref.id);
            // Exactly one clone: no per-owner DocInfo cache or serialized resource.
            try std.testing.expectEqual(info.items.len + 52, prepared.bytes.len);
            const before = v.entries[0];
            v.applyResolved(alloc, &payload, owner, 1, try border(10, .NONE, 10, 0), 4096) catch |err| {
                try std.testing.expectEqualDeep(before, v.entries[0]);
                return err;
            };
            try std.testing.expect(v.entries[0].patch.?.background != null);
        }
    }.run, .{});
}
