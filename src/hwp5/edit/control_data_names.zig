//! Exact name-only CTRL_DATA schemas; caller must verify direct owner binding.
const parameters = @import("../parameters/parser.zig");
pub const Owner = enum { bookmark, shape, click_field, bookmark_field };

/// Exact direct-parent binding; no nearest-ancestor or previous-header guess.
pub fn ownerForTree(tree: @import("../body/tree.zig").Tree, index: usize) !Owner {
    if (index >= tree.nodes.len or tree.nodes[index].record.framing.tag != 87) return error.UnsupportedControlDataOwner;
    const parent_index = tree.nodes[index].parent orelse return error.UnsupportedControlDataOwner;
    if (parent_index >= index) return error.UnsupportedControlDataOwner;
    const parent = tree.nodes[parent_index];
    const body = @import("../body/reader.zig");
    const rules = @import("../body/control_rules.zig");
    if (parent.record.framing.tag == @intFromEnum(body.Tag.control_header)) {
        const header = try body.ControlHeader.parse(parent.record.framing.payload);
        if (header.id == rules.id("bokm")) return .bookmark;
        if (header.id == rules.id("%clk")) return .click_field;
        if (header.id == rules.id("%bmk")) {
            _ = try @import("../body/field_start.zig").Properties.parse(header.properties);
            return .bookmark_field;
        }
    } else if (parent.record.framing.tag == @import("../body/shape_component.zig").tag) {
        const component = @import("../body/shape_component.zig");
        const validation = @import("../body/shape_validation.zig");
        var current = parent_index;
        while (true) {
            const owner = tree.nodes[current].parent orelse return error.UnsupportedControlDataOwner;
            if (owner >= current) return error.UnsupportedControlDataOwner;
            const layout = validation.componentLayout(tree, current) catch return error.UnsupportedControlDataOwner;
            _ = try component.Component.parse(tree.nodes[current].record.framing.payload, layout);
            if (layout == .double_id) return .shape;
            const ancestor = tree.nodes[owner].parent orelse return error.UnsupportedControlDataOwner;
            if (ancestor >= owner) return error.UnsupportedControlDataOwner;
            const owner_layout = validation.componentLayout(tree, owner) catch return error.UnsupportedControlDataOwner;
            const group = try component.Component.parse(tree.nodes[owner].record.framing.payload, owner_layout);
            var report: @import("../body/group_validation.zig").Report = .{};
            try report.add(tree, owner, group);
            current = owner;
        }
    }
    return error.UnsupportedControlDataOwner;
}

test "reference nested shape name data follows validated component and group ownership" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/hwpx-01.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    var count: usize = 0;
    for (0..source.section_count) |section| {
        const bytes = try source.decodeSection(a, section);
        defer a.free(bytes);
        var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        for (tree.nodes, 0..) |node, index| {
            if (node.record.framing.tag != 87) continue;
            try std.testing.expectEqual(Owner.shape, try ownerForTree(tree, index));
            try std.testing.expectEqual(@import("control_data_policy.zig").Kind.shape_name, try @import("control_data_policy.zig").validateRetainedNode(a, tree, index));
            const parent = tree.nodes[index].parent;
            tree.nodes[index].parent = index;
            try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, index));
            tree.nodes[index].parent = parent;
            var root = parent.?;
            while (tree.nodes[root].record.framing.tag == @import("../body/shape_component.zig").tag) root = tree.nodes[root].parent orelse return error.TestExpectedEqual;
            const payload = tree.nodes[root].record.framing.payload;
            const offset = @intFromPtr(payload.ptr) - @intFromPtr(bytes.ptr);
            const original_id = std.mem.readInt(u32, bytes[offset..][0..4], .little);
            const original_value = tree.nodes[root].record.value;
            tree.nodes[root].record.value = .{ .control_header = .{ .id = @import("../body/control_rules.zig").drawing_id, .properties = payload[4..] } };
            std.mem.writeInt(u32, bytes[offset..][0..4], @import("../body/control_rules.zig").table_id, .little);
            try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, index));
            std.mem.writeInt(u32, bytes[offset..][0..4], original_id, .little);
            tree.nodes[root].record.value = original_value;
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 2), count);
    const editor = try @import("style_preservation.zig").Session.open(a, input);
    defer editor.close();
    const before = try editor.copyText(a, 0, 0);
    defer a.free(before);
    try editor.apply(.{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "검증" } });
    const current = try editor.copyText(a, 0, 0);
    defer a.free(current);
    try std.testing.expect(!std.mem.eql(u8, before, current));
    const saved = try editor.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const recovered = try reopened.copyText(a, 0, 0);
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, current, recovered);
}

/// Reject unknown items, tails, duplicates and integer/location metadata.
/// Returned name borrows the parsed payload; no mutation is performed.
pub fn name(doc: parameters.Document, owner: Owner) ![]const u8 {
    if (doc.extra.len != 0 or doc.nodes.len == 0) return error.UnsupportedControlData;
    const root = doc.nodes[0];
    if (root.value != .set or root.value.set.id != 0x021b or root.value.set.count != 1 or root.value.set.reserved != 0) return error.UnsupportedControlData;
    const index: usize = switch (owner) {
        .bookmark, .click_field, .bookmark_field => blk: {
            if (doc.nodes.len != 2) return error.UnsupportedControlData;
            break :blk 1;
        },
        .shape => blk: {
            if (doc.nodes.len != 3) return error.UnsupportedControlData;
            const set = doc.nodes[1];
            if (set.parent != 0 or set.item_id != 0x026f or set.value != .set or set.value.set.id != 0x026f or set.value.set.count != 1 or set.value.set.reserved != 0) return error.UnsupportedControlData;
            break :blk 2;
        },
    };
    const value = doc.nodes[index];
    const is_shape = owner == .shape;
    if (value.parent != (if (is_shape) @as(usize, 1) else 0) or value.item_id != (if (is_shape) @as(u16, 0x0265) else 0x4000) or value.value != .string) return error.UnsupportedControlData;
    return value.value.string;
}

test "click field name requires exact direct owner and name schema" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = [_]u8{ 71, 0, 0x40, 0, 'k', 'l', 'c', '%', 87, 4, 0xe0, 0, 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 1, 0, 0x41, 0 };
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, &bytes, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(Owner.click_field, try ownerForTree(tree, 1));
    var doc = try parameters.Document.parse(a, tree.nodes[1].record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 0x41, 0 }, try name(doc, .click_field));
    doc.nodes[1].item_id = 0x4001;
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .click_field));
    doc.nodes[1].item_id = 0x4000;
    doc.extra = &.{0};
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .click_field));
    tree.nodes[1].parent = null;
    try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, 1));
}

fn clickNameAllocationCase(a: @import("std").mem.Allocator) !void {
    const std = @import("std");
    // Observed issue1891/80250 CTRL_DATA: UTF-16LE name, not a fixed-offset guess.
    const payload = [_]u8{ 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 3, 0, 0x48, 0xc5, 0x74, 0xac, 0x85, 0xba };
    var doc = try parameters.Document.parse(a, &payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try std.testing.expectEqualSlices(u8, payload[12..], try name(doc, .click_field));
    doc.nodes[0].value.set.reserved = 1;
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .click_field));
}

test "observed click field name allocation failures preserve strict schema" {
    try @import("../../testing/allocation_failures.zig").check(clickNameAllocationCase, .{});
}

test "control data name schema refuses wrong owner tails and unknown items" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = [_]u8{ 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 1, 0, 0x41, 0 };
    var doc = try parameters.Document.parse(a, &bytes, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 0x41, 0 }, try name(doc, .bookmark));
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .shape));
    doc.extra = &.{0};
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .bookmark));
    doc.extra = &.{};
    doc.nodes[1].item_id = 0x4001;
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .bookmark));
    doc.nodes[1].item_id = 0x4000;
    doc.nodes[0].value.set.reserved = 1;
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .bookmark));
}

test "control data name owner requires direct bookmark parent" {
    const std = @import("std");
    const a = std.testing.allocator;
    var bytes = [_]u8{ 71, 0, 0x40, 0, 'm', 'k', 'o', 'b', 87, 4, 0xe0, 0, 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 1, 0, 0x41, 0 };
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, &bytes, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(Owner.bookmark, try ownerForTree(tree, 1));
    try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, 0));
    try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, 2));
    bytes[4] = 'x';
    try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, 1));
    bytes[4] = 'm';
    tree.nodes[1].parent = null;
    try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, 1));
    tree.nodes[1].parent = 1;
    try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, 1));
}

test "original bookmark field name requires complete direct field owner" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/추진일정.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 87) continue;
        try std.testing.expectEqual(Owner.bookmark_field, try ownerForTree(tree, index));
        try std.testing.expectEqual(@import("control_data_policy.zig").Kind.bookmark_field_name, try @import("control_data_policy.zig").validateRetainedNode(a, tree, index));
        const parent = tree.nodes[index].parent.?;
        const payload = tree.nodes[parent].record.framing.payload;
        const offset = @intFromPtr(payload.ptr) - @intFromPtr(bytes.ptr);
        const original = std.mem.readInt(u32, bytes[offset..][0..4], .little);
        std.mem.writeInt(u32, bytes[offset..][0..4], @import("../body/control_rules.zig").id("%xrf"), .little);
        try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, index));
        std.mem.writeInt(u32, bytes[offset..][0..4], original, .little);
        const full = tree.nodes[parent].record.framing.payload;
        tree.nodes[parent].record.framing.payload = full[0..14];
        try std.testing.expectError(error.UnexpectedEnd, ownerForTree(tree, index));
        tree.nodes[parent].record.framing.payload = full;
        tree.nodes[index].parent = index;
        try std.testing.expectError(error.UnsupportedControlDataOwner, ownerForTree(tree, index));
        tree.nodes[index].parent = parent;
        // Name retention alone must not enable the section's text transaction.
        try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validate(a, bytes, source.header.version()));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
}

fn bookmarkFieldAllocationCase(a: @import("std").mem.Allocator) !void {
    const std = @import("std");
    const payload = [_]u8{ 0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 7, 0, 0x94, 0xcd, 0xc4, 0xc9, 0x7c, 0xc7, 0x15, 0xc8, 0x28, 0, 0x48, 0xc5, 0x29, 0 };
    var doc = try parameters.Document.parse(a, &payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    try std.testing.expectEqualSlices(u8, payload[12..], try name(doc, .bookmark_field));
    doc.nodes[1].item_id = 0x4001;
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .bookmark_field));
    doc.nodes[1].item_id = 0x4000;
    doc.extra = &.{0};
    try std.testing.expectError(error.UnsupportedControlData, name(doc, .bookmark_field));
}

test "bookmark field observed name allocation failure and unknown metadata" {
    try @import("../../testing/allocation_failures.zig").check(bookmarkFieldAllocationCase, .{});
}
