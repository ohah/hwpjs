//! Query-local linear literal matching. UTF-8 inputs must be validated by the
//! caller; byte-equal well-formed patterns cannot match inside another scalar.
const std = @import("std");
pub const Match = struct { start: u32, end: u32 };
pub const Matcher = struct {
    query: []const u8,
    query_units: u32,
    prefix: []usize,
    pub fn init(a: std.mem.Allocator, query: []const u8) !Matcher {
        if (query.len == 0) return error.InvalidSearchQuery;
        const units = try @import("../model/independent_text_edits.zig").utf16Units(query);
        if (units > 200000) return error.LimitExceeded;
        const prefix = try a.alloc(usize, query.len);
        @memset(prefix, 0);
        var matched: usize = 0;
        for (1..query.len) |index| {
            while (matched != 0 and query[index] != query[matched]) matched = prefix[matched - 1];
            if (query[index] == query[matched]) matched += 1;
            prefix[index] = matched;
        }
        return .{ .query = query, .query_units = units, .prefix = prefix };
    }
    pub fn deinit(self: *Matcher, a: std.mem.Allocator) void {
        a.free(self.prefix);
        self.* = undefined;
    }
    pub fn scan(self: *const Matcher, text: []const u8) Iterator {
        return .{ .matcher = self, .text = text };
    }
};
pub const Iterator = struct {
    matcher: *const Matcher,
    text: []const u8,
    offset: usize = 0,
    matched: usize = 0,
    units: u32 = 0,
    pub fn next(self: *Iterator) ?Match {
        while (self.offset < self.text.len) {
            const byte = self.text[self.offset];
            self.offset += 1;
            if (byte < 0x80 or byte >= 0xc0)
                self.units += if (byte >= 0xf0) @as(u32, 2) else @as(u32, 1);
            while (self.matched != 0 and byte != self.matcher.query[self.matched])
                self.matched = self.matcher.prefix[self.matched - 1];
            if (byte == self.matcher.query[self.matched]) self.matched += 1;
            if (self.matched == self.matcher.query.len) {
                self.matched = 0;
                return .{ .start = self.units - self.matcher.query_units, .end = self.units };
            }
        }
        return null;
    }
};

test "document text literal matcher preserves nonoverlap and UTF16 scalar coordinates" {
    const a = std.testing.allocator;
    var matcher = try Matcher.init(a, "😀a");
    defer matcher.deinit(a);
    var rows = matcher.scan("한😀a😀a끝");
    try std.testing.expectEqualDeep(Match{ .start = 1, .end = 4 }, rows.next().?);
    try std.testing.expectEqualDeep(Match{ .start = 4, .end = 7 }, rows.next().?);
    try std.testing.expect(rows.next() == null);
    var same = try Matcher.init(a, "aa");
    defer same.deinit(a);
    var repeated = same.scan("aaaaa");
    try std.testing.expectEqualDeep(Match{ .start = 0, .end = 2 }, repeated.next().?);
    try std.testing.expectEqualDeep(Match{ .start = 2, .end = 4 }, repeated.next().?);
    try std.testing.expect(repeated.next() == null);
    try std.testing.expectError(error.InvalidSearchQuery, Matcher.init(a, ""));
}
