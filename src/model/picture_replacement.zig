//! Current picture identity, independent from geometry editing authority.
const std = @import("std");
pub const max_image_bytes = 8 * 1024 * 1024;
pub const Owner = struct {
    format: enum { hwp5, hwpx },
    section: u32,
    pictureNode: u32,
    pictureIdentity: []const u8,
    sourceSha256: [32]u8,
    resourceSha256: [32]u8,
    resourceLink: []const u8,
    historyRevision: u32,
    binding: @import("object_geometry.zig").Binding,
    pub fn jsonStringify(self: Owner, j: *std.json.Stringify) !void {
        try j.beginObject();
        inline for (.{ "format", "section", "pictureNode", "pictureIdentity" }) |name| {
            try j.objectField(name);
            try j.write(@field(self, name));
        }
        // A UTF-8-compatible digest must still have the same numeric-array wire
        // representation as every other digest. Do not change string fields.
        inline for (.{ "sourceSha256", "resourceSha256" }) |name| {
            try j.objectField(name);
            try j.beginArray();
            for (@field(self, name)) |byte| try j.write(byte);
            try j.endArray();
        }
        inline for (.{ "resourceLink", "historyRevision", "binding" }) |name| {
            try j.objectField(name);
            try j.write(@field(self, name));
        }
        try j.endObject();
    }
    pub fn deinit(self: *Owner, a: std.mem.Allocator) void {
        a.free(self.pictureIdentity);
        a.free(self.resourceLink);
        a.free(self.binding.session);
        a.free(self.binding.serial);
        self.* = undefined;
    }
};
pub const Request = struct { owner: Owner, image: []const u8 };
pub fn matches(a: Owner, b: Owner) bool {
    return a.format == b.format and a.section == b.section and a.pictureNode == b.pictureNode and
        a.historyRevision == b.historyRevision and
        std.mem.eql(u8, a.pictureIdentity, b.pictureIdentity) and
        std.mem.eql(u8, &a.sourceSha256, &b.sourceSha256) and
        std.mem.eql(u8, &a.resourceSha256, &b.resourceSha256) and
        std.mem.eql(u8, a.resourceLink, b.resourceLink) and
        std.mem.eql(u8, a.binding.session, b.binding.session) and
        std.mem.eql(u8, a.binding.serial, b.binding.serial);
}
pub fn hash(bytes: []const u8) [32]u8 {
    var value: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &value, .{});
    return value;
}
fn string(value: std.json.Value, maximum: usize) !void {
    if (value != .string or value.string.len == 0 or value.string.len > maximum) return error.InvalidPictureReplacementOwner;
}
fn object(value: std.json.Value, keys: []const []const u8) !void {
    if (value != .object or value.object.count() != keys.len) return error.InvalidPictureReplacementOwner;
    for (keys) |key| if (!value.object.contains(key)) return error.InvalidPictureReplacementOwner;
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Owner) {
    if (bytes.len == 0 or bytes.len > 16384) return error.LimitExceeded;
    const wire = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer wire.deinit();
    const v = wire.value;
    try object(v, &.{ "format", "section", "pictureNode", "pictureIdentity", "sourceSha256", "resourceSha256", "resourceLink", "historyRevision", "binding" });
    for ([_][]const u8{ "section", "pictureNode", "historyRevision" }) |key| {
        const n = v.object.get(key).?;
        if (n != .integer or n.integer < 0 or n.integer > std.math.maxInt(u32)) return error.InvalidPictureReplacementOwner;
    }
    for ([_][]const u8{ "sourceSha256", "resourceSha256" }) |key| {
        const digest = v.object.get(key).?;
        if (digest != .array or digest.array.items.len != 32) return error.InvalidPictureReplacementOwner;
        for (digest.array.items) |n| if (n != .integer or n.integer < 0 or n.integer > 255) return error.InvalidPictureReplacementOwner;
    }
    try string(v.object.get("format").?, 4);
    try string(v.object.get("pictureIdentity").?, 4096);
    try string(v.object.get("resourceLink").?, 4096);
    const binding = v.object.get("binding").?;
    try object(binding, &.{ "session", "serial" });
    try string(binding.object.get("session").?, 256);
    try string(binding.object.get("serial").?, 20);
    _ = try @import("formatting_binding.zig").decimal(binding.object.get("serial").?.string);
    return std.json.parseFromSlice(Owner, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
}
