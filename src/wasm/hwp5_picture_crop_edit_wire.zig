//! Optional4 source crop DTO. Full physical/source/resource/history witnesses stay Native.
const std = @import("std");
const crop = @import("../hwp5/edit/picture_crop.zig");
pub const version: u32 = 1;
pub const max_request_bytes: usize = 4096;
pub const max_reply_bytes: usize = 4096;
pub const Commit = struct { leaseKey: []const u8, crop: crop.Rect };
pub fn leaseId(text: []const u8) !u64 {
    const id = try @import("../model/formatting_binding.zig").decimal(text);
    if (id == 0) return error.InvalidPictureCropLease;
    return id;
}
fn envelope(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(std.json.Value) {
    if (bytes.len == 0 or bytes.len > max_request_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(bytes)) return error.InvalidPictureCropWire;
    return std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always, .duplicate_field_behavior = .@"error" });
}
pub fn key(a: std.mem.Allocator, bytes: []const u8) !u64 {
    const parsed = try envelope(a, bytes);
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidPictureCropWire;
    const value = parsed.value.object.get("leaseKey") orelse return error.InvalidPictureCropWire;
    if (value != .string) return error.InvalidPictureCropWire;
    return leaseId(value.string);
}
/// Exact schema after a matching lease is consumed. No string/float/null coordinate coercion.
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Commit) {
    const parsed = try envelope(a, bytes);
    defer parsed.deinit();
    if (parsed.value != .object or parsed.value.object.count() != 2) return error.InvalidPictureCropWire;
    const rectangle = parsed.value.object.get("crop") orelse return error.InvalidPictureCropWire;
    if (rectangle != .object or rectangle.object.count() != 4) return error.InvalidPictureCropWire;
    inline for (.{ "left", "top", "right", "bottom" }) |name| {
        const edge = rectangle.object.get(name) orelse return error.InvalidPictureCropWire;
        if (edge != .integer or edge.integer < 0 or edge.integer > std.math.maxInt(i32)) return error.InvalidPictureCropWire;
    }
    const result = try std.json.parseFromSlice(Commit, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer result.deinit();
    _ = try leaseId(result.value.leaseKey);
    return result;
}
pub fn release(a: std.mem.Allocator, bytes: []const u8) !u64 {
    const parsed = try envelope(a, bytes);
    defer parsed.deinit();
    if (parsed.value != .object or parsed.value.object.count() != 1) return error.InvalidPictureCropWire;
    const value = parsed.value.object.get("leaseKey") orelse return error.InvalidPictureCropWire;
    if (value != .string) return error.InvalidPictureCropWire;
    return leaseId(value.string);
}
pub fn capture(a: std.mem.Allocator, id: u64, before: crop.Observation, revision: u32) ![]u8 {
    if (id == 0) return error.InvalidPictureCropLease;
    var buffer: [20]u8 = undefined;
    const token = try std.fmt.bufPrint(&buffer, "{d}", .{id});
    return @import("../json/bounded_stringify.zig").encode(a, .{
        .profileVersion = version,
        .format = "hwp5",
        .section = before.target.selector.section,
        .pictureNode = before.target.selector.picture_node,
        .leaseKey = token,
        .crop = before.rect,
        .bounds = .{ .width = before.extent.width, .height = before.extent.height, .basis = switch (before.extent.basis) {
            .original_dimensions => @as([]const u8, "explicit_pair"),
            .raster_96dpi => "absent_75_policy",
        } },
        .historyRevision = revision,
    }, max_reply_bytes);
}
