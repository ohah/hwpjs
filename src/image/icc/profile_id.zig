const std = @import("std");
const header = @import("header.zig");
const extent = @import("extent.zig");
pub const Status = enum { not_defined, not_calculated, verified };
/// ICC v4 identifier only. MD5 is prescribed by ICC, not an authenticity check.
pub fn inspect(bytes: []const u8, max_bytes: usize) !Status {
    const value = try extent.inspect(bytes, max_bytes);
    const id = switch (value.tail) {
        .v2 => return .not_defined,
        .v4 => |tail| tail.profile_id,
    };
    if (std.mem.allEqual(u8, &id, 0)) return .not_calculated;
    const actual = hash(bytes);
    if (!std.mem.eql(u8, &id, &actual)) return error.InvalidIccProfileId;
    return .verified;
}
pub fn calculate(bytes: []const u8, max_bytes: usize) ![16]u8 {
    const value = try extent.inspect(bytes, max_bytes);
    if (value.version.major != 4) return error.UnsupportedIccProfileId;
    return hash(bytes);
}
/// Exclude fields without modifying the caller's bytes or allocating a full copy.
fn hash(bytes: []const u8) [16]u8 {
    var digest = std.crypto.hash.Md5.init(.{});
    var at: usize = 0;
    const zeroes = [_]u8{0} ** header.id_size;
    const ranges = [_]struct { start: usize, len: usize }{
        .{ .start = header.flags_offset, .len = 4 },
        .{ .start = header.intent_offset, .len = 4 },
        .{ .start = header.id_offset, .len = header.id_size },
    };
    for (ranges) |range| {
        digest.update(bytes[at..range.start]);
        digest.update(zeroes[0..range.len]);
        at = range.start + range.len;
    }
    digest.update(bytes[at..]);
    var result: [16]u8 = undefined;
    digest.final(&result);
    return result;
}
