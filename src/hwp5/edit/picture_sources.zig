//! Original picture declarations. Resource bytes and page placement are separate.
const std = @import("std");
const Picture = @import("../body/shape_picture.zig");
pub const Source = struct {
    component_node: usize,
    owner_node: usize,
    picture_node: usize,
    border_color: u32,
    border_width: i32,
    border_attributes: u32,
    points: [4][2]i32,
    crop: [4]i32,
    margins: [4]i16,
    contrast: i8,
    brightness: i8,
    effect: u8,
    bin_data_id: u16,
    border_opacity: ?u8,
    instance_id: ?u32,
    extra_bytes: usize,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, prefix: Picture.Prefix) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/picture_validation.zig").inspect(tree, .{ .prefix = prefix }, null);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != Picture.tag) continue;
        const component = node.parent orelse return error.OrphanPicture;
        const owner = tree.nodes[component].parent orelse return error.OrphanShapeComponent;
        const p = try Picture.Picture.parse(node.record.framing.payload, .interleaved, prefix);
        var points: [4][2]i32 = undefined;
        for (&points, 0..) |*point, i| {
            const value = p.points.get(i).?;
            point.* = .{ value.x, value.y };
        }
        try out.append(a, .{ .component_node = component, .owner_node = owner, .picture_node = index, .border_color = p.border_color, .border_width = p.border_width, .border_attributes = p.border_attributes, .points = points, .crop = p.crop, .margins = p.margins, .contrast = p.image.contrast, .brightness = p.image.brightness, .effect = p.image.effect, .bin_data_id = p.image.bin_data_id, .border_opacity = p.border_opacity, .instance_id = p.instance_id, .extra_bytes = p.extra.len });
    }
    return out.toOwnedSlice(a);
}
test "picture sources actual fixed fields grouped ownership and allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "sample-5017", "shapecontainer-2", "sample-5017-pics" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var document = try @import("../text_source.zig").Source.open(a, input);
        defer document.deinit();
        const raw = try document.decodeSection(a, 0);
        defer a.free(raw);
        const expected = try read(a, raw, document.header.version(), .base73);
        defer a.free(expected);
        try std.testing.expectEqual(@as(usize, if (std.mem.eql(u8, name, "sample-5017")) 2 else if (std.mem.eql(u8, name, "sample-5017-pics")) 11 else 1), expected.len);
        const session = try @import("style_preservation.zig").Session.open(a, input);
        defer session.close();
        const queried = try session.pictureSources(a, 0, .base73);
        defer a.free(queried);
        try std.testing.expectEqualDeep(expected, queried);
        try std.testing.expectError(error.InvalidSection, session.pictureSources(a, 999, .base73));
        var tree = try @import("source_tree.zig").parse(a, raw, document.header.version(), .{});
        defer tree.deinit(a);
        for (expected) |row| {
            const bytes = tree.nodes[row.picture_node].record.framing.payload;
            try std.testing.expectEqual(std.mem.readInt(u32, bytes[0..4], .little), row.border_color);
            try std.testing.expectEqual(std.mem.readInt(i32, bytes[4..8], .little), row.border_width);
            try std.testing.expectEqual(std.mem.readInt(u32, bytes[8..12], .little), row.border_attributes);
            for (row.points, 0..) |point, i| {
                try std.testing.expectEqual(std.mem.readInt(i32, bytes[12 + i * 8 ..][0..4], .little), point[0]);
                try std.testing.expectEqual(std.mem.readInt(i32, bytes[16 + i * 8 ..][0..4], .little), point[1]);
            }
            try std.testing.expectEqual(std.mem.readInt(u16, bytes[71..73], .little), row.bin_data_id);
            for (row.crop, 0..) |value, i| try std.testing.expectEqual(std.mem.readInt(i32, bytes[44 + i * 4 ..][0..4], .little), value);
            for (row.margins, 0..) |value, i| try std.testing.expectEqual(std.mem.readInt(i16, bytes[60 + i * 2 ..][0..2], .little), value);
            try std.testing.expectEqual(@as(i8, @bitCast(bytes[68])), row.contrast);
            try std.testing.expectEqual(@as(i8, @bitCast(bytes[69])), row.brightness);
            try std.testing.expectEqual(bytes[70], row.effect);
            try std.testing.expectEqual(bytes.len - 73, row.extra_bytes);
            try std.testing.expectEqual(null, row.border_opacity);
            try std.testing.expectEqual(null, row.instance_id);
            try std.testing.expect(row.owner_node < row.component_node and row.component_node < row.picture_node);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, wanted: []const Source) !void {
                const actual = try read(allocator, bytes, version, .base73);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(wanted, actual);
            }
        }.run, .{ raw, document.header.version(), expected });
    }
}
