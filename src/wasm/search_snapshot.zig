const std = @import("std");
const Reader = @import("../binary/reader.zig").Reader;
const Options = @import("../cfb/types.zig").Options;
const search = @import("../cfb/find.zig");

/// ABI v2: LE u32 count, then (u32 name length, name UTF-8, u32 path length, path UTF-8).
/// Borrow the wire bytes only for this call. No active document is needed or changed.
pub fn find(backing: std.mem.Allocator, bytes: []const u8, query: []const u8) !?usize {
    const limits: Options = .{};
    if (bytes.len > limits.max_input_bytes) return error.LimitExceeded;
    var reader: Reader = .{ .bytes = bytes };
    const count = try reader.readInt(u32);
    if (count > limits.max_entries) return error.LimitExceeded;
    if (count > (bytes.len - reader.offset) / 8) return error.InvalidSearchSnapshot;
    var arena = std.heap.ArenaAllocator.init(backing);
    defer arena.deinit();
    const a = arena.allocator();
    const Entry = struct { name: []const u8, path: []const u8 };
    const entries = try a.alloc(Entry, count);
    for (entries) |*entry| {
        entry.name = try reader.take(try reader.readInt(u32));
        entry.path = try reader.take(try reader.readInt(u32));
    }
    if (reader.offset != bytes.len) return error.InvalidSearchSnapshot;
    return search.find(a, entries, query);
}

test "snapshot bounds, UTF-8 and independent lookup" {
    const a = std.testing.allocator;
    const bytes = "\x01\x00\x00\x00\x01\x00\x00\x00R\x02\x00\x00\x00R/";
    try std.testing.expectEqual(@as(?usize, 0), try find(a, bytes, "/"));
    try std.testing.expectEqual(@as(?usize, null), try find(a, bytes, "missing"));
    try std.testing.expectError(error.InvalidSearchSnapshot, find(a, bytes ++ "x", "/"));
    try std.testing.expectError(error.InvalidSearchSnapshot, find(a, "\x01\x00\x00\x00", "/"));
    try std.testing.expectError(error.UnexpectedEnd, find(a, bytes[0 .. bytes.len - 1], "/"));
    try std.testing.expectError(error.LimitExceeded, find(a, "\xff\xff\xff\xff", "/"));
    try std.testing.expectError(error.InvalidUtf8, find(a, bytes, "\xff"));
}

fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = "\x01\x00\x00\x00\x01\x00\x00\x00R\x02\x00\x00\x00R/";
    try std.testing.expectEqual(@as(?usize, 0), try find(a, bytes, "/"));
    const nested = "\x02\x00\x00\x00\x01\x00\x00\x00R\x02\x00\x00\x00R/" ++
        "\x01\x00\x00\x00\x01\x03\x00\x00\x00R/\x01";
    try std.testing.expectEqual(@as(?usize, 1), try find(a, nested, "/!"));
    try std.testing.expectEqual(@as(?usize, null), try find(a, nested, "absent"));
}

test "snapshot lookup releases allocations on failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationCase, .{});
}
