//! Public JSON is metadata only; image bytes and current source SHA are Native inputs.
const std = @import("std");
const api = @import("image_insert.zig");
const Wire = struct { target: @import("inline_object_insert.zig").Target, width: u32, height: u32 };
pub const Parsed = struct {
    json: std.json.Parsed(Wire),
    request: api.Request,
    pub fn deinit(self: *Parsed) void {
        self.json.deinit();
        self.* = undefined;
    }
};
pub fn parse(a: std.mem.Allocator, input: []const u8, image: []const u8, digest: [32]u8) !Parsed {
    if (input.len == 0 or input.len > 4 * 1024 * 1024) return error.LimitExceeded;
    const kinds = try std.json.parseFromSlice(std.json.Value, a, input, .{ .duplicate_field_behavior = .@"error" });
    defer kinds.deinit();
    const root = kinds.value;
    if (root != .object or root.object.count() != 3) return error.InvalidImageInsertRequest;
    const target = root.object.get("target") orelse return error.InvalidImageInsertRequest;
    const kind = try @import("inline_object_placement.zig").wireAddress(target);
    if (kind != .body or target.object.count() != 5 + @as(usize, if (target.object.contains("affinity")) 1 else 0)) return error.UnsupportedPictureInsertionHost;
    try @import("inline_object_placement.zig").wireUnsigned(target.object.get("unit") orelse return error.InvalidImageInsertRequest);
    const text = target.object.get("expected_text") orelse return error.InvalidImageInsertRequest;
    if (text != .string) return error.InvalidImageInsertRequest;
    for ([_][]const u8{ "width", "height" }) |key| {
        const value = root.object.get(key) orelse return error.InvalidImageInsertRequest;
        if (value != .integer or value.integer <= 0 or value.integer > std.math.maxInt(i32)) return error.InvalidPictureInsertionSize;
    }
    const json = try std.json.parseFromSlice(Wire, a, input, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer json.deinit();
    const request: api.Request = .{ .expected_source_sha256 = digest, .target = json.value.target, .width = json.value.width, .height = json.value.height, .image = image };
    try api.validate(request);
    return .{ .json = json, .request = request };
}
