//! 그림 소유 레코드 선택과 구역 바이트 교체. Session/보호 정책은 상위 책임입니다.
const std = @import("std");
const Version = @import("../version.zig").Version;
const payload_writer = @import("drawing_current_size_payload.zig");

pub fn writeAll(a: std.mem.Allocator, source: []const u8, version: Version, sizes: []const @import("../../model/document.zig").PictureCurrentSize, limit: usize) ![]u8 {
    if (source.len > limit) return error.LimitExceeded;
    var current = try a.dupe(u8, source);
    errdefer a.free(current);
    for (sizes, 0..) |size, index| {
        for (sizes[0..index]) |prior| if (prior.source_picture_node == size.source_picture_node) return error.DuplicatePictureEdit;
        const next = if (size.resize_matrices != null)
            try @import("picture_geometry_section.zig").write(a, current, version, size, limit)
        else
            try write(a, current, version, size.source_picture_node, .{ .width = size.width, .height = size.height }, limit);
        a.free(current);
        current = next;
    }
    return current;
}

pub fn write(a: std.mem.Allocator, source: []const u8, version: Version, picture_node: usize, size: payload_writer.Size, limit: usize) ![]u8 {
    if (source.len > limit) return error.LimitExceeded;
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    if (picture_node >= tree.nodes.len or tree.nodes[picture_node].record.framing.tag != @import("../body/shape_picture.zig").tag) return error.InvalidPictureOwner;
    const component_node = tree.nodes[picture_node].parent orelse return error.InvalidPictureOwner;
    const owned_picture = try @import("../body/owned_record.zig").componentChild(tree, component_node, @import("../body/control_rules.zig").id("$pic"), @import("../body/shape_picture.zig").tag);
    if (owned_picture != picture_node) return error.InvalidPictureOwner;
    const layout = try @import("../body/shape_validation.zig").componentLayout(tree, component_node);
    const record = tree.nodes[component_node].record.framing;
    const replacement = try payload_writer.write(a, record.payload, layout, size, record.payload.len);
    defer a.free(replacement);
    const output = try a.dupe(u8, source);
    const offset = record.offset + record.raw.len - record.payload.len;
    @memcpy(output[offset..][0..replacement.len], replacement);
    return output;
}

test "HWP5 picture current size section actual root and group records reparse with non-target bytes unchanged" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const version = source.header.version();
        const pictures = try @import("picture_sources.zig").read(a, raw, version, .base73);
        defer a.free(pictures);
        var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
        defer tree.deinit(a);
        for (pictures) |picture| {
            const node = tree.nodes[picture.component_node];
            const layout = try @import("../body/shape_validation.zig").componentLayout(tree, picture.component_node);
            const original = try @import("../body/shape_component.zig").Component.parse(node.record.framing.payload, layout);
            const same = try write(a, raw, version, picture.picture_node, .{ .width = original.current_width, .height = original.current_height }, raw.len);
            defer a.free(same);
            try std.testing.expectEqualSlices(u8, raw, same);
            const changed = try write(a, raw, version, picture.picture_node, .{ .width = 10000, .height = 6000 }, raw.len);
            defer a.free(changed);
            const offset = node.record.framing.offset + node.record.framing.raw.len - node.record.framing.payload.len + original.current_size_offset;
            try std.testing.expectEqualSlices(u8, raw[0..offset], changed[0..offset]);
            try std.testing.expectEqualSlices(u8, raw[offset + 8 ..], changed[offset + 8 ..]);
            var reopened = try @import("../body/tree.zig").Tree.parse(a, changed, version, .{});
            defer reopened.deinit(a);
            _ = try @import("../body/shape_validation.zig").inspect(reopened);
            const current = try @import("../body/shape_component.zig").Component.parse(reopened.nodes[picture.component_node].record.framing.payload, layout);
            try std.testing.expectEqual(@as(u32, 10000), current.current_width);
            try std.testing.expectEqual(@as(u32, 6000), current.current_height);
            const restored = try write(a, changed, version, picture.picture_node, .{ .width = original.current_width, .height = original.current_height }, raw.len);
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, raw, restored);
            count += 1;
        }
        try std.testing.expectError(error.InvalidPictureOwner, write(a, raw, version, tree.nodes.len, .{ .width = 1, .height = 2 }, raw.len));
        try std.testing.expectError(error.InvalidPictureOwner, write(a, raw, version, pictures[0].component_node, .{ .width = 1, .height = 2 }, raw.len));
        try std.testing.expectError(error.LimitExceeded, write(a, raw, version, pictures[0].picture_node, .{ .width = 1, .height = 2 }, raw.len - 1));
    }
    try std.testing.expectEqual(@as(usize, 14), count);
}
