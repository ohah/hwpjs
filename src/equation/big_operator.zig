//! 표시 글리프만 선택합니다. 원문 command와 편집 문자열은 유지합니다.
const std = @import("std");
pub const Entry = struct { name: []const u8, glyph: []const u8 };
pub const entries = [_]Entry{
    .{ .name = "sum", .glyph = "∑" },
    .{ .name = "prod", .glyph = "∏" },
    .{ .name = "coprod", .glyph = "∐" },
    .{ .name = "bigcap", .glyph = "⋂" },
    .{ .name = "bigcup", .glyph = "⋃" },
    .{ .name = "bigsqcap", .glyph = "⨅" },
    .{ .name = "bigsqcup", .glyph = "⨆" },
    .{ .name = "bigoplus", .glyph = "⨁" },
    .{ .name = "bigotimes", .glyph = "⨂" },
    .{ .name = "bigodot", .glyph = "⨀" },
    .{ .name = "bigvee", .glyph = "⋁" },
    .{ .name = "bigwedge", .glyph = "⋀" },
};
pub fn resolve(name: []const u8) ?[]const u8 {
    const command = @import("commands.zig").lookup(name) orelse return null;
    if (command.family != .big_operator) return null;
    for (entries) |entry| if (std.mem.eql(u8, command.canonical, entry.name)) return entry.glyph;
    return null;
}
