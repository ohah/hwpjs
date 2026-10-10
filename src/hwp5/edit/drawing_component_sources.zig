//! 구성요소 원값 조회. 그룹 부모의 이동값을 합성하거나 크기를 보정하지 않습니다.
const std = @import("std");
const component = @import("../body/shape_component.zig");
const Version = @import("../version.zig").Version;
pub const Source = struct {
    component_node: usize,
    owner_node: usize,
    kind_id: u32,
    second_id: ?u32,
    offset_x: i32,
    offset_y: i32,
    group_count: u16,
    local_version: u16,
    original_width: u32,
    original_height: u32,
    current_width: u32,
    current_height: u32,
    attributes: u32,
    rotation_angle: i16,
    rotation_x: i32,
    rotation_y: i32,
    matrix_pairs: usize,
    extra_bytes: usize,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: Version) ![]Source {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    // 기존 검증기가 root/그룹 소유권과 직접 자식 순서를 단독으로 소유합니다.
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != component.tag) continue;
        const parent = node.parent orelse return error.OrphanShapeComponent;
        const shape = try component.Component.parse(node.record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, index));
        try out.append(a, .{
            .component_node = index,
            .owner_node = parent,
            .kind_id = shape.id,
            .second_id = shape.second_id,
            .offset_x = shape.offset_x,
            .offset_y = shape.offset_y,
            .group_count = shape.group_count,
            .local_version = shape.local_version,
            .original_width = shape.original_width,
            .original_height = shape.original_height,
            .current_width = shape.current_width,
            .current_height = shape.current_height,
            .attributes = shape.attributes,
            .rotation_angle = shape.rotation_angle,
            .rotation_x = shape.rotation_x,
            .rotation_y = shape.rotation_y,
            .matrix_pairs = shape.rendering.pairs.count(),
            .extra_bytes = shape.extra.len,
        });
    }
    return out.toOwnedSlice(a);
}

test "HWP5 component inventory actual grouped offsets and allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "shapecontainer-2", "matrix", "textbox" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const rows = try read(a, raw, source.header.version());
        defer a.free(rows);
        const session = try @import("style_preservation.zig").Session.open(a, input);
        defer session.close();
        const queried = try session.drawingComponentSources(a, 0);
        defer a.free(queried);
        try std.testing.expectEqualDeep(rows, queried);
        try std.testing.expectError(error.InvalidSection, session.drawingComponentSources(a, 999));
        var tree = try @import("../body/tree.zig").Tree.parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        var count: usize = 0;
        for (tree.nodes) |node| count += @intFromBool(node.record.framing.tag == 76);
        try std.testing.expectEqual(count, rows.len);
        for (rows) |row| {
            const node = tree.nodes[row.component_node];
            try std.testing.expectEqual(node.parent.?, row.owner_node);
            const root = tree.nodes[row.owner_node].record.value == .control_header;
            const payload = node.record.framing.payload;
            const base: usize = if (root) 8 else 4;
            try std.testing.expectEqual(std.mem.readInt(u32, payload[0..4], .little), row.kind_id);
            try std.testing.expectEqual(if (root) @as(?u32, std.mem.readInt(u32, payload[4..8], .little)) else null, row.second_id);
            inline for (.{ .{ "offset_x", 0, i32 }, .{ "offset_y", 4, i32 }, .{ "group_count", 8, u16 }, .{ "local_version", 10, u16 }, .{ "original_width", 12, u32 }, .{ "original_height", 16, u32 }, .{ "current_width", 20, u32 }, .{ "current_height", 24, u32 }, .{ "attributes", 28, u32 }, .{ "rotation_angle", 32, i16 }, .{ "rotation_x", 34, i32 }, .{ "rotation_y", 38, i32 } }) |field| {
                try std.testing.expectEqual(std.mem.readInt(field[2], payload[base + field[1] ..][0..@sizeOf(field[2])], .little), @field(row, field[0]));
            }
            const pairs = std.mem.readInt(u16, payload[base + 42 ..][0..2], .little);
            try std.testing.expectEqual(pairs, row.matrix_pairs);
            try std.testing.expectEqual(payload.len - (base + 92 + @as(usize, pairs) * 96), row.extra_bytes);
        }
        if (std.mem.eql(u8, name, "shapecontainer-2")) {
            try std.testing.expectEqual(@as(usize, 6), rows.len);
            try std.testing.expectEqual(@as(usize, 13), rows[2].owner_node);
            try std.testing.expectEqual(@as(usize, 18), rows[4].owner_node);
            // 부모 이동값을 더하지 않고 저장된 자식 자신의 값을 비교합니다.
            try std.testing.expectEqual(@as(i32, 9071), rows[4].offset_x);
            // 자식 종류를 바꾸면 그룹 선언의 ID 순서 검증이 실패해야 합니다.
            const corrupted = try a.dupe(u8, raw);
            defer a.free(corrupted);
            const payload = tree.nodes[rows[4].component_node].record.framing.payload;
            const offset = @intFromPtr(payload.ptr) - @intFromPtr(raw.ptr);
            std.mem.writeInt(u32, corrupted[offset..][0..4], @import("../body/control_rules.zig").id("$pic"), .little);
            try std.testing.expectError(error.GroupChildIdentityMismatch, read(a, corrupted, source.header.version()));
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version, expected: []const Source) !void {
                const actual = try read(allocator, bytes, version);
                defer allocator.free(actual);
                try std.testing.expectEqualDeep(expected, actual);
            }
        }.run, .{ raw, source.header.version(), rows });
    }
}
