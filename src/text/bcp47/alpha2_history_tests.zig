const std = @import("std");
const t = std.testing;
const history = @import("alpha2_history.zig");
test "IANA alpha2 history preserves source dates and preferred value width" {
    const bh = history.inspect(.language, "BH".*);
    try t.expect(bh.registered);
    try t.expectEqualStrings("2026-06-14", bh.deprecated_on.?);
    try t.expectEqualStrings("bih", bh.preferred.?);
    try t.expectEqualStrings("2008-11-22", history.inspect(.language, "mo".*).deprecated_on.?);
    const bu = history.inspect(.region, "bu".*);
    try t.expectEqualStrings("MM", bu.preferred.?);
    try t.expectEqualStrings("1989-12-05", bu.deprecated_on.?);
    const sh = history.inspect(.language, "sh".*);
    try t.expect(sh.registered);
    try t.expect(sh.deprecated_on == null and sh.preferred == null);
    const an = history.inspect(.region, "AN".*);
    try t.expect(an.registered and an.deprecated_on != null and an.preferred == null);
}
test "IANA alpha2 history registration is separate from metadata absence" {
    try t.expect(!history.inspect(.language, "zz".*).registered);
    try t.expect(history.inspect(.region, "ZZ".*).registered);
    try t.expect(!history.inspect(.region, "UK".*).registered);
    try t.expect(history.inspect(.region, "GB".*).registered);
    for ([_]history.Kind{ .language, .region }) |kind| {
        for ([_][2]u8{ .{ 0, 0 }, .{ 255, 255 }, .{ 'a', 0 } }) |code| {
            const r = history.inspect(kind, code);
            try t.expect(!r.registered and r.preferred == null and r.deprecated_on == null);
        }
    }
}
