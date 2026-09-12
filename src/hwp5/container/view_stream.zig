const std = @import("std");
const Header = @import("../file_header.zig").Header;
const stream = @import("../stream.zig");
const distribution = @import("../distribution/decode.zig");
/// Select by an exact envelope signature before decoding; never retry on failure.
pub fn decode(a: std.mem.Allocator, header: *const Header, bytes: []const u8, max_output: usize, max_ciphertext: usize) ![]u8 {
    return decodeWithPolicy(a, header, bytes, max_output, max_ciphertext, .reject);
}
pub fn decodeWithPolicy(a: std.mem.Allocator, header: *const Header, bytes: []const u8, max_output: usize, max_ciphertext: usize, policy: @import("../feature_policy.zig").Distribution) ![]u8 {
    try @import("../feature_policy.zig").requireSupported(header, policy);
    // Selected distribution documents require an envelope; no ordinary-stream fallback.
    if (header.has(.distribution)) return distribution.decode(a, bytes, .{ .compressed = header.has(.compressed), .max_ciphertext_bytes = max_ciphertext, .max_output_bytes = max_output });
    if (distribution.envelope.hasSignature(bytes)) return distribution.decode(a, bytes, .{ .compressed = header.has(.compressed), .max_ciphertext_bytes = max_ciphertext, .max_output_bytes = max_output });
    return stream.decodeWithPolicy(a, header, bytes, max_output, policy);
}
