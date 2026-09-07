const std = @import("std");
const t = std.testing;
const lookup = @import("lookup.zig");
test "ISO alpha2 all 65536 byte pairs against independent linear membership" {
    const data = @embedFile("alpha2.txt");
    var listed: usize = 0;
    for (0..65536) |n| {
        const code: [2]u8 = .{ @intCast(n >> 8), @truncate(n) };
        const r = lookup.inspect(code);
        const key: [3]u8 = .{ code[0], code[1], '\n' };
        const present = std.mem.indexOf(u8, data, &key) != null;
        try t.expectEqual(present, r.status == .listed);
        const lower = code[0] >= 'a' and code[0] <= 'z' and code[1] >= 'a' and code[1] <= 'z';
        try t.expectEqual(!lower, r.status == .invalid_syntax);
        try t.expect(!r.history_complete);
        listed += @intFromBool(present);
    }
    try t.expectEqual(@as(usize, 183), listed);
}
test "deprecated hints preserve three-letter preference and do not invent aliases" {
    const bh = lookup.inspect("bh".*);
    try t.expectEqual(lookup.Status.known_deprecated, bh.status);
    try t.expectEqualStrings("bih", bh.preferred.?);
    try t.expectEqualStrings("2021-05-25", bh.deprecated_on.?);
    const mo = lookup.inspect("mo".*);
    try t.expectEqualStrings("ro", mo.preferred.?);
    try t.expectEqualStrings("2008-11-03", mo.deprecated_on.?);
    for ([_]*const [2]u8{ "in", "iw", "ji", "jw", "sh", "zz" }) |code| {
        const r = lookup.inspect(code.*);
        try t.expectEqual(lookup.Status.not_listed, r.status);
        try t.expectEqual(@as(?[]const u8, null), r.preferred);
    }
    try t.expectEqual(lookup.Status.listed, lookup.inspect("ro".*).status);
    try t.expectEqual(lookup.Status.listed, lookup.inspect("ko".*).status);
}
