const std = @import("std");
const t = std.testing;
const profile = @import("embedded_profile.zig");
/// Independent stored-block fixture; deliberately allows arbitrary non-ICC bytes.
fn payload(a: std.mem.Allocator, name: []const u8, bytes: []const u8) ![]u8 {
    if (bytes.len > 65535) return error.FixtureTooLarge;
    const out = try a.alloc(u8, name.len + 13 + bytes.len);
    @memcpy(out[0..name.len], name);
    out[name.len] = 0;
    out[name.len + 1] = 0;
    const at = name.len + 2;
    out[at..][0..3].* = .{ 0x78, 1, 1 };
    const len: u16 = @intCast(bytes.len);
    std.mem.writeInt(u16, out[at + 3 ..][0..2], len, .little);
    std.mem.writeInt(u16, out[at + 5 ..][0..2], ~len, .little);
    @memcpy(out[at + 7 ..][0..bytes.len], bytes);
    std.mem.writeInt(u32, out[at + 7 + bytes.len ..][0..4], std.hash.Adler32.hash(bytes), .big);
    return out;
}
test "PNG embedded profile envelope all binary bytes ownership and exact quotas" {
    var raw: [256]u8 = undefined;
    for (&raw, 0..) |*b, i| b.* = @intCast(i);
    const bytes = try payload(t.allocator, "Profile", &raw);
    defer t.allocator.free(bytes);
    var v = try profile.decodeEnvelope(t.allocator, bytes, .{ .max_payload_bytes = bytes.len, .max_profile_bytes = raw.len });
    defer v.deinit(t.allocator);
    try t.expectEqualSlices(u8, &raw, v.profile_bytes);
    try t.expectEqualStrings("Profile", v.name);
    try t.expectEqual(@intFromPtr(bytes.ptr), @intFromPtr(v.name.ptr));
    try t.expectError(error.LimitExceeded, profile.decodeEnvelope(t.allocator, bytes, .{ .max_payload_bytes = bytes.len - 1 }));
    try t.expectError(error.LimitExceeded, profile.decodeEnvelope(t.allocator, bytes, .{ .max_profile_bytes = raw.len - 1 }));
    @memset(bytes[16..272], 0);
    try t.expectEqualSlices(u8, &raw, v.profile_bytes);
}
test "PNG embedded profile envelope method domain all truncations and trailing rejection" {
    const bytes = try payload(t.allocator, "K", "not yet an ICC profile");
    defer t.allocator.free(bytes);
    for (0..256) |method| {
        bytes[2] = @intCast(method);
        if (method == 0) {
            var v = try profile.decodeEnvelope(t.allocator, bytes, .{});
            v.deinit(t.allocator);
        } else try t.expectError(error.UnsupportedPngProfileCompressionMethod, profile.decodeEnvelope(t.allocator, bytes, .{}));
    }
    bytes[2] = 0;
    for (0..bytes.len) |len| {
        if (profile.decodeEnvelope(t.allocator, bytes[0..len], .{})) |value| {
            var v = value;
            v.deinit(t.allocator);
            return error.ExpectedFailure;
        } else |_| {}
    }
    const extra = try t.allocator.alloc(u8, bytes.len + 1);
    defer t.allocator.free(extra);
    @memcpy(extra[0..bytes.len], bytes);
    extra[bytes.len] = 0;
    try t.expectError(error.TrailingData, profile.decodeEnvelope(t.allocator, extra, .{}));
    try t.expectError(error.MissingPngProfileCompressionMethod, profile.decodeEnvelope(t.allocator, "K\x00", .{}));
}
test "PNG embedded profile envelope name rules and empty decode is not ICC validity" {
    for ([_][]const u8{ "", " Leading", "Trailing ", "Two  spaces", "\x7f", "\xa0", &([_]u8{'A'} ** 80) }) |name| {
        const bytes = try payload(t.allocator, name, "");
        defer t.allocator.free(bytes);
        if (profile.decodeEnvelope(t.allocator, bytes, .{})) |value| {
            var v = value;
            v.deinit(t.allocator);
            return error.ExpectedFailure;
        } else |_| {}
    }
    const empty = try payload(t.allocator, &([_]u8{0xff} ** 79), "");
    defer t.allocator.free(empty);
    var v = try profile.decodeEnvelope(t.allocator, empty, .{ .max_profile_bytes = 0 });
    defer v.deinit(t.allocator);
    try t.expectEqual(@as(usize, 79), v.name.len);
    try t.expectEqual(@as(usize, 0), v.profile_bytes.len);
}
fn allocations(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    var v = try profile.decodeEnvelope(a, good, .{});
    defer v.deinit(a);
    if (profile.decodeEnvelope(a, bad, .{})) |value| {
        var wrong = value;
        wrong.deinit(a);
        return error.ExpectedFailure;
    } else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidChecksum, err),
    }
}
test "PNG embedded profile envelope all allocation failures including checksum cleanup" {
    const good = try payload(t.allocator, "K", "profile bytes");
    defer t.allocator.free(good);
    const bad = try t.allocator.dupe(u8, good);
    defer t.allocator.free(bad);
    bad[bad.len - 1] ^= 1;
    try t.checkAllAllocationFailures(t.allocator, allocations, .{ good, bad });
}
