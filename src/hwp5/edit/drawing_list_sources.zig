//! Source drawing caption/body lists; preserve grouped component ownership.
const std = @import("std");
pub const Source = struct {
    pub const Caption = struct { flags: u32, width: u32, gap: i16, max_text_width: u32, extra_bytes: usize, extra_nonzero: bool };
    kind: enum { caption, body },
    control_node: usize,
    owner_node: usize,
    list_node: usize,
    paragraph_count: usize,
    attributes: u32,
    unknown: ?u16,
    extra_bytes: usize,
    extra_nonzero: bool,
    margins: ?[4]i16,
    last_width: ?u32,
    body_extra_bytes: ?usize,
    caption: ?Caption,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    const drawing_id = @import("../body/control_rules.zig").drawing_id;
    for (groups.items) |group| {
        const parent = tree.nodes[group.parent_node];
        const caption = parent.record.value == .control_header and parent.record.value.control_header.id == drawing_id;
        if (!caption and parent.record.framing.tag != @import("../body/shape_component.zig").tag) continue;
        var owner: ?usize = group.parent_node;
        while (owner) |index| {
            const node = tree.nodes[index];
            if (node.record.value == .control_header and node.record.value.control_header.id == drawing_id) break;
            owner = node.parent;
        }
        const control = owner orelse return error.MissingDrawingListControl;
        const view = try tree.nodes[group.header_node].record.value.list_header.view(.observed8);
        const text = if (caption) null else try @import("../body/drawing_text_properties.zig").Properties.parse(view.extra);
        const caption_value = if (caption) try @import("../body/caption.zig").Caption.parse(view.extra) else null;
        var caption_nonzero = false;
        if (caption_value) |value| for (value.extra) |byte| {
            if (byte != 0) caption_nonzero = true;
        };
        var nonzero = false;
        for (view.extra) |byte| if (byte != 0) {
            nonzero = true;
            break;
        };
        try out.append(a, .{ .kind = if (caption) .caption else .body, .control_node = control, .owner_node = group.parent_node, .list_node = group.header_node, .paragraph_count = group.paragraph_count, .attributes = view.attributes, .unknown = view.unknown, .extra_bytes = view.extra.len, .extra_nonzero = nonzero, .margins = if (text) |value| value.margins else null, .last_width = if (text) |value| value.last_width else null, .body_extra_bytes = if (text) |value| value.extra.len else null, .caption = if (caption_value) |value| .{ .flags = value.flags, .width = value.width, .gap = value.gap, .max_text_width = value.max_text_width, .extra_bytes = value.extra.len, .extra_nonzero = caption_nonzero } else null });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 drawing lists distinguish caption body and grouped ownership allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "textbox", "matrix", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        const expected = try read(a, bytes, source.header.version());
        defer a.free(expected);
        try std.testing.expectEqual(@as(usize, if (std.mem.eql(u8, name, "matrix")) 3 else 2), expected.len);
        if (std.mem.eql(u8, name, "textbox")) {
            try std.testing.expectEqual(.caption, expected[0].kind);
            try std.testing.expectEqual(.body, expected[1].kind);
        }
        if (std.mem.eql(u8, name, "shapecontainer-2")) {
            try std.testing.expectEqual(expected[0].control_node, expected[1].control_node);
            try std.testing.expectEqual(@as(usize, 19), expected[0].owner_node);
            try std.testing.expectEqual(@as(usize, 26), expected[1].owner_node);
            try std.testing.expect(expected[0].owner_node != expected[0].control_node + 1);
        }
        for (expected) |row| {
            if (row.kind == .caption) try std.testing.expectEqual(row.control_node, row.owner_node) else try std.testing.expect(row.owner_node > row.control_node);
            try std.testing.expect(row.list_node > row.owner_node);
        }
        try @import("../../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, values: []const Source) !void {
                const actual = try read(allocator, raw, version);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(values, actual);
            }
        }.run, .{ bytes, source.header.version(), expected });
    }
}
