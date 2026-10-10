//! 편집 모델의 크기와 행렬을 기존 payload writer로 구역에 투영합니다.
const std = @import("std");
const Version = @import("../version.zig").Version;
const model = @import("../../model/document.zig");

pub fn write(a: std.mem.Allocator, source: []const u8, version: Version, value: model.PictureCurrentSize, limit: usize) ![]u8 {
    const matrices = value.resize_matrices orelse return error.MissingPictureResizeMatrices;
    const output = try @import("picture_current_size_section.zig").write(a, source, version, value.source_picture_node, .{ .width = value.width, .height = value.height }, limit);
    errdefer a.free(output);
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    const root = try @import("picture_size_protection.zig").rootOwner(tree, value.source_picture_node);
    const properties = try @import("../body/object_common.zig").Properties.parse(tree.nodes[root].record.value.control_header.properties);
    if (properties.sizeProtected()) return error.PictureSizeProtected;
    const component_node = tree.nodes[value.source_picture_node].parent.?;
    const layout = try @import("../body/shape_validation.zig").componentLayout(tree, component_node);
    if ((layout == .double_id) != (matrices.display != null)) return error.InvalidPictureDisplayOwner;
    const record = tree.nodes[component_node].record.framing;
    const offset = record.offset + record.raw.len - record.payload.len;
    const translated = try @import("drawing_matrix_payload.zig").write(a, output[offset..][0..record.payload.len], layout, .translation, matrices.translation, record.payload.len);
    defer a.free(translated);
    const scaled = try @import("drawing_matrix_payload.zig").write(a, translated, layout, .{ .scale = matrices.scale_index }, matrices.scale, record.payload.len);
    defer a.free(scaled);
    @memcpy(output[offset..][0..scaled.len], scaled);
    if (matrices.display) |display| {
        const control = tree.nodes[root].record.framing;
        const displayed = try @import("object_size_payload.zig").write(a, control.payload, display, control.payload.len);
        defer a.free(displayed);
        const at = control.offset + control.raw.len - control.payload.len;
        @memcpy(output[at..][0..displayed.len], displayed);
    }
    return output;
}

test "HWP5 typed picture geometry projection matches fourteen resize outputs and allocation failures" {
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
        for (pictures) |picture| {
            const intent = try @import("picture_resize_values.zig").prepare(a, raw, version, @intCast(picture.picture_node), .{ 10000, 6000 }, raw.len);
            const expected = try @import("picture_resize_section.zig").write(a, raw, version, picture.picture_node, .{ 10000, 6000 }, raw.len);
            defer a.free(expected);
            const actual = try @import("picture_current_size_section.zig").writeAll(a, raw, version, &.{intent}, raw.len);
            defer a.free(actual);
            try std.testing.expectEqualSlices(u8, expected, actual);
            if (count == 0) {
                try std.testing.checkAllAllocationFailures(a, struct {
                    fn run(allocator: std.mem.Allocator, bytes: []const u8, v: Version, edit: model.PictureCurrentSize, expected_bytes: []const u8) !void {
                        const result = try write(allocator, bytes, v, edit, bytes.len);
                        defer allocator.free(result);
                        try std.testing.expectEqualSlices(u8, expected_bytes, result);
                    }
                }.run, .{ raw, version, intent, expected });
                var invalid = intent;
                invalid.resize_matrices.?.scale_index = std.math.maxInt(u16);
                try std.testing.expectError(error.InvalidMatrixIndex, write(a, raw, version, invalid, raw.len));
                invalid = intent;
                invalid.resize_matrices.?.translation[0] = std.math.nan(f64);
                try std.testing.expectError(error.NonFiniteMatrix, write(a, raw, version, invalid, raw.len));
            }
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 14), count);
}
