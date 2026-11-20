//! Owned pending binary values. Stored by the existing HWP5 History checkpoint.
const std = @import("std");
pub const Entry = struct { ordinal: u16, physical: u16, path: []u8, bytes: []u8 };
pub const Values = struct {
    docinfo: ?[]u8 = null,
    entries: []Entry = &.{},
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        if (self.docinfo) |bytes| a.free(bytes);
        for (self.entries) |entry| {
            a.free(entry.path);
            a.free(entry.bytes);
        }
        a.free(self.entries);
        self.* = .{};
    }
    pub fn empty(self: Values) bool {
        return self.docinfo == null and self.entries.len == 0;
    }
    pub fn byteSize(self: Values, limit: usize) !usize {
        var total = std.math.mul(usize, self.entries.len, @sizeOf(Entry)) catch return error.LimitExceeded;
        if (self.docinfo) |bytes| total = std.math.add(usize, total, bytes.len) catch return error.LimitExceeded;
        for (self.entries) |entry| {
            total = std.math.add(usize, total, entry.path.len) catch return error.LimitExceeded;
            total = std.math.add(usize, total, entry.bytes.len) catch return error.LimitExceeded;
        }
        if (total > limit) return error.LimitExceeded;
        return total;
    }
    pub fn equals(self: Values, other: Values) bool {
        if ((self.docinfo == null) != (other.docinfo == null) or self.entries.len != other.entries.len) return false;
        if (self.docinfo) |bytes| if (!std.mem.eql(u8, bytes, other.docinfo.?)) return false;
        for (self.entries, other.entries) |left, right| {
            if (left.ordinal != right.ordinal or left.physical != right.physical or !std.mem.eql(u8, left.path, right.path) or !std.mem.eql(u8, left.bytes, right.bytes)) return false;
        }
        return true;
    }
    pub fn clone(self: Values, a: std.mem.Allocator, limit: usize) !Values {
        _ = try self.byteSize(limit);
        var out: Values = .{};
        errdefer out.deinit(a);
        if (self.docinfo) |bytes| out.docinfo = try a.dupe(u8, bytes);
        const entries = try a.alloc(Entry, self.entries.len);
        var initialized: usize = 0;
        errdefer {
            for (entries[0..initialized]) |entry| {
                a.free(entry.path);
                a.free(entry.bytes);
            }
            a.free(entries);
        }
        for (self.entries, entries) |entry, *copy| {
            const path = try a.dupe(u8, entry.path);
            errdefer a.free(path);
            copy.* = .{ .ordinal = entry.ordinal, .physical = entry.physical, .path = path, .bytes = try a.dupe(u8, entry.bytes) };
            initialized += 1;
        }
        out.entries = entries;
        return out;
    }
    /// Bytes are decoded and each newly authored BinData item is uncompressed.
    pub fn read(self: Values, a: std.mem.Allocator, ordinal: u16, limit: usize) !?[]u8 {
        for (self.entries) |entry| if (entry.ordinal == ordinal) {
            if (entry.bytes.len > limit) return error.LimitExceeded;
            return try a.dupe(u8, entry.bytes);
        };
        return null;
    }
};
