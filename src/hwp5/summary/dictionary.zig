const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const strings = @import("strings.zig");
pub const Entry = struct { id: u32, name: []const u8 };
/// Raw names borrow input; byte-codepage entries have NO per-entry padding.
pub const Iterator = struct {
    reader: Reader,
    code_page: u16,
    left: u32,
    pub fn init(bytes: []const u8, code_page: u16) !Iterator {
        var r: Reader = .{ .bytes = bytes };
        const count = try r.readInt(u32);
        if (count > (bytes.len - r.offset) / 9) return error.UnexpectedEnd;
        return .{ .reader = r, .code_page = code_page, .left = count };
    }
    pub fn next(self: *Iterator) !?Entry {
        if (self.left == 0) return null;
        var r = self.reader;
        const id = try r.readInt(u32);
        if (id < 2 or id > 0x7fffffff) return error.InvalidDictionaryId;
        const name = try strings.readUnits(&r, strings.width(self.code_page), self.code_page == 1200);
        if (name.len == 0) return error.InvalidDictionaryName;
        self.reader = r;
        self.left -= 1;
        return .{ .id = id, .name = name };
    }
};
pub const Report = struct { entries: usize, extra: []const u8 };
/// Structural/ID validation, not codepage conversion or case-aware name uniqueness.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, code_page: u16) !Report {
    var it = try Iterator.init(bytes, code_page);
    var ids: std.AutoHashMap(u32, void) = .init(a);
    defer ids.deinit();
    var count: usize = 0;
    while (try it.next()) |entry| {
        if ((try ids.getOrPut(entry.id)).found_existing) return error.DuplicateDictionaryId;
        count += 1;
    }
    // Final Dictionary padding is required separately from the entry padding.
    _ = try it.reader.take((4 - it.reader.offset % 4) % 4);
    return .{ .entries = count, .extra = bytes[it.reader.offset..] };
}
