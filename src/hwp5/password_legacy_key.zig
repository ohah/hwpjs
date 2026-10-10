//! Observed legacy UTF-16LE password key derivation; no normalization.
// Adapted from RHWP rhwp-password-crypto, revision
// e8800c8def63449808a4092798442652ed460552.
// MIT License
// Copyright (c) 2025-2026 Edward Kim
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
const std = @import("std");

fn feed(rolling: *[7]u8, position: *u3, unit: u16) void {
    var bytes = [_]u8{ @truncate(unit), @intCast(unit >> 8) };
    defer std.crypto.secureZero(u8, &bytes);
    for (bytes) |byte| {
        rolling[position.*] = std.math.rotl(u8, rolling[position.*] ^ byte, 1);
        position.* = if (position.* == 6) 0 else position.* + 1;
    }
}

/// Caller owns the returned key and must clear it after use. No allocation.
pub fn derive(password: []const u8, max_password_bytes: usize) ![8]u8 {
    if (password.len > max_password_bytes) return error.LimitExceeded;
    const view = std.unicode.Utf8View.init(password) catch return error.InvalidPasswordUnicode;
    var iterator = view.iterator();
    var rolling: [7]u8 = @splat(0);
    defer std.crypto.secureZero(u8, &rolling);
    var position: u3 = 0;
    while (iterator.nextCodepoint()) |code| {
        if (code <= 0xffff) feed(&rolling, &position, @intCast(code)) else {
            const scalar = code - 0x10000;
            feed(&rolling, &position, @intCast(0xd800 + (scalar >> 10)));
            feed(&rolling, &position, @intCast(0xdc00 + (scalar & 1023)));
        }
    }
    var key: [8]u8 = @splat(0);
    for (0..56) |bit| {
        const source = (rolling[bit / 8] >> @as(u3, @intCast(7 - bit % 8))) & 1;
        key[bit / 7] |= source << @as(u3, @intCast(7 - bit % 7));
    }
    return key;
}

test "legacy password key independent UTF16 vectors malformed UTF8 limits and borrowed input" {
    const passwords = [_][]const u8{ "12345", "한글\x00😀", "", "helloworld", "가" };
    const references = [_][]const u8{ "c434b200063000d0", "c02aeeaad00000f4", "0000000000000000", "a6de7c7ada5cf662", "0010b04420000000" };
    for (passwords, references) |password, reference| {
        var expected: [8]u8 = undefined;
        _ = try std.fmt.hexToBytes(&expected, reference);
        var key = try derive(password, password.len);
        defer std.crypto.secureZero(u8, &key);
        try std.testing.expectEqualSlices(u8, &expected, &key);
        for (key) |byte| try std.testing.expectEqual(@as(u8, 0), byte & 1);
    }
    try std.testing.expectError(error.LimitExceeded, derive("12345", 4));
    for ([_][]const u8{ "\xff", "\xc0\x80", "\xed\xa0\x80", "\xf4\x90\x80\x80", "\xe3\x81" }) |bytes|
        try std.testing.expectError(error.InvalidPasswordUnicode, derive(bytes, bytes.len));
    var borrowed = [_]u8{ '1', '2', '3', '4', '5' };
    const before = borrowed;
    var key = try derive(&borrowed, borrowed.len);
    defer std.crypto.secureZero(u8, &key);
    try std.testing.expectEqualSlices(u8, &before, &borrowed);
}
