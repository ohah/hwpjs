//! resize 출력에서 편집 가능 크기/선택 행렬 값을 추출합니다. 저장 payload 캐시는 없습니다.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Edit = @import("picture_current_size_values.zig").Edit;

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, edit: Edit, limit: usize) !void {
    if (edit.picture_node >= section.source_record_count) return error.InvalidPictureOwner;
    const current = section.picture_current_sizes orelse &.{};
    const projected = try @import("picture_current_size_section.zig").writeAll(a, source, version, current, limit);
    defer a.free(projected);
    const resized = try @import("picture_resize_section.zig").write(a, projected, version, edit.picture_node, .{ edit.width, edit.height }, limit);
    defer a.free(resized);
    if (std.mem.eql(u8, projected, resized)) return;
    const value = try extract(a, resized, version, edit.picture_node, .{ edit.width, edit.height });
    for (current, 0..) |prior, index| if (prior.source_picture_node == edit.picture_node) {
        section.picture_current_sizes.?[index] = value;
        return;
    };
    if (current.len >= 100_000) return error.LimitExceeded;
    const next = try a.alloc(model.PictureCurrentSize, current.len + 1);
    @memcpy(next[0..current.len], current);
    next[current.len] = value;
    if (section.picture_current_sizes) |owned| a.free(owned);
    section.picture_current_sizes = next;
}

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, picture_node: u32, target: [2]u32, limit: usize) !model.PictureCurrentSize {
    const changed = try @import("picture_resize_section.zig").write(a, source, version, picture_node, target, limit);
    defer a.free(changed);
    return extract(a, changed, version, picture_node, target);
}

fn extract(a: std.mem.Allocator, changed: []const u8, version: Version, picture_node: u32, target: [2]u32) !model.PictureCurrentSize {
    var tree = try @import("../body/tree.zig").Tree.parse(a, changed, version, .{});
    defer tree.deinit(a);
    const component_node = tree.nodes[picture_node].parent.?;
    const layout = try @import("../body/shape_validation.zig").componentLayout(tree, component_node);
    const parsed = try @import("../body/shape_component.zig").Component.parse(tree.nodes[component_node].record.framing.payload, layout);
    const index = parsed.rendering.pairs.count() - 1;
    var matrices: model.PictureResizeMatrices = .{ .translation = undefined, .scale = undefined, .scale_index = @intCast(index), .display = if (layout == .double_id) target else null };
    for (parsed.rendering.translation.bits, &matrices.translation) |bits, *value| value.* = @bitCast(bits);
    for (parsed.rendering.pairs.get(index).?.scale.bits, &matrices.scale) |bits, *value| value.* = @bitCast(bits);
    return .{ .source_picture_node = picture_node, .width = target[0], .height = target[1], .resize_matrices = matrices };
}

test "HWP5 resize editable values actual direct and group own matrices independently from source" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "sample-5017", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
        defer a.free(pictures);
        const intent = try prepare(a, raw, source.header.version(), @intCast(pictures[0].picture_node), .{ 10000, 6000 }, raw.len);
        try std.testing.expectEqual(@as(u32, 10000), intent.width);
        try std.testing.expectEqual(@as(u32, 6000), intent.height);
        try std.testing.expectEqual(std.mem.eql(u8, name, "sample-5017"), intent.resize_matrices.?.display != null);
        for (intent.resize_matrices.?.translation) |value| try std.testing.expect(std.math.isFinite(value));
        for (intent.resize_matrices.?.scale) |value| try std.testing.expect(std.math.isFinite(value));
    }
}
