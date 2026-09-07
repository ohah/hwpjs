const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const strings = @import("../utf16_string.zig");
pub const Kind = enum(u32) { set, wstring, integer, boolean };
pub const Property = struct {
    offset: usize,
    value_offset: usize,
    raw: []const u8,
    key: []const u8,
    kind: Kind,
    /// Raw UTF-16 units, including decimal spelling for integer/boolean values.
    value: []const u8,
};
fn unit(bytes: []const u8, at: usize) u16 {
    return std.mem.readInt(u16, bytes[at..][0..2], .little);
}
pub fn equalsAscii(bytes: []const u8, ascii: []const u8) bool {
    if (bytes.len % 2 != 0 or bytes.len / 2 != ascii.len) return false;
    for (ascii, 0..) |c, i| if (unit(bytes, i * 2) != c) return false;
    return true;
}
fn colon(r: *Reader) ![]const u8 {
    const begin = r.offset;
    while (r.offset < r.bytes.len) {
        const c = try r.readInt(u16);
        if (c == ':') {
            if (r.offset - 2 == begin) return error.InvalidFormProperty;
            return r.bytes[begin .. r.offset - 2];
        }
        if (c <= ' ') return error.InvalidFormProperty;
    }
    return error.UnexpectedEnd;
}
fn count(bytes: []const u8) !usize {
    var n: u64 = 0;
    var at: usize = 0;
    while (at < bytes.len) : (at += 2) {
        const c = unit(bytes, at);
        if (c < '0' or c > '9') return error.InvalidFormPropertyLength;
        n = std.math.mul(u64, n, 10) catch return error.FormPropertyLengthOverflow;
        n = std.math.add(u64, n, c - '0') catch return error.FormPropertyLengthOverflow;
    }
    // Length syntax has a fixed-width overflow rule on native and wasm32.
    // A count beyond the address space cannot fit the supplied input either.
    if (n > std.math.maxInt(usize)) return error.UnexpectedEnd;
    return @intCast(n);
}
/// One scope only. Set bodies are bounded borrowed slices, not flattened tokens.
/// Explicit hypothesis: set/wstring counts address raw UTF-16 code units.
pub const Iterator = struct {
    bytes: []const u8,
    offset: usize = 0,
    pub fn initObservedUnits(bytes: []const u8) !Iterator {
        if (bytes.len % 2 != 0) return error.InvalidFormPropertyEncoding;
        return .{ .bytes = bytes };
    }
    /// Failure leaves the iterator unchanged, including skipped leading spaces.
    pub fn next(self: *Iterator) !?Property {
        var r: Reader = .{ .bytes = self.bytes, .offset = self.offset };
        while (r.offset < r.bytes.len and unit(r.bytes, r.offset) == ' ') r.offset += 2;
        if (r.offset == r.bytes.len) {
            self.offset = r.offset;
            return null;
        }
        const start = r.offset;
        const key = try colon(&r);
        const name = try colon(&r);
        const kind: Kind = if (equalsAscii(name, "set")) .set else if (equalsAscii(name, "wstring")) .wstring else if (equalsAscii(name, "int")) .integer else if (equalsAscii(name, "bool")) .boolean else return error.UnsupportedFormPropertyType;
        var value_start = r.offset;
        const value = if (kind == .set or kind == .wstring) blk: {
            const n = try count(try colon(&r));
            value_start = r.offset;
            break :blk try strings.readUnits(&r, n);
        } else blk: {
            if (r.offset < r.bytes.len and unit(r.bytes, r.offset) == '-') r.offset += 2;
            const digits = r.offset;
            while (r.offset < r.bytes.len and unit(r.bytes, r.offset) != ' ') {
                const c = try r.readInt(u16);
                if (c < '0' or c > '9') return error.InvalidFormPropertyNumber;
            }
            if (r.offset == digits) return error.InvalidFormPropertyNumber;
            break :blk r.bytes[value_start..r.offset];
        };
        if (r.offset < r.bytes.len and unit(r.bytes, r.offset) != ' ') return error.InvalidFormPropertySeparator;
        self.offset = r.offset;
        return .{ .offset = start, .value_offset = value_start, .raw = self.bytes[start..r.offset], .key = key, .kind = kind, .value = value };
    }
};
