const std = @import("std");
const payload = @import("cell_vertical_alignment_payload.zig");
const plan = @import("cell_vertical_alignment_plan.zig");
const fixture = @import("cell_vertical_alignment_test_fixture.zig");
const alignment = @import("../../model/cell_vertical_alignment.zig");
const ticket: @import("../../model/history_mutation_epoch.zig").Ticket = .{ .binding = .{ .document = 1, .generation = 1, .owner = 1 }, .epoch = 1 };
test "original cell vertical H5 payload all values explicit layouts preserve unrelated raw styles and tails" {
    const a = std.testing.allocator;
    for ([_]@import("../body/list_header.zig").Layout{ .spec6, .observed8 }) |layout| {
        const at: usize = if (layout == .spec6) 2 else 4;
        for (std.enums.values(alignment.Alignment)) |before| {
            for (std.enums.values(alignment.Alignment)) |after| {
                var input: [40]u8 = @splat(0xa5);
                const attrs: u32 = 0x4a5c0080 | (@as(u32, @backingInt(before)) << 5);
                std.mem.writeInt(u32, input[at..][0..4], attrs, .little);
                const result = try payload.write(a, &input, layout, attrs, after, input.len);
                if (result) |output| {
                    defer a.free(output);
                    try std.testing.expect(before != after);
                    for (input, output, 0..) |old, new, i| if (i != at) {
                        try std.testing.expectEqual(old, new);
                    };
                    try std.testing.expectEqual(input[at] & ~@as(u8, 0x60), output[at] & ~@as(u8, 0x60));
                    try std.testing.expectEqual(after, (try payload.observe(output, layout)).value.?);
                } else try std.testing.expectEqual(before, after);
            }
        }
    }
}
test "original cell vertical H5 payload reserved protected stale truncated and exact output budget refusal" {
    const a = std.testing.allocator;
    var raw: [40]u8 = @splat(0);
    for ([_]u32{ 0x60, 1 << 17 }) |attrs| {
        std.mem.writeInt(u32, raw[4..8], attrs, .little);
        if (attrs == 0x60) {
            try std.testing.expectEqual(@as(?alignment.Alignment, null), (try payload.observe(&raw, .observed8)).value);
            try std.testing.expectError(error.UnsupportedCellVerticalAlignment, payload.write(a, &raw, .observed8, attrs, .top, raw.len));
        } else try std.testing.expectError(error.ProtectedCell, payload.write(a, &raw, .observed8, attrs, .bottom, raw.len));
        try std.testing.expectEqual(attrs, std.mem.readInt(u32, raw[4..8], .little));
    }
    std.mem.writeInt(u32, raw[4..8], 0, .little);
    try std.testing.expectError(error.StaleCellVerticalAlignment, payload.write(a, &raw, .observed8, 1, .center, raw.len));
    try std.testing.expectError(error.LimitExceeded, payload.write(a, &raw, .observed8, 0, .center, raw.len - 1));
    for (0..34) |length| {
        if (payload.observe(raw[0..length], .observed8)) |_| return error.AcceptedTruncatedCell else |_| {}
    }
}
test "original cell vertical H5 physical source owner patches selected alignment only" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const rows = try @import("table_display_bindings.zig").read(a, raw, fixture.version, document.sections[0].paragraphs);
    defer a.free(rows);
    try std.testing.expect(rows.len >= 4);
    const target: plan.Selector = .{ .section = 0, .table_node = rows[0].table_node, .list_node = rows[0].list_node, .paragraph = rows[0].paragraph };
    const before = try plan.observe(a, raw, fixture.version, document.sections[0], 0, target, ticket, false);
    const output = (try plan.write(a, raw, fixture.version, document.sections[0], 0, .{ .before = before, .value = .bottom }, ticket, false, raw.len)).?;
    defer a.free(output);
    var tree = try @import("source_tree.zig").parse(a, raw, fixture.version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[target.list_node].record.framing;
    const byte = record.offset + record.raw.len - record.payload.len + 4;
    for (raw, output, 0..) |old, new, i| if (i != byte) {
        try std.testing.expectEqual(old, new);
    };
    try std.testing.expectEqual((raw[byte] & ~@as(u8, 0x60)) | 0x40, output[byte]);
}
test "original cell vertical H5 stale ticket foreign physical owner read only refuse before output" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const rows = try @import("table_display_bindings.zig").read(a, raw, fixture.version, document.sections[0].paragraphs);
    defer a.free(rows);
    const before = try plan.observe(a, raw, fixture.version, document.sections[0], 0, .{ .section = 0, .table_node = rows[0].table_node, .list_node = rows[0].list_node, .paragraph = rows[0].paragraph }, ticket, false);
    var foreign = ticket;
    foreign.binding.document += 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, plan.write(a, raw, fixture.version, document.sections[0], 0, .{ .before = before, .value = .center }, foreign, false, raw.len));
    var protected = before;
    protected.read_only = true;
    try std.testing.expectError(error.CellVerticalAlignmentReadOnly, plan.write(a, raw, fixture.version, document.sections[0], 0, .{ .before = protected, .value = .center }, ticket, true, raw.len));
    var invalid = before.selector;
    invalid.list_node = 0;
    try std.testing.expectError(error.InvalidCellDisplayOwner, plan.observe(a, raw, fixture.version, document.sections[0], 0, invalid, ticket, false));
    var stale = before;
    stale.source_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, plan.write(a, raw, fixture.version, document.sections[0], 0, .{ .before = stale, .value = .center }, ticket, false, raw.len));
}
test "original cell vertical H5 preparation allocation failures never change input" {
    var raw: [40]u8 = @splat(0);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            const output = (try payload.write(allocator, input, .observed8, 0, .center, input.len)).?;
            defer allocator.free(output);
            try std.testing.expectEqual(@as(u8, 0x20), output[4]);
        }
    }.run, .{&raw});
    try std.testing.expectEqualSlices(u8, &@as([40]u8, @splat(0)), &raw);
}

test "original cell vertical H5 identical bytes in another section do not retarget witness" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const rows = try @import("table_display_bindings.zig").read(a, raw, fixture.version, document.sections[0].paragraphs);
    defer a.free(rows);
    const before = try plan.observe(a, raw, fixture.version, document.sections[0], 0, .{ .section = 0, .table_node = rows[0].table_node, .list_node = rows[0].list_node, .paragraph = rows[0].paragraph }, ticket, false);
    try std.testing.expectError(error.InvalidSection, plan.write(a, raw, fixture.version, document.sections[0], 1, .{ .before = before, .value = .center }, ticket, false, raw.len));
}
