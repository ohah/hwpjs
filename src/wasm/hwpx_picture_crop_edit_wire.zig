//! Optional source-rectangle transport. Native witnesses and tickets are never serialized.
const std = @import("std");
const crop = @import("../hwpx/picture_crop_edit.zig");
pub const version: u32 = 1;
pub const max_request_bytes: usize = 4096;
pub const max_reply_bytes: usize = 4096;
pub const Commit = struct { leaseKey: []const u8, crop: crop.Rect };
pub const Release = struct { leaseKey: []const u8 };
pub fn leaseId(text: []const u8) !u64 {
    const id = try @import("../model/formatting_binding.zig").decimal(text);
    if (id == 0) return error.InvalidPictureCropLease;
    return id;
}
fn envelope(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(std.json.Value) {
    if (bytes.len == 0 or bytes.len > max_request_bytes) return error.LimitExceeded;
    return std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always, .duplicate_field_behavior = .@"error" });
}
/// Read the canonical key first, without trusting any crop value or caller witness.
pub fn key(a: std.mem.Allocator, bytes: []const u8) !u64 {
    const parsed = try envelope(a, bytes);
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidPictureCropWire;
    const value = parsed.value.object.get("leaseKey") orelse return error.InvalidPictureCropWire;
    if (value != .string) return error.InvalidPictureCropWire;
    return leaseId(value.string);
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Commit) {
    const value = try envelope(a, bytes);
    defer value.deinit();
    if (value.value != .object or value.value.object.count() != 2) return error.InvalidPictureCropWire;
    const rectangle = value.value.object.get("crop") orelse return error.InvalidPictureCropWire;
    if (rectangle != .object or rectangle.object.count() != 4) return error.InvalidPictureCropWire;
    inline for (.{ "left", "top", "right", "bottom" }) |name| {
        const edge = rectangle.object.get(name) orelse return error.InvalidPictureCropWire;
        if (edge != .integer or edge.integer < 0 or edge.integer > std.math.maxInt(u32)) return error.InvalidPictureCropWire;
    }
    const result = try std.json.parseFromSlice(Commit, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer result.deinit();
    _ = try leaseId(result.value.leaseKey);
    return result;
}
pub fn release(a: std.mem.Allocator, bytes: []const u8) !u64 {
    if (bytes.len == 0 or bytes.len > max_request_bytes) return error.LimitExceeded;
    const parsed = try std.json.parseFromSlice(Release, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    defer parsed.deinit();
    return leaseId(parsed.value.leaseKey);
}
/// Editing profile v1 uses exact JSON integers shared with the SDK. This is
/// capture admission only: the existing signedOrUnsigned32 reader and painter stay intact.
pub fn qualifyCapture(raw: @import("../hwpx/picture_crop_values.zig").Values) !void {
    for (raw.clip) |edge| {
        const value = edge orelse return error.MissingPictureCropEdges;
        if (value < std.math.minInt(i32) or value > std.math.maxInt(u32)) return error.UnsupportedPictureCropCaptureValue;
    }
}
pub fn capture(a: std.mem.Allocator, id: u64, observed: crop.Observation) ![]u8 {
    if (id == 0) return error.InvalidPictureCropLease;
    try qualifyCapture(observed.raw);
    var buffer: [20]u8 = undefined;
    const token = try std.fmt.bufPrint(&buffer, "{d}", .{id});
    return @import("../json/bounded_stringify.zig").encode(a, .{
        .profileVersion = version,
        .format = "hwpx",
        .section = observed.owner.section,
        .pictureNode = observed.owner.pictureNode,
        .leaseKey = token,
        .crop = crop.Rect{ .left = observed.raw.clip[0].?, .top = observed.raw.clip[2].?, .right = observed.raw.clip[1].?, .bottom = observed.raw.clip[3].? },
        .bounds = observed.bounds,
        .historyRevision = observed.owner.historyRevision,
    }, max_reply_bytes);
}
