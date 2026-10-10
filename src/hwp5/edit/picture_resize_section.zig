//! 로컬 축/표시 크기를 한 구역 사본에 반영합니다. Session 저장/이력은 별도입니다.
const std = @import("std");
const Version = @import("../version.zig").Version;

pub fn write(a: std.mem.Allocator, source: []const u8, version: Version, picture_node: usize, target: [2]u32, limit: usize) ![]u8 {
    if (source.len > limit) return error.LimitExceeded;
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    const root = try @import("picture_size_protection.zig").rootOwner(tree, picture_node);
    const control = tree.nodes[root].record;
    const properties = try @import("../body/object_common.zig").Properties.parse(control.value.control_header.properties);
    if (properties.sizeProtected()) return error.PictureSizeProtected;
    if ((properties.flags >> 15) & 7 != 4 or (properties.flags >> 18) & 3 != 2) return error.UnsupportedRelativePictureResize;
    const component_node = tree.nodes[picture_node].parent.?;
    const layout = try @import("../body/shape_validation.zig").componentLayout(tree, component_node);
    const record = tree.nodes[component_node].record.framing;
    const resized = try @import("picture_resize_component.zig").write(a, record.payload, layout, tree.nodes[picture_node].record.framing.payload, target, record.payload.len);
    defer a.free(resized);
    const displayed = if (layout == .double_id) try @import("object_size_payload.zig").write(a, control.framing.payload, target, control.framing.payload.len) else null;
    defer if (displayed) |bytes| a.free(bytes);
    const output = try a.dupe(u8, source);
    const offset = record.offset + record.raw.len - record.payload.len;
    @memcpy(output[offset..][0..resized.len], resized);
    if (displayed) |bytes| {
        const at = control.framing.offset + control.framing.raw.len - control.framing.payload.len;
        @memcpy(output[at..][0..bytes.len], bytes);
    }
    return output;
}

test "HWP5 picture resize section actual fourteen root and group targets preserve picture data and parent declarations" {
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
        var before = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
        defer before.deinit(a);
        for (pictures) |picture| {
            const changed = try write(a, raw, version, picture.picture_node, .{ 10000, 6000 }, raw.len);
            defer a.free(changed);
            const repeated = try write(a, changed, version, picture.picture_node, .{ 10000, 6000 }, changed.len);
            defer a.free(repeated);
            try std.testing.expectEqualSlices(u8, changed, repeated);
            var after = try @import("../body/tree.zig").Tree.parse(a, changed, version, .{});
            defer after.deinit(a);
            const layout = try @import("../body/shape_validation.zig").componentLayout(after, picture.component_node);
            const root = try @import("picture_size_protection.zig").rootOwner(after, picture.picture_node);
            const common = try @import("../body/object_common.zig").Properties.parse(after.nodes[root].record.value.control_header.properties);
            if (layout == .double_id) {
                try std.testing.expectEqual(@as(u32, 10000), common.width);
                try std.testing.expectEqual(@as(u32, 6000), common.height);
            } else try std.testing.expectEqualSlices(u8, before.nodes[root].record.framing.raw, after.nodes[root].record.framing.raw);
            for (before.nodes, after.nodes, 0..) |original, saved, index| {
                if (index == picture.component_node or (layout == .double_id and index == root)) continue;
                try std.testing.expectEqualSlices(u8, original.record.framing.raw, saved.record.framing.raw);
            }
            const current = try @import("../body/shape_component.zig").Component.parse(after.nodes[picture.component_node].record.framing.payload, layout);
            try std.testing.expectEqual(@as(u32, 10000), current.current_width);
            try std.testing.expectEqual(@as(u32, 6000), current.current_height);
            if (count == 0) {
                try std.testing.checkAllAllocationFailures(a, struct {
                    fn run(allocator: std.mem.Allocator, bytes: []const u8, selected_version: Version, node: usize, expected: []const u8) !void {
                        const result = try write(allocator, bytes, selected_version, node, .{ 10000, 6000 }, bytes.len);
                        defer allocator.free(result);
                        try std.testing.expectEqualSlices(u8, expected, result);
                    }
                }.run, .{ raw, version, picture.picture_node, changed });
                try std.testing.expectError(error.InvalidPictureOwner, write(a, raw, version, 0, .{ 10000, 6000 }, raw.len));
                try std.testing.expectError(error.LimitExceeded, write(a, raw, version, picture.picture_node, .{ 10000, 6000 }, raw.len - 1));
                const protected = try a.dupe(u8, raw);
                defer a.free(protected);
                const root_record = before.nodes[root].record.framing;
                const at = root_record.offset + root_record.raw.len - root_record.payload.len + 4;
                const original_flags = std.mem.readInt(u32, protected[at..][0..4], .little);
                const flags = (original_flags & ~(@as(u32, 3) << 3)) | (@as(u32, 2) << 3) | (@as(u32, 1) << 20);
                std.mem.writeInt(u32, protected[at..][0..4], flags, .little);
                try std.testing.expectError(error.PictureSizeProtected, write(a, protected, version, picture.picture_node, .{ 10000, 6000 }, protected.len));
                std.mem.writeInt(u32, protected[at..][0..4], original_flags & ~(@as(u32, 7) << 15), .little);
                try std.testing.expectError(error.UnsupportedRelativePictureResize, write(a, protected, version, picture.picture_node, .{ 10000, 6000 }, protected.len));
            }
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 14), count);
}
