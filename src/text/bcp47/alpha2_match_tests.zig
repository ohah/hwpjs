const std = @import("std");
const t = std.testing;
const match = @import("alpha2_match.zig");
test "direct IANA matching keeps identities and does not invent replacements" {
    try t.expect(match.matches(.language, "iw".*, "HE".*));
    try t.expect(match.matches(.language, "mo".*, "ro".*));
    try t.expect(match.matches(.region, "BU".*, "mm".*));
    try t.expect(match.matches(.region, "AN".*, "an".*));
    try t.expect(!match.matches(.region, "AN".*, "CW".*));
    try t.expect(!match.matches(.region, "UK".*, "GB".*));
    try t.expect(!match.matches(.language, "sh".*, "sr".*));
    try t.expect(!match.matches(.language, "bh".*, "bi".*));
    try t.expect(!match.matches(.language, "ZZ".*, "zz".*));
    try t.expect(match.matches(.language, "zz".*, "zz".*));
    try t.expect(match.matches(.region, .{ 0, 255 }, .{ 0, 255 }));
}
test "direct IANA matching is symmetric across current explicit aliases" {
    const data = @import("data/alpha2_history.zig");
    for ([_]match.Kind{ .language, .region }) |kind| {
        const entries: []const data.Entry = if (kind == .language) &data.language else &data.region;
        for (entries) |entry| if (entry.preferred) |p| {
            if (p.len != 2) continue;
            try t.expect(match.matches(kind, entry.code, p[0..2].*));
            try t.expect(match.matches(kind, p[0..2].*, entry.code));
        };
    }
}
