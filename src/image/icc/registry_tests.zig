const std = @import("std");
const t = std.testing;
const lookup = @import("registry/lookup.zig");
const registry = @import("header_registry.zig");
const header = @import("header.zig");
test "ICC binary lookup independent linear oracle and unsigned boundaries" {
    const keys = [_]u32{ 1, 3, 10, 100, 200, 0x80000000, 0xffffffff };
    for (0..512) |n| {
        var expected = false;
        for (keys) |key| if (key == n) {
            expected = true;
        };
        try t.expectEqual(expected, lookup.contains(u32, &keys, @intCast(n)));
    }
    try t.expect(lookup.contains(u32, &keys, 0xffffffff));
    try t.expect(!lookup.contains(u32, &keys, 0xfffffffe));
    try t.expect(!lookup.contains(u64, &.{}, 0));
    try t.expect(lookup.contains(u64, &.{ 0x8000000000000000, 0xffffffffffffffff }, 0xffffffffffffffff));
}
test "ICC registry membership distinguishes zero missing and quarantined snapshots" {
    try t.expectEqual(.unspecified, lookup.cmm(0));
    try t.expectEqual(.registered, lookup.cmm(0x41444245)); // ADBE
    try t.expectEqual(.not_found_in_snapshot, lookup.cmm(0xffffffff));
    try t.expectEqual(.registered, lookup.manufacturer(0x41434552)); // ACER
    try t.expectEqual(.unresolved_snapshot, lookup.manufacturer(0x4c4e5600)); // quarantined LNV
    try t.expectEqual(.unresolved_snapshot, lookup.manufacturer(0xffffffff));
    try t.expectEqual(.registered, lookup.device(0x41434552, 0x41444132)); // ACER / ADA2
    try t.expectEqual(.unresolved_snapshot, lookup.device(0, 0x41444132));
    try t.expectEqual(.unresolved_snapshot, lookup.device(0xffffffff, 0x41444132));
    try t.expectEqual(.unspecified, lookup.device(0xffffffff, 0));
    var bytes = [_]u8{0} ** 128;
    bytes[8] = 4;
    bytes[36..40].* = "acsp".*;
    var h = try header.parse(&bytes);
    var r = registry.inspect(h);
    try t.expectEqual(.unspecified, r.cmm);
    try t.expectEqual(.unspecified, r.manufacturer);
    try t.expectEqual(.unspecified, r.model);
    try t.expectEqual(.unspecified, r.creator);
    h.preferred_cmm = "ADBE".*;
    h.manufacturer = "ACER".*;
    h.model = "ADA2".*;
    h.creator = "????".*;
    r = registry.inspect(h);
    try t.expectEqual(.registered, r.cmm);
    try t.expectEqual(.registered, r.manufacturer);
    try t.expectEqual(.registered, r.model);
    try t.expectEqual(.unresolved_snapshot, r.creator);
}
