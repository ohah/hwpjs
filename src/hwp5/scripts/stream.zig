//! Script stream encoding selected by explicit document policy, never by retry.
const std = @import("std");
const Header = @import("../file_header.zig").Header;
pub fn decode(a: std.mem.Allocator, header: *const Header, bytes: []const u8, max_output: usize, max_ciphertext: usize, policy: @import("../feature_policy.zig").Distribution) ![]u8 {
    try @import("../feature_policy.zig").requireSupported(header, policy);
    if (header.has(.distribution)) return @import("../distribution/decode.zig").decode(a, bytes, .{ .compressed = header.has(.compressed), .max_ciphertext_bytes = max_ciphertext, .max_output_bytes = max_output });
    return @import("../stream.zig").decodeWithPolicy(a, header, bytes, max_output, policy);
}
