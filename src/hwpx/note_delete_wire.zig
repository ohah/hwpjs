//! Public delete-at-reference transport. No host-provided physical note or lease.
const std = @import("std");
const placement = @import("inline_object_placement.zig");
pub const Request = struct { target: @import("note_create_wire.zig").Target };
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len == 0 or bytes.len > 2 * 1024 * 1024) return error.LimitExceeded;
    const raw = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer raw.deinit();
    if (raw.value != .object) return error.InvalidNoteDeleteRequest;
    const target = raw.value.object.get("target") orelse return error.InvalidNoteDeleteRequest;
    const kind = (try placement.wireAddress(target)) orelse return error.InvalidNoteDeleteOwner;
    if (kind == .createdCell) return error.UnsupportedNoteDeleteOwner;
    try placement.wireUnsigned(target.object.get("unit") orelse return error.InvalidNoteDeleteRequest);
    const parsed = try std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer parsed.deinit();
    _ = try @import("../image/image_insertion.zig").byteOffset(parsed.value.target.expected_text, parsed.value.target.unit);
    return parsed;
}

const sample = "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":3,\"expected_text\":\"a😀￼\",\"owner\":{\"kind\":\"body\",\"binding\":{\"session\":\"s1\",\"revision\":0,\"serial\":\"0\"}}}}";

fn parseSample(a: std.mem.Allocator) !void {
    const parsed = try parse(a, sample);
    defer parsed.deinit();
    try std.testing.expectEqual(@as(u32, 3), parsed.value.target.unit);
    try std.testing.expectEqualStrings("a😀\xef\xbf\xbc", parsed.value.target.expected_text);
    try std.testing.expectEqual(@as(?usize, null), parsed.value.target.native().physical_paragraph);
}
test "HWPX N02 public delete wire preserves UTF16 anchor and binding" {
    try parseSample(std.testing.allocator);
}
test "HWPX N02 public delete wire rejects private fields floating positions duplicates and owner absence" {
    const a = std.testing.allocator;
    const cases = [_]struct { before: []const u8, after: []const u8 }{
        .{ .before = "\"unit\":3", .after = "\"unit\":3.0" },
        .{ .before = "\"unit\":3", .after = "\"unit\":2" },
        .{ .before = "\"unit\":3", .after = "\"unit\":3,\"note_node\":12" },
        .{ .before = "\"unit\":3", .after = "\"unit\":3,\"unit\":3" },
        .{ .before = "\"owner\":", .after = "\"lease\":" },
        .{ .before = "\"revision\":0", .after = "\"revision\":-1" },
    };
    for (cases) |item| {
        const bytes = try std.mem.replaceOwned(u8, a, sample, item.before, item.after);
        defer a.free(bytes);
        if (parse(a, bytes)) |result| {
            result.deinit();
            return error.TestExpectedError;
        } else |err| {
            if (err == error.OutOfMemory) return err;
        }
    }
}
test "HWPX N02 public delete wire NoResize allocation cleanup" {
    try @import("../testing/allocation_failures.zig").check(parseSample, .{});
}
