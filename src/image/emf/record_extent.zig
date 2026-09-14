const records = @import("records.zig");

pub fn hasRequiredPrefix(record: records.Record, required_size: u32) bool {
    return record.size == record.bytes.len and record.size >= required_size;
}

test "required prefix accepts trailing record data but not truncation or declaration mismatch" {
    const bytes = [_]u8{0} ** 16;
    const valid: records.Record = .{ .offset = 0, .kind = .savedc, .size = 12, .bytes = bytes[0..12], .end = 12 };
    try @import("std").testing.expect(hasRequiredPrefix(valid, 8));
    try @import("std").testing.expect(!hasRequiredPrefix(valid, 16));
    var mismatched = valid;
    mismatched.size = 16;
    try @import("std").testing.expect(!hasRequiredPrefix(mismatched, 8));
}
