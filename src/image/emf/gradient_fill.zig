const std = @import("std");
const geometry = @import("geometry.zig");
const gradient_fill_mode = @import("gradient_fill_mode.zig");
const gradient_mesh = @import("gradient_mesh.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");
const tri_vertex = @import("tri_vertex.zig");

const fixed_size: usize = 36;

pub const GradientFill = struct {
    bounds: geometry.RectL,
    vertex_count: u32,
    mesh_count: u32,
    mode: gradient_fill_mode.GradientFillMode,
    vertex_bytes: []const u8,
    mesh_bytes: []const u8,
    trailing_data: []const u8,

    pub fn vertex(self: GradientFill, index: usize) !tri_vertex.TriVertex {
        if (index >= self.vertex_count) return error.EmfGradientVertexIndexOutOfBounds;
        const start = index * tri_vertex.byte_size;
        return tri_vertex.parse(self.vertex_bytes[start .. start + tri_vertex.byte_size]);
    }

    pub fn mesh(self: GradientFill, index: usize) !gradient_mesh.Mesh {
        if (index >= self.mesh_count) return error.EmfGradientMeshIndexOutOfBounds;
        const start = index * gradient_mesh.byte_size;
        return gradient_mesh.parse(self.mesh_bytes[start .. start + gradient_mesh.byte_size], self.mode, self.vertex_count);
    }
};

pub fn parse(record: records.Record) !?GradientFill {
    if (record.kind != .gradientfill) return null;
    if (!record_extent.hasRequiredPrefix(record, fixed_size)) return error.InvalidEmfGradientFillSize;
    const vertex_count = std.mem.readInt(u32, record.bytes[24..28], .little);
    const mesh_count = std.mem.readInt(u32, record.bytes[28..32], .little);
    const mode = try gradient_fill_mode.parse(std.mem.readInt(u32, record.bytes[32..36], .little));
    const vertices_end: u64 = fixed_size + @as(u64, vertex_count) * tri_vertex.byte_size;
    const semantic_end_u64 = vertices_end + @as(u64, mesh_count) * gradient_mesh.byte_size;
    const semantic_end = record_extent.requiredEnd(record, semantic_end_u64) orelse return error.InvalidEmfGradientFillSize;
    const vertices_end_usize: usize = @intCast(vertices_end);
    const value: GradientFill = .{
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .vertex_count = vertex_count,
        .mesh_count = mesh_count,
        .mode = mode,
        .vertex_bytes = record.bytes[fixed_size..vertices_end_usize],
        .mesh_bytes = record.bytes[vertices_end_usize..semantic_end],
        .trailing_data = record.bytes[semantic_end..],
    };
    for (0..mesh_count) |index| _ = try value.mesh(index);
    return value;
}

fn fixture(bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = .gradientfill, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn expectParsed(record: records.Record) !GradientFill {
    return (try parse(record)) orelse error.ExpectedEmfGradientFill;
}

test "GRADIENTFILL separates rectangle mesh padding and trailing data" {
    var bytes = [_]u8{0} ** 84;
    std.mem.writeInt(i32, bytes[8..12], -4, .little);
    std.mem.writeInt(i32, bytes[20..24], 5, .little);
    std.mem.writeInt(u32, bytes[24..28], 2, .little);
    std.mem.writeInt(u32, bytes[28..32], 1, .little);
    std.mem.writeInt(u32, bytes[32..36], @intFromEnum(gradient_fill_mode.GradientFillMode.rectangle_horizontal), .little);
    std.mem.writeInt(i32, bytes[36..40], -2, .little);
    std.mem.writeInt(u16, bytes[44..46], 0x1122, .little);
    std.mem.writeInt(u16, bytes[50..52], 0x7788, .little);
    std.mem.writeInt(u32, bytes[68..72], 0, .little);
    std.mem.writeInt(u32, bytes[72..76], 1, .little);
    bytes[76..80].* = .{ 9, 8, 7, 6 };
    bytes[80..84].* = .{ 1, 2, 3, 4 };

    const value = try expectParsed(fixture(&bytes));
    try std.testing.expectEqual(@as(i32, -4), value.bounds.left);
    try std.testing.expectEqual(@as(i32, 5), value.bounds.bottom);
    try std.testing.expectEqual(@as(i32, -2), (try value.vertex(0)).point.x);
    try std.testing.expectEqual(@as(u16, 0x1122), (try value.vertex(0)).red);
    try std.testing.expectEqual(@as(u16, 0x7788), (try value.vertex(0)).alpha);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, (try value.mesh(0)).rectangle.padding);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.trailing_data);
    try std.testing.expectError(error.EmfGradientVertexIndexOutOfBounds, value.vertex(2));
    try std.testing.expectError(error.EmfGradientMeshIndexOutOfBounds, value.mesh(1));
    for (0..80) |length|
        try std.testing.expectError(error.InvalidEmfGradientFillSize, parse(fixture(bytes[0..length])));
}

test "GRADIENTFILL parses triangle indexes and validates every extent" {
    var bytes = [_]u8{0} ** 96;
    std.mem.writeInt(u32, bytes[24..28], 3, .little);
    std.mem.writeInt(u32, bytes[28..32], 1, .little);
    std.mem.writeInt(u32, bytes[32..36], @intFromEnum(gradient_fill_mode.GradientFillMode.triangle), .little);
    for (0..3) |index| std.mem.writeInt(u32, bytes[84 + index * 4 ..][0..4], @intCast(index), .little);
    const triangle = try (try expectParsed(fixture(&bytes))).mesh(0);
    try std.testing.expectEqual(@as(u32, 0), triangle.triangle.vertex1);
    try std.testing.expectEqual(@as(u32, 2), triangle.triangle.vertex3);

    for (0..bytes.len) |length|
        try std.testing.expectError(error.InvalidEmfGradientFillSize, parse(fixture(bytes[0..length])));
    var mismatched = fixture(&bytes);
    mismatched.size -= 4;
    try std.testing.expectError(error.InvalidEmfGradientFillSize, parse(mismatched));
    std.mem.writeInt(u32, bytes[24..28], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.InvalidEmfGradientFillSize, parse(fixture(&bytes)));
    std.mem.writeInt(u32, bytes[24..28], 3, .little);
    std.mem.writeInt(u32, bytes[92..96], 3, .little);
    try std.testing.expectError(error.EmfGradientVertexIndexOutOfBounds, parse(fixture(&bytes)));
    std.mem.writeInt(u32, bytes[92..96], 2, .little);
    std.mem.writeInt(u32, bytes[32..36], 3, .little);
    try std.testing.expectError(error.InvalidEmfGradientFillMode, parse(fixture(&bytes)));

    var unrelated = fixture(bytes[0..36]);
    unrelated.kind = .extfloodfill;
    try std.testing.expect((try parse(unrelated)) == null);
}

test "GRADIENTFILL preserves empty arrays and indexes later meshes independently" {
    var empty = [_]u8{0} ** 40;
    empty[36..40].* = .{ 9, 8, 7, 6 };
    const empty_value = try expectParsed(fixture(&empty));
    try std.testing.expectEqual(@as(u32, 0), empty_value.vertex_count);
    try std.testing.expectEqual(@as(u32, 0), empty_value.mesh_count);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, empty_value.trailing_data);

    var multiple = [_]u8{0} ** 108;
    std.mem.writeInt(u32, multiple[24..28], 3, .little);
    std.mem.writeInt(u32, multiple[28..32], 2, .little);
    std.mem.writeInt(u32, multiple[32..36], @intFromEnum(gradient_fill_mode.GradientFillMode.triangle), .little);
    for (0..3) |index| std.mem.writeInt(u32, multiple[84 + index * 4 ..][0..4], @intCast(index), .little);
    for (0..3) |index| std.mem.writeInt(u32, multiple[96 + index * 4 ..][0..4], @intCast(2 - index), .little);
    const value = try expectParsed(fixture(&multiple));
    try std.testing.expectEqual(@as(u32, 0), (try value.mesh(0)).triangle.vertex1);
    try std.testing.expectEqual(@as(u32, 2), (try value.mesh(1)).triangle.vertex1);
    try std.testing.expectEqual(@as(u32, 0), (try value.mesh(1)).triangle.vertex3);
}
