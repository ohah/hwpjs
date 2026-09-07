const std = @import("std");
pub const dates = @import("data/dates.zig");
pub const Kind = enum { language, script, region, variant, extlang, extension };
pub fn table(kind: Kind) []const u8 {
    return switch (kind) {
        .language => @embedFile("data/language.txt"),
        .script => @embedFile("data/script.txt"),
        .region => @embedFile("data/region.txt"),
        .variant => @embedFile("data/variant.txt"),
        .extlang => @embedFile("data/extlang.txt"),
        .extension => @embedFile("data/extensions.txt"),
    };
}
pub fn stride(kind: Kind) usize {
    return if (kind == .extlang) 17 else 9;
}
fn find(kind: Kind, bytes: []const u8) ?usize {
    if (bytes.len == 0 or bytes.len > 8) return null;
    var key: [8]u8 = @splat('!');
    for (bytes, 0..) |b, i| {
        if (!std.ascii.isAlphanumeric(b)) return null;
        key[i] = std.ascii.toLower(b);
    }
    const data = table(kind);
    const width = stride(kind);
    var lo: usize = 0;
    var hi = data.len / width;
    while (lo < hi) {
        const mid = lo + (hi - lo) / 2;
        switch (std.mem.order(u8, &key, data[mid * width ..][0..8])) {
            .lt => hi = mid,
            .gt => lo = mid + 1,
            .eq => return mid,
        }
    }
    return null;
}
pub fn contains(kind: Kind, bytes: []const u8) bool {
    return find(kind, bytes) != null;
}
pub fn extlangPrefix(bytes: []const u8) ?[]const u8 {
    const index = find(.extlang, bytes) orelse return null;
    return std.mem.trimEnd(u8, table(.extlang)[index * 17 + 8 ..][0..8], "!");
}
