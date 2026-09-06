const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const compressed = try r.readInt(u8);
    if (compressed > 1) return error.InvalidMode;
    const max_ciphertext = try r.readInt(u32);
    const max_output = try r.readInt(u32);
    return core.hwp5.distribution.decode(a, bytes[r.offset..], .{ .compressed = compressed == 1, .max_ciphertext_bytes = max_ciphertext, .max_output_bytes = max_output });
}
