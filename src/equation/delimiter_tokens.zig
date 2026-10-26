//! Visible delimiter tokens, distinct from structural grouping braces.
const std = @import("std");
pub const Shape = enum { parentheses, brackets, bars, braces, angles, double_bars, hidden };
pub const Side = struct { shape: Shape, mirror: bool = false };
pub fn resolve(value: []const u8) ?Side {
    const Entry = struct { name: []const u8, shape: Shape, mirror: bool = false };
    for ([_]Entry{
        .{ .name = "(", .shape = .parentheses },  .{ .name = ")", .shape = .parentheses, .mirror = true },
        .{ .name = "[", .shape = .brackets },     .{ .name = "]", .shape = .brackets, .mirror = true },
        .{ .name = "{", .shape = .braces },       .{ .name = "}", .shape = .braces, .mirror = true },
        .{ .name = "lbrace", .shape = .braces },  .{ .name = "rbrace", .shape = .braces, .mirror = true },
        .{ .name = "<", .shape = .angles },       .{ .name = ">", .shape = .angles, .mirror = true },
        .{ .name = "langle", .shape = .angles },  .{ .name = "rangle", .shape = .angles, .mirror = true },
        .{ .name = "|", .shape = .bars },         .{ .name = "vert", .shape = .bars },
        .{ .name = "||", .shape = .double_bars }, .{ .name = "VERT", .shape = .double_bars },
        .{ .name = ".", .shape = .hidden },
    }) |entry| if (std.mem.eql(u8, value, entry.name)) return .{ .shape = entry.shape, .mirror = entry.mirror };
    return null;
}
pub fn isDelimiter(value: []const u8) bool {
    return resolve(value) != null;
}
