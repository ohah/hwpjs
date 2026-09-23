const std = @import("std");

pub const Result = struct {
    text: ?[]u8,
    escapes: usize,
    unsupported_surrogates: usize,

    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        if (self.text) |value| a.free(value);
        self.* = undefined;
    }
};

fn hexDigit(byte: u8) ?u16 {
    return switch (byte) {
        '0'...'9' => byte - '0',
        'a'...'f' => byte - 'a' + 10,
        'A'...'F' => byte - 'A' + 10,
        else => null,
    };
}

fn escapeAt(bytes: []const u8, at: usize) ?u16 {
    if (bytes.len - at < 7 or bytes[at] != '_' or bytes[at + 1] != 'x' or bytes[at + 6] != '_') return null;
    var value: u16 = 0;
    for (bytes[at + 2 .. at + 6]) |byte| {
        const digit = hexDigit(byte) orelse return null;
        value = value * 16 + digit;
    }
    return value;
}

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, max_bytes: usize) !void {
    if (out.items.len > max_bytes or bytes.len > max_bytes - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}

/// Decodes a fully XML-normalized UTF-8 ST_Xstring. Escapes are recognized in
/// one left-to-right pass, so _x005F_x0008_ becomes literal "_x0008_".
/// Unpaired UTF-16 surrogate escapes are reported without inventing UTF-8.
pub fn decode(a: std.mem.Allocator, source: []const u8, max_bytes: usize) !Result {
    if (!std.unicode.utf8ValidateSlice(source)) return error.InvalidUtf8;
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var escapes: usize = 0;
    var unsupported: usize = 0;
    var high: ?u16 = null;
    var at: usize = 0;
    while (at < source.len) {
        if (escapeAt(source, at)) |unit| {
            escapes += 1;
            at += 7;
            if (unit >= 0xd800 and unit <= 0xdbff) {
                if (high != null) unsupported += 1;
                high = unit;
                continue;
            }
            if (unit >= 0xdc00 and unit <= 0xdfff) {
                if (high) |first| {
                    const scalar: u21 = @intCast(0x10000 + (@as(u32, first - 0xd800) << 10) + (unit - 0xdc00));
                    var encoded: [4]u8 = undefined;
                    const len = try std.unicode.utf8Encode(scalar, &encoded);
                    try append(a, &out, encoded[0..len], max_bytes);
                    high = null;
                } else unsupported += 1;
                continue;
            }
            if (high != null) {
                unsupported += 1;
                high = null;
            }
            var encoded: [4]u8 = undefined;
            const len = try std.unicode.utf8Encode(@intCast(unit), &encoded);
            try append(a, &out, encoded[0..len], max_bytes);
            continue;
        }
        if (high != null) {
            unsupported += 1;
            high = null;
        }
        try append(a, &out, source[at .. at + 1], max_bytes);
        at += 1;
    }
    if (high != null) unsupported += 1;
    if (unsupported != 0) return .{ .text = null, .escapes = escapes, .unsupported_surrogates = unsupported };
    return .{ .text = try out.toOwnedSlice(a), .escapes = escapes, .unsupported_surrogates = 0 };
}
