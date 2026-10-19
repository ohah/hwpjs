//! Explicit instance prefix + effects + selected additional properties, not a length heuristic.
const std = @import("std");
const AdditionalLayout = @import("../body/picture_additional.zig").Layout;
pub const Source = struct {
    component_node: usize,
    owner_node: usize,
    picture_node: usize,
    border_opacity: u8,
    instance_id: u32,
    effects_flags: u32,
    image_width: ?u32,
    image_height: ?u32,
    image_alpha: ?i8,
    extra_bytes: usize,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, additional: ?AdditionalLayout) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    _ = try @import("../body/picture_validation.zig").inspect(tree, .{ .prefix = .with_instance78, .tail = .{ .additional = additional } }, null);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 85) continue;
        const component = node.parent orelse return error.OrphanPicture;
        const owner = tree.nodes[component].parent orelse return error.OrphanShapeComponent;
        const picture = try @import("../body/shape_picture.zig").Picture.parse(node.record.framing.payload, .interleaved, .with_instance78);
        var reader: @import("../../binary/reader.zig").Reader = .{ .bytes = picture.extra };
        const tail = try @import("../body/picture_tail.zig").Tail.read(&reader, additional);
        try out.append(a, .{ .component_node = component, .owner_node = owner, .picture_node = index, .border_opacity = picture.border_opacity.?, .instance_id = picture.instance_id.?, .effects_flags = tail.effects.flags, .image_width = if (tail.properties) |p| p.width else null, .image_height = if (tail.properties) |p| p.height else null, .image_alpha = if (tail.properties) |p| p.alpha else null, .extra_bytes = reader.bytes.len - reader.offset });
    }
    return out.toOwnedSlice(a);
}
test "picture tail sources actual zero dimensions absence and allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var document = try @import("../text_source.zig").Source.open(a, input);
        defer document.deinit();
        const raw = try document.decodeSection(a, 0);
        defer a.free(raw);
        var tree = try @import("source_tree.zig").parse(a, raw, document.header.version(), .{});
        defer tree.deinit(a);
        const expected = try read(a, raw, document.header.version(), .with_alpha9);
        defer a.free(expected);
        try std.testing.expect(expected.len > 0);
        const session = try @import("style_preservation.zig").Session.open(a, input);
        defer session.close();
        const queried = try session.pictureTailSources(a, 0, .with_alpha9);
        defer a.free(queried);
        try std.testing.expectEqualDeep(expected, queried);
        try std.testing.expectError(error.InvalidSection, session.pictureTailSources(a, 999, .with_alpha9));
        for (expected) |row| {
            const bytes = tree.nodes[row.picture_node].record.framing.payload;
            try std.testing.expectEqual(bytes[73], row.border_opacity);
            try std.testing.expectEqual(std.mem.readInt(u32, bytes[74..78], .little), row.instance_id);
            try std.testing.expectEqual(std.mem.readInt(u32, bytes[78..82], .little), row.effects_flags);
            try std.testing.expectEqual(@as(?u32, std.mem.readInt(u32, bytes[82..86], .little)), row.image_width);
            try std.testing.expectEqual(@as(?u32, std.mem.readInt(u32, bytes[86..90], .little)), row.image_height);
            try std.testing.expectEqual(@as(?i8, @bitCast(bytes[90])), row.image_alpha);
            try std.testing.expectEqual(0, row.extra_bytes);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, values: []const Source) !void {
                const actual = try read(allocator, bytes, version, .with_alpha9);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(values, actual);
            }
        }.run, .{ raw, document.header.version(), expected });
        const absent = try read(a, raw, document.header.version(), null);
        defer a.free(absent);
        const dimensions = try read(a, raw, document.header.version(), .dimensions8);
        defer a.free(dimensions);
        for (absent, dimensions, expected) |old, dim, full| {
            try std.testing.expectEqual(null, old.image_width);
            try std.testing.expectEqual(null, old.image_height);
            try std.testing.expectEqual(null, old.image_alpha);
            try std.testing.expectEqual(9, old.extra_bytes);
            try std.testing.expectEqual(full.image_width, dim.image_width);
            try std.testing.expectEqual(full.image_height, dim.image_height);
            try std.testing.expectEqual(null, dim.image_alpha);
            try std.testing.expectEqual(1, dim.extra_bytes);
        }
        const malformed = try a.dupe(u8, raw);
        defer a.free(malformed);
        const payload = tree.nodes[expected[expected.len - 1].picture_node].record.framing.payload;
        const at = @intFromPtr(payload.ptr) - @intFromPtr(raw.ptr) + 78;
        std.mem.writeInt(u32, malformed[at..][0..4], 16, .little);
        const before = std.hash.Wyhash.hash(0, malformed);
        try std.testing.expectError(error.UnsupportedPictureEffects, read(a, malformed, document.header.version(), .with_alpha9));
        try std.testing.expectEqual(before, std.hash.Wyhash.hash(0, malformed));
    }
}
