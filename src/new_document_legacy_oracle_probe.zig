//! Separate exact-byte legacy gate. Supply the pinned own-canonical factory as
//! named module `canonical_factory`; never synthesize or normalize the oracle.
const std = @import("std");

test "new document explicit legacy matches exact frozen canonical factory bytes" {
    const a = std.testing.allocator;
    const expected = try @import("canonical_factory").create(a);
    defer a.free(expected);
    const actual = try @import("new_document/root.zig").hwp5WithProfile(a, .legacy_5_0_1_7);
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
}
