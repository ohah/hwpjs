//! Optional strict wire. Existing four-argument picture resize is unchanged.
const std = @import("std");
const model = @import("../hwpx/picture_anchored_resize.zig");
pub const version: u32 = 1;
pub const Binding = struct { session: []const u8, revision: u32 };
pub const Expected = struct {
    section: u32,
    pictureNode: u32,
    size: [2]u32,
    offsets: [2]i32,
    sourceSha256: [32]u8,
    serial: []const u8,
    pub fn jsonStringify(self: Expected, out: anytype) !void {
        try out.beginObject();
        inline for (.{ "section", "pictureNode", "size", "offsets" }) |key| {
            try out.objectField(key);
            try out.write(@field(self, key));
        }
        // Digest bytes always use a numeric array, independently of UTF-8 validity.
        try out.objectField("sourceSha256");
        try out.beginArray();
        for (self.sourceSha256) |byte| try out.write(byte);
        try out.endArray();
        try out.objectField("serial");
        try out.write(self.serial);
        try out.endObject();
    }
    pub fn native(self: Expected) !model.Expected {
        return .{ .section = self.section, .picture_node = self.pictureNode, .size = self.size, .offsets = self.offsets, .source_sha256 = self.sourceSha256, .serial = try @import("../model/formatting_binding.zig").decimal(self.serial) };
    }
};
pub const Request = struct {
    profileVersion: u32,
    section: u32,
    pictureNode: u32,
    width: u32,
    height: u32,
    anchor: model.Anchor,
    expected: Expected,
    binding: Binding,
};
fn member(value: std.json.Value, key: []const u8) !std.json.Value {
    if (value != .object) return error.InvalidAnchoredPictureResize;
    return value.object.get(key) orelse error.InvalidAnchoredPictureResize;
}
fn integer(value: std.json.Value) !void {
    if (value != .integer) return error.InvalidAnchoredPictureResize;
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len > 16384) return error.LimitExceeded;
    const raw = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer raw.deinit();
    const raw_anchor = try member(raw.value, "anchor");
    if (raw_anchor != .string) return error.InvalidAnchoredPictureResize;
    _ = std.meta.stringToEnum(model.Anchor, raw_anchor.string) orelse return error.InvalidAnchoredPictureResize;
    for ([_][]const u8{ "profileVersion", "section", "pictureNode", "width", "height" }) |key| try integer(try member(raw.value, key));
    const raw_expected = try member(raw.value, "expected");
    if (try member(raw_expected, "serial") != .string) return error.InvalidAnchoredPictureResize;
    for ([_][]const u8{ "section", "pictureNode" }) |key| try integer(try member(raw_expected, key));
    for ([_][]const u8{ "size", "offsets", "sourceSha256" }) |key| {
        const array = try member(raw_expected, key);
        if (array != .array) return error.InvalidAnchoredPictureResize;
        for (array.array.items) |value| try integer(value);
    }
    try integer(try member(try member(raw.value, "binding"), "revision"));
    if (try member(try member(raw.value, "binding"), "session") != .string) return error.InvalidAnchoredPictureResize;
    const parsed = try std.json.parseFromSlice(Request, a, bytes, .{});
    errdefer parsed.deinit();
    const value = parsed.value;
    if (value.profileVersion != version or value.width == 0 or value.height == 0 or
        value.expected.size[0] == 0 or value.expected.size[1] == 0 or
        value.section != value.expected.section or value.pictureNode != value.expected.pictureNode or
        value.binding.session.len == 0 or value.binding.session.len > 256) return error.InvalidAnchoredPictureResize;
    _ = try value.expected.native();
    return parsed;
}

test "anchored picture HX wire accepts exact bound request and all eight fixed points" {
    const a = std.testing.allocator;
    for ([_][32]u8{ @splat(0), @splat('A'), @splat(255) }) |digest| for (std.enums.values(model.Anchor)) |anchor| {
        const value: Request = .{ .profileVersion = 1, .section = 0, .pictureNode = 4, .width = 600, .height = 300, .anchor = anchor, .expected = .{ .section = 0, .pictureNode = 4, .size = .{ 400, 200 }, .offsets = .{ 1000, 2000 }, .sourceSha256 = digest, .serial = "0" }, .binding = .{ .session = "s1", .revision = 0 } };
        const bytes = try std.json.Stringify.valueAlloc(a, value, .{});
        defer a.free(bytes);
        const parsed = try parse(a, bytes);
        defer parsed.deinit();
        try std.testing.expectEqual(anchor, parsed.value.anchor);
        try std.testing.expectEqualDeep(value.expected.size, parsed.value.expected.size);
        try std.testing.expectEqualDeep(digest, parsed.value.expected.sourceSha256);
        const query = try std.json.Stringify.valueAlloc(a, .{ .profileVersion = @as(u32, 1), .expected = value.expected, .binding = value.binding }, .{});
        defer a.free(query);
        const raw = try std.json.parseFromSlice(std.json.Value, a, query, .{});
        defer raw.deinit();
        const expected = try member(raw.value, "expected");
        const hash = try member(expected, "sourceSha256");
        try std.testing.expect(hash == .array);
        try std.testing.expectEqual(@as(usize, 32), hash.array.items.len);
        for (hash.array.items, digest) |item, byte| {
            try std.testing.expect(item == .integer);
            try std.testing.expectEqual(@as(i64, byte), item.integer);
        }
        try std.testing.expect((try member(expected, "serial")) == .string);
        try std.testing.expect((try member(try member(raw.value, "binding"), "session")) == .string);
    };
}
test "anchored picture HX wire rejects unknown fields zero size wrong version and cross section" {
    const a = std.testing.allocator;
    const value: Request = .{ .profileVersion = 1, .section = 0, .pictureNode = 4, .width = 600, .height = 300, .anchor = .bottom_right, .expected = .{ .section = 0, .pictureNode = 4, .size = .{ 400, 200 }, .offsets = .{ 1000, 2000 }, .sourceSha256 = @splat(0), .serial = "0" }, .binding = .{ .session = "s1", .revision = 0 } };
    const bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(bytes);
    const cases = [_][2][]const u8{
        .{ "\"width\":600", "\"width\":600,\"position\":1" },
        .{ "\"width\":600", "\"width\":0" },
        .{ "\"width\":600", "\"width\":\"600\"" },
        .{ "\"width\":600", "\"width\":600.0" },
        .{ "\"profileVersion\":1", "\"profileVersion\":2" },
        .{ "\"section\":0,\"pictureNode\":4,\"size\"", "\"section\":1,\"pictureNode\":4,\"size\"" },
        .{ "\"serial\":\"0\"", "\"serial\":\"00\"" },
        .{ "\"serial\":\"0\"", "\"serial\":[48]" },
        .{ "\"session\":\"s1\"", "\"session\":[115,49]" },
        .{ "\"anchor\":\"bottom_right\"", "\"anchor\":0" },
        .{ "\"anchor\":\"bottom_right\"", "\"anchor\":\"0\"" },
    };
    for (cases) |item| {
        try std.testing.expect(std.mem.indexOf(u8, bytes, item[0]) != null);
        const invalid = try std.mem.replaceOwned(u8, a, bytes, item[0], item[1]);
        defer a.free(invalid);
        if (parse(a, invalid)) |accepted| {
            accepted.deinit();
            return error.AcceptedInvalidAnchoredPictureResize;
        } else |_| {}
    }
    const zero_array = try std.json.Stringify.valueAlloc(a, @as([32]u32, @splat(0)), .{});
    defer a.free(zero_array);
    const hash_field = try std.fmt.allocPrint(a, "\"sourceSha256\":{s}", .{zero_array});
    defer a.free(hash_field);
    try std.testing.expect(std.mem.indexOf(u8, bytes, hash_field) != null);
    const string_hash = try std.mem.replaceOwned(u8, a, bytes, hash_field, "\"sourceSha256\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\"");
    defer a.free(string_hash);
    try std.testing.expectError(error.InvalidAnchoredPictureResize, parse(a, string_hash));
}
