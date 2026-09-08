const std = @import("std");
const icc = @import("hwpjs").image.icc;
fn count(c: icc.trc_tag.Curve) usize {
    return switch (c) {
        .parametric => |p| p.function.count(),
        .curve_type => |v| switch (v) {
            .identity => 0,
            .gamma => 1,
            .samples => |s| s.count(),
        },
    };
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var table = try icc.tag_table.parse(a, bytes, .{ .max_bytes = limit, .policy = .icc_2022 });
    defer table.deinit(a);
    const model = try icc.matrix_trc_model.assemble(&table, .v4_2022);
    var size: usize = 44;
    for (model.curves) |c| size = try std.math.add(usize, size, try std.math.add(usize, 8, try std.math.mul(usize, count(c), 4)));
    const out = try a.alloc(u8, size);
    errdefer a.free(out);
    for (model.coefficients, 0..) |v, i| std.mem.writeInt(i32, out[i * 4 ..][0..4], v, .little);
    std.mem.writeInt(u32, out[36..40], @intFromBool(model.profile_semantics_deferred), .little);
    std.mem.writeInt(u32, out[40..44], @intFromBool(model.transform_priority_deferred), .little);
    var offset: usize = 44;
    for (model.curves) |c| {
        const kind: u32 = switch (c) {
            .parametric => |p| 3 + @as(u32, @intFromEnum(p.function)),
            .curve_type => |v| switch (v) {
                .identity => 0,
                .gamma => 1,
                .samples => 2,
            },
        };
        const n = count(c);
        std.mem.writeInt(u32, out[offset..][0..4], kind, .little);
        std.mem.writeInt(u32, out[offset + 4 ..][0..4], @intCast(n), .little);
        offset += 8;
        for (0..n) |i| {
            const value: i32 = switch (c) {
                .parametric => |p| p.values[i],
                .curve_type => |v| switch (v) {
                    .gamma => |g| g,
                    .samples => |s| try s.at(i),
                    .identity => unreachable,
                },
            };
            std.mem.writeInt(i32, out[offset..][0..4], value, .little);
            offset += 4;
        }
    }
    return out;
}
