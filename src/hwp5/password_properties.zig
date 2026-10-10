//! Explicit observed version0/version4 protected-properties prefix removal.
const std = @import("std");

/// Caller owns output. All following records remain byte-exact.
/// This is not generic extension trimming for ordinary DocInfo.
pub fn normalize(a: std.mem.Allocator, input: []const u8, encrypt_version: u32, max_output: usize) ![]u8 {
    if (encrypt_version != 0 and encrypt_version != 4) return error.UnsupportedPasswordScheme;
    var records = @import("record.zig").Iterator.init(input, .{});
    const first = try records.next() orelse return error.MissingDocumentProperties;
    if (first.tag != 16 or first.level != 0 or first.payload.len != 282 or first.raw.len != 286) return error.UnsupportedPasswordProperties;
    _ = try @import("docinfo/properties.zig").Properties.parse(first.payload[256..]);
    while (try records.next()) |record| if (record.tag == 16) return error.DuplicateDocumentProperties;
    const size = input.len - 256;
    if (size > max_output) return error.LimitExceeded;
    const output = try a.alloc(u8, size);
    std.mem.writeInt(u32, output[0..4], (26 << 20) | 16, .little);
    @memcpy(output[4..30], first.payload[256..]);
    @memcpy(output[30..], input[first.raw.len..]);
    return output;
}

test "HWP5 password properties bounded observed prefix preserves remainder and rejects ambiguity OOM" {
    const a = std.testing.allocator;
    var input: [292]u8 = @splat(0xbe);
    std.mem.writeInt(u32, input[0..4], (282 << 20) | 16, .little);
    @memset(input[260..286], 0);
    std.mem.writeInt(u16, input[260..262], 1, .little);
    std.mem.writeInt(u32, input[286..290], (2 << 20) | 999, .little);
    const original = input;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const out = try normalize(allocator, bytes, 4, 36);
            defer allocator.free(out);
            try std.testing.expectEqual(@as(usize, 36), out.len);
            try std.testing.expectEqualSlices(u8, bytes[260..], out[4..]);
        }
    };
    try Probe.run(a, &input);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&input});
    const legacy = try normalize(a, &input, 0, 36);
    defer a.free(legacy);
    try std.testing.expectEqualSlices(u8, input[260..], legacy[4..]);
    try std.testing.expectError(error.UnsupportedPasswordScheme, normalize(a, &input, 1, 36));
    try std.testing.expectError(error.LimitExceeded, normalize(a, &input, 4, 35));
    try std.testing.expectError(error.UnexpectedEnd, normalize(a, input[0..285], 4, 36));
    try std.testing.expectError(error.UnexpectedEnd, normalize(a, input[0..291], 4, 36));
    std.mem.writeInt(u32, input[286..290], (2 << 20) | 16, .little);
    try std.testing.expectError(error.DuplicateDocumentProperties, normalize(a, &input, 4, 36));
    input = original;
    std.mem.writeInt(u32, input[0..4], (282 << 20) | (1 << 10) | 16, .little);
    try std.testing.expectError(error.UnsupportedPasswordProperties, normalize(a, &input, 4, 36));
    input = original;
    try std.testing.expectEqualSlices(u8, &original, &input);
}
