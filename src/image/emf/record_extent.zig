const std = @import("std");
const records = @import("records.zig");

pub fn hasRequiredPrefix(record: records.Record, required_size: u32) bool {
    return requiredEnd(record, required_size) != null;
}

pub fn requiredEnd(record: records.Record, required_end: u64) ?usize {
    if (record.size != record.bytes.len or required_end > std.math.maxInt(usize) or required_end > record.bytes.len) return null;
    return @intCast(required_end);
}

test "required prefix accepts trailing record data but not truncation or declaration mismatch" {
    const bytes = [_]u8{0} ** 16;
    const valid: records.Record = .{ .offset = 0, .kind = .savedc, .size = 12, .bytes = bytes[0..12], .end = 12 };
    try std.testing.expect(hasRequiredPrefix(valid, 8));
    try std.testing.expect(!hasRequiredPrefix(valid, 16));
    var mismatched = valid;
    mismatched.size = 16;
    try std.testing.expect(!hasRequiredPrefix(mismatched, 8));
    try std.testing.expectEqual(@as(?usize, 8), requiredEnd(valid, 8));
    try std.testing.expectEqual(@as(?usize, null), requiredEnd(valid, std.math.maxInt(u64)));
}
