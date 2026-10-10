//! Legacy interoperability only; not a constant-time or new encryption API.
const std = @import("std");
const t = @import("tables.zig");

fn permute(value: u64, width: u7, positions: []const u8) u64 {
    var result: u64 = 0;
    for (positions) |position| result = (result << 1) | ((value >> @as(u6, @intCast(width - position))) & 1);
    return result;
}
fn function(right: u32, key: u64) u32 {
    const expanded = permute(right, 32, &t.expansion) ^ key;
    var substituted: u32 = 0;
    for (t.boxes, 0..) |box, index| {
        const bits: u8 = @intCast((expanded >> @as(u6, @intCast((7 - index) * 6))) & 63);
        const row: usize = ((bits >> 5) << 1) | (bits & 1);
        const column: usize = (bits >> 1) & 15;
        substituted = (substituted << 4) | box[row * 16 + column];
    }
    return @intCast(permute(substituted, 32, &t.p));
}
pub fn decryptBlock(key: [8]u8, ciphertext: [8]u8) [8]u8 {
    var round_keys: [16]u64 = undefined;
    defer std.crypto.secureZero(u64, &round_keys);
    const selected = permute(std.mem.readInt(u64, &key, .big), 64, &t.pc1);
    var c: u28 = @intCast(selected >> 28);
    var d: u28 = @truncate(selected);
    for (t.shifts, 0..) |shift, index| {
        c = std.math.rotl(u28, c, shift);
        d = std.math.rotl(u28, d, shift);
        round_keys[index] = permute((@as(u64, c) << 28) | d, 56, &t.pc2);
    }
    const initial = permute(std.mem.readInt(u64, &ciphertext, .big), 64, &t.ip);
    var left: u32 = @intCast(initial >> 32);
    var right: u32 = @truncate(initial);
    for (0..16) |round| {
        const next = left ^ function(right, round_keys[15 - round]);
        left = right;
        right = next;
    }
    var output: [8]u8 = undefined;
    std.mem.writeInt(u64, &output, permute((@as(u64, right) << 32) | left, 64, &t.fp), .big);
    return output;
}
