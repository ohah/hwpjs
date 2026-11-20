//! New eqed/EQEDIT fragment only. No section mutation, DocInfo/BinData or CFB.
const std = @import("std");
const rules = @import("../body/control_rules.zig");
const request_mod = @import("equation_create_request.zig");
pub const Request = request_mod.Request;
pub const Fragment = struct {
    allocator: std.mem.Allocator,
    anchor: [16]u8,
    records: []u8,
    pub fn deinit(self: *Fragment) void {
        self.allocator.free(self.records);
        self.* = undefined;
    }
};

pub fn create(a: std.mem.Allocator, request: Request, native_instance_id: u32, paragraph_level: u10, limit: usize) !Fragment {
    const units = try request_mod.validate(request);
    if (native_instance_id == 0) return error.InvalidEquationInstanceId;
    if (paragraph_level > std.math.maxInt(u10) - 2) return error.LimitExceeded;
    const profile = @import("equation_create_profile.zig").tail(request.profile);
    const version_units = std.unicode.calcUtf16LeLen(profile.version) catch unreachable;
    const font_units = std.unicode.calcUtf16LeLen(profile.font) catch unreachable;
    const payload_bytes = 22 + 2 * (units + version_units + font_units);
    const framed_bytes = 4 + 46 + (if (payload_bytes >= 4095) @as(usize, 8) else 4) + payload_bytes;
    if (framed_bytes > limit) return error.LimitExceeded;
    const script = try std.unicode.utf8ToUtf16LeAlloc(a, request.script);
    defer a.free(script);
    var payload: std.ArrayList(u8) = .empty;
    defer payload.deinit(a);
    try integer(u32, a, &payload, @intFromBool(request.line_mode));
    try integer(u16, a, &payload, @intCast(units));
    try payload.appendSlice(a, std.mem.sliceAsBytes(script));
    try integer(u32, a, &payload, request.font_size);
    try integer(u32, a, &payload, @import("../../model/rgb_color.zig").hwp5(request.color_rgb));
    try integer(i16, a, &payload, request.baseline);
    try integer(u16, a, &payload, profile.observed_word);
    try string(a, &payload, profile.version);
    try string(a, &payload, profile.font);
    if (payload.items.len > limit) return error.LimitExceeded;
    const common = try @import("../body/object_common_write.zig").write(a, rules.equation_id, request.box.width, request.box.height, native_instance_id, .{
        .flags = 1 | (1 << 2) | (2 << 3) | (3 << 8) | (4 << 15) | (2 << 18),
        .offset_y = 0,
        .offset_x = 0,
        .z_order = 0,
        .margins = @splat(0),
        .prevent_page_break = false,
        .description = "",
    }, limit);
    defer a.free(common);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const writer = @import("../record_writer.zig");
    try writer.append(a, &out, 71, paragraph_level + 1, common, limit);
    try writer.append(a, &out, 88, paragraph_level + 2, payload.items, limit);
    return .{ .allocator = a, .anchor = try @import("../body/object_anchor_write.zig").create(rules.equation_id), .records = try out.toOwnedSlice(a) };
}
fn integer(comptime T: type, a: std.mem.Allocator, out: *std.ArrayList(u8), value: T) !void {
    var bytes: [@sizeOf(T)]u8 = undefined;
    std.mem.writeInt(T, &bytes, value, .little);
    try out.appendSlice(a, &bytes);
}
fn string(a: std.mem.Allocator, out: *std.ArrayList(u8), value: []const u8) !void {
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, value);
    defer a.free(units);
    if (units.len > 65535) return error.LimitExceeded;
    try integer(u16, a, out, @intCast(units.len));
    try out.appendSlice(a, std.mem.sliceAsBytes(units));
}
