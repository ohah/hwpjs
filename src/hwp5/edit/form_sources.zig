//! Owned original form metadata; current edit coordinates and paint are separate.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Source = struct {
    control_node: usize,
    object_node: usize,
    paragraph_node: usize,
    source_unit: usize,
    kind: @import("../body/form_object.zig").Kind,
    type_id: u32,
    secondary_type_id: u32,
    raw_length: u32,
    flags: u32,
    offset_x: i32,
    offset_y: i32,
    width: u32,
    height: u32,
    z_order: i32,
    margins: [4]i16,
    instance_id: u32,
    prevent_page_break: i32,
    description_bytes: ?usize,
    common_extra_bytes: usize,
    envelope_extra_bytes: usize,
    property_bytes: usize,
    property_nodes: usize,
    other_direct_children: usize,
};

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: Version) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, bytes, version, .{});
    defer tree.deinit(a);
    var report = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer report.deinit(a);
    const result = try a.alloc(Source, report.forms.forms.len);
    errdefer a.free(result);
    for (report.forms.forms, report.links, result) |form, link, *row| {
        if (form.control_node != link.control_node) return error.FormSourceBindingMismatch;
        row.* = .{
            .control_node = form.control_node,
            .object_node = form.object_node,
            .paragraph_node = link.paragraph_node,
            .source_unit = link.start_unit,
            .kind = form.envelope.kind(),
            .type_id = std.mem.readInt(u32, &form.envelope.type_id, .little),
            .secondary_type_id = std.mem.readInt(u32, &form.envelope.secondary_type_id, .little),
            .raw_length = form.envelope.raw_length,
            .flags = form.common.flags,
            .offset_x = form.common.offset_x,
            .offset_y = form.common.offset_y,
            .width = form.common.width,
            .height = form.common.height,
            .z_order = form.common.z_order,
            .margins = form.common.margins,
            .instance_id = form.common.instance_id,
            .prevent_page_break = form.common.prevent_page_break,
            .description_bytes = if (form.common.description_utf16) |value| value.len else null,
            .common_extra_bytes = form.common.extra.len,
            .envelope_extra_bytes = form.envelope.extra.len,
            .property_bytes = form.envelope.properties.len,
            .property_nodes = form.properties.nodes.len,
            .other_direct_children = form.other_direct_children,
        };
    }
    return result;
}

test "HWP5 owned form sources bind real calendar controls without changing the input" {
    const a = std.testing.allocator;
    inline for (.{ .{ "calendar_monthly", @as(usize, 4) }, .{ "calendar_year", @as(usize, 3) } }) |example| {
        const path = try std.fmt.allocPrint(a, "reference/rhwp/samples/basic/{s}.hwp", .{example[0]});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        const original = try a.dupe(u8, bytes);
        defer a.free(original);
        const rows = try read(a, bytes, source.header.version());
        defer a.free(rows);
        try std.testing.expectEqual(example[1], rows.len);
        var tree = try @import("source_tree.zig").parse(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        for (rows) |row| {
            const payload = tree.nodes[row.control_node].record.framing.payload;
            try std.testing.expectEqual(@as(u32, 0x666f726d), std.mem.readInt(u32, payload[0..4], .little));
            try std.testing.expectEqual(std.mem.readInt(u32, payload[4..8], .little), row.flags);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[16..20], .little), row.width);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[20..24], .little), row.height);
            try std.testing.expectEqual(tree.nodes[row.control_node].parent.?, row.paragraph_node);
            try std.testing.expectEqual(tree.nodes[row.object_node].parent.?, row.control_node);
            var checked_token = false;
            for (tree.nodes) |node| {
                if (node.parent != row.paragraph_node or node.record.value != .text) continue;
                const raw_text = node.record.framing.payload;
                const at = row.source_unit * 2;
                try std.testing.expect(at + 16 <= raw_text.len);
                try std.testing.expectEqual(@as(u16, 11), std.mem.readInt(u16, raw_text[at..][0..2], .little));
                try std.testing.expectEqual(@as(u32, 0x666f726d), std.mem.readInt(u32, raw_text[at + 2 ..][0..4], .little));
                checked_token = true;
            }
            try std.testing.expect(checked_token);
            try std.testing.expect(row.kind != .unknown);
            try std.testing.expect(row.property_bytes > 0 and row.property_nodes > 0);
        }
        try std.testing.expectEqualSlices(u8, original, bytes);
        if (example[1] == 4) try @import("../../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: Version, expected: []const Source) !void {
                const actual = try read(allocator, raw, version);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(expected, actual);
            }
        }.run, .{ bytes, source.header.version(), rows });
    }
}
