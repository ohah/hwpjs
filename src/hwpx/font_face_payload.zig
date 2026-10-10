//! New external font element; no invented substitute, classification or embedding.
const std = @import("std");
pub const Kind = enum { ttf, hft };

pub fn write(a: std.mem.Allocator, id: u32, name: []const u8, kind: Kind, name_limit: usize, limit: usize) ![]u8 {
    try @import("../model/font_name.zig").validate(name, name_limit);
    const escaped = try @import("../xml/attribute_writer.zig").encode(a, name, limit);
    defer a.free(escaped);
    const output = try std.fmt.allocPrint(a, "<font xmlns=\"{s}\" id=\"{d}\" face=\"{s}\" type=\"{s}\" isEmbedded=\"0\"/>", .{ @import("document_xml.zig").head_uri, id, escaped, if (kind == .ttf) @as([]const u8, "TTF") else "HFT" });
    errdefer a.free(output);
    if (output.len > limit) return error.LimitExceeded;
    return output;
}

test "HWPX new font payload escapes names rejects XML controls and allocation failures" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const output = try write(allocator, std.math.maxInt(u32), "한😀&\"\t", .ttf, 4096, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<font xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" id=\"4294967295\" face=\"한😀&amp;&quot;&#9;\" type=\"TTF\" isEmbedded=\"0\"/>", output);
            const hft = try write(allocator, 0, "Font", .hft, 4, 4096);
            defer allocator.free(hft);
            try std.testing.expect(std.mem.indexOf(u8, hft, "type=\"HFT\"") != null);
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidFontName, write(a, 0, "", .ttf, 4096, 4096));
    try std.testing.expectError(error.InvalidXmlCharacter, write(a, 0, &.{0}, .ttf, 4096, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, 0, "Font", .ttf, 4, 1));
}
