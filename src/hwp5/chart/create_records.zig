//! New gso/$ole subtree. Explicit spec24 OLE, root double-ID component profile.
const std = @import("std");
const rules = @import("../body/control_rules.zig");
pub const Fragment = @import("../edit/equation_create_records.zig").Fragment;
pub fn create(a: std.mem.Allocator, req: @import("create_request.zig").Request, instance: u32, level: u10, ordinal: u16, limit: usize) !Fragment {
    try @import("create_request.zig").validate(req);
    if (instance == 0 or ordinal == 0) return error.InvalidChartCreateIdentity;
    if (level > std.math.maxInt(u10) - 3) return error.LimitExceeded;
    const common = try @import("../body/object_common_write.zig").write(a, rules.drawing_id, req.box.width, req.box.height, instance, .{
        .flags = 1 | (1 << 2) | (2 << 3) | (3 << 8) | (4 << 15) | (2 << 18),
        .offset_y = 0,
        .offset_x = 0,
        .z_order = 0,
        .margins = @splat(0),
        .prevent_page_break = false,
        .description = "",
    }, limit);
    defer a.free(common);
    var component: [196]u8 = @splat(0);
    put(u32, &component, 0, rules.id("$ole"));
    put(u32, &component, 4, rules.id("$ole"));
    put(u32, &component, 20, req.box.width);
    put(u32, &component, 24, req.box.height);
    put(u32, &component, 28, req.box.width);
    put(u32, &component, 32, req.box.height);
    put(u16, &component, 50, 1);
    for ([_]usize{ 52, 100, 148 }) |at| {
        put(u64, &component, at, @bitCast(@as(f64, 1)));
        put(u64, &component, at + 32, @bitCast(@as(f64, 1)));
    }
    var ole: [24]u8 = @splat(0);
    put(u16, &ole, 0, 1); // Content aspect; no unrepresentable high kind bits.
    put(i32, &ole, 2, @intCast(req.box.width));
    put(i32, &ole, 6, @intCast(req.box.height));
    put(u16, &ole, 10, ordinal);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const append = @import("../record_writer.zig").append;
    try append(a, &out, 71, level + 1, common, limit);
    try append(a, &out, 76, level + 2, &component, limit);
    try append(a, &out, 84, level + 3, &ole, limit);
    return .{ .allocator = a, .anchor = try @import("../body/object_anchor_write.zig").create(rules.drawing_id), .records = try out.toOwnedSlice(a) };
}
fn put(comptime T: type, b: []u8, o: usize, v: T) void {
    std.mem.writeInt(T, b[o..][0..@sizeOf(T)], v, .little);
}
