//! Explicit opt-in only; absent optional reference is a reported skip.
const std = @import("std");
pub fn load(a: std.mem.Allocator, path: []const u8, expected: []const u8) ![]u8 {
    const option = std.process.Environ.getPosix(std.testing.environ, "HWPJS_COMPANY_REFERENCE") orelse return error.SkipZigTest;
    if (!std.mem.eql(u8, option, "1")) return error.SkipZigTest;
    const bytes = std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64_000_000)) catch |err| switch (err) {
        error.FileNotFound => {
            std.debug.print("optional Company reference missing: {s}; skipped\n", .{path});
            return error.SkipZigTest;
        },
        else => return err,
    };
    errdefer a.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    if (!std.mem.eql(u8, &std.fmt.bytesToHex(digest, .lower), expected)) return error.ReferenceFixtureHashMismatch;
    return bytes;
}
pub fn company(a: std.mem.Allocator) ![]u8 {
    return load(a, "reference/rhwp/samples/issue6060/30307_local_service_reform.hwp", "cc8668819b79ed51408a93c0ad7876569bf67e8fed56dbfb7febdd0c9a91cded");
}

test "Company reference explicit optin rejects wrong original hash" {
    const a = std.testing.allocator;
    const bytes = try company(a);
    defer a.free(bytes);
    try std.testing.expectError(error.ReferenceFixtureHashMismatch, load(a, "reference/rhwp/samples/issue6060/30307_local_service_reform.hwp", "0000000000000000000000000000000000000000000000000000000000000000"));
}
