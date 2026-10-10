const std = @import("std");
const parameters = @import("hwp5/parameters/parser.zig");
const policy = @import("hwp5/edit/control_data_presentation.zig");

fn word16(a: std.mem.Allocator, bytes: *std.ArrayList(u8), value: u16) !void {
    var data: [2]u8 = undefined;
    std.mem.writeInt(u16, &data, value, .little);
    try bytes.appendSlice(a, &data);
}
fn word32(a: std.mem.Allocator, bytes: *std.ArrayList(u8), value: u32) !void {
    var data: [4]u8 = undefined;
    std.mem.writeInt(u32, &data, value, .little);
    try bytes.appendSlice(a, &data);
}

test "classic presentation retention keeps the original typed layout" {
    const a = std.testing.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    const prefix = [_]u16{ 0x021b, 1, 0, 0x0219, 0x8000, 0x0219, 3, 0, 0x4000, 9 };
    for (prefix) |value| try word16(a, &bytes, value);
    try word32(a, &bytes, 0);
    try word16(a, &bytes, 0x4002);
    try word16(a, &bytes, 9);
    try word32(a, &bytes, 1);
    for ([_]u16{ 0x0266, 0x8000, 0x0266, 15, 0 }) |value| try word16(a, &bytes, value);
    const items = [_]struct { id: u16, kind: u16 }{
        .{ .id = 0x4001, .kind = 9 },
        .{ .id = 0x4002, .kind = 5 },
        .{ .id = 0x4003, .kind = 5 },
        .{ .id = 0x4004, .kind = 5 },
        .{ .id = 0x4005, .kind = 5 },
        .{ .id = 0x4006, .kind = 5 },
        .{ .id = 0x4007, .kind = 5 },
        .{ .id = 0x4008, .kind = 0x8001 },
        .{ .id = 0x4009, .kind = 0x8001 },
        .{ .id = 0x400a, .kind = 6 },
        .{ .id = 0x401e, .kind = 0x8002 },
        .{ .id = 0x4020, .kind = 5 },
        .{ .id = 0x4021, .kind = 2 },
        .{ .id = 0x4022, .kind = 2 },
        .{ .id = 0x4024, .kind = 5 },
    };
    for (items) |item| {
        try word16(a, &bytes, item.id);
        try word16(a, &bytes, item.kind);
        if (item.kind == 0x8001) {
            try word16(a, &bytes, 10);
            try word16(a, &bytes, 0);
            for (0..10) |_| {
                try word16(a, &bytes, 5);
                try word32(a, &bytes, 0);
            }
        } else if (item.kind == 0x8002) {
            try word16(a, &bytes, 0);
        } else try word32(a, &bytes, if (item.id == 0x4001) 4 else 0);
    }
    var doc = try parameters.Document.parse(a, bytes.items, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try policy.validate(doc);
    doc.nodes[1].value.set.count = 6;
    try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
}

test "observed expanded gradient retention validates complete types and rejects mutations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/HWP5-nopassword-123456.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var found = false;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 87) continue;
        const parent = node.parent orelse continue;
        if (tree.nodes[parent].record.framing.tag != 71) continue;
        const header = try @import("hwp5/body/control_header.zig").Header.parse(tree.nodes[parent].record.framing.payload);
        if (header.id != @import("hwp5/body/control_rules.zig").id("secd")) continue;
        found = true;
        try std.testing.expectEqual(@import("hwp5/edit/control_data_policy.zig").Kind.presentation, try @import("hwp5/edit/control_data_policy.zig").validateRetainedNode(a, tree, index));
        var doc = try parameters.Document.parse(a, node.record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
        defer doc.deinit(a);
        try policy.validate(doc);
        const original_root = doc.nodes[0];
        doc.nodes[0].parent = 0;
        try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
        doc.nodes[0] = original_root;
        doc.nodes[0].item_id = 1;
        try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
        doc.nodes[0] = original_root;
        doc.nodes[0].wire_type = 1;
        try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
        doc.nodes[0] = original_root;
        const original = doc.nodes[1];
        doc.nodes[1].value.set.count = 7;
        try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
        doc.nodes[1] = original;
        for (doc.nodes) |*item| {
            const saved = item.*;
            if (item.item_id == 0x4030) {
                item.item_id = 0x4040;
                try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
                item.* = saved;
                item.wire_type = 5;
                try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
                item.* = saved;
                item.value.integer = 256;
                try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
            } else if (item.item_id == 0x4001) {
                item.value.integer = 5;
                try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
            } else if (item.item_id == 0x4005) {
                item.item_id = 0x4004;
                try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
            } else if (item.value == .array) {
                item.value.array.shared_id = 1;
                try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
            }
            item.* = saved;
        }
        doc.extra = &.{1};
        try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
        doc.extra = &.{};
        var first_array: ?usize = null;
        var last_array: ?usize = null;
        for (doc.nodes, 0..) |item, ordinal| if (item.value == .array) {
            if (first_array == null) first_array = ordinal;
            last_array = ordinal;
        };
        try std.testing.expect(first_array.? != last_array.?);
        var moved_child = false;
        for (doc.nodes) |*item| {
            if (item.parent != last_array) continue;
            item.parent = first_array;
            try std.testing.expectError(error.UnsupportedControlData, policy.validate(doc));
            item.parent = last_array;
            moved_child = true;
            break;
        }
        try std.testing.expect(moved_child);
        try policy.validate(doc);
        try @import("testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, payload: []const u8) !void {
                var parsed = try parameters.Document.parse(allocator, payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
                defer parsed.deinit(allocator);
                try policy.validate(parsed);
            }
        }.run, .{node.record.framing.payload});
    }
    try std.testing.expect(found);
    try @import("hwp5/edit/source_policy.zig").validate(a, bytes, source.header.version());
    try std.testing.expectEqualSlices(u8, input, source.file.bytes);
}
