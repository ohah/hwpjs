//! Atomic UTF-16-position splice of one current owned text site.
const std = @import("std");
const sites_module = @import("text_sites.zig");
const scalars = @import("../xml/scalars.zig");
const characters = @import("../xml/characters.zig");

pub fn splice(a: std.mem.Allocator, sites: *sites_module.Sites, index: usize, start_units: u32, delete_units: u32, inserted: []const u8, max_bytes: usize) !bool {
    if (index >= sites.items.len) return error.InvalidTextSite;
    const text = sites.items[index].text;
    const end_units = std.math.add(u32, start_units, delete_units) catch return error.InvalidTextPosition;
    const start = try bytePosition(text, start_units);
    const end = try bytePosition(text, end_units);
    var offset: usize = 0;
    while (try scalars.read(inserted, offset, .utf8)) |scalar| {
        if (!characters.valid(scalar.value)) return error.InvalidXmlCharacter;
        offset = scalar.end;
    }
    if (std.mem.eql(u8, text[start..end], inserted)) return false;
    const kept = text.len - (end - start);
    if (kept > max_bytes or inserted.len > max_bytes - kept) return error.LimitExceeded;
    const replacement = try a.alloc(u8, kept + inserted.len);
    @memcpy(replacement[0..start], text[0..start]);
    @memcpy(replacement[start..][0..inserted.len], inserted);
    @memcpy(replacement[start + inserted.len ..], text[end..]);
    sites.items[index].text = replacement;
    a.free(text);
    return true;
}

fn bytePosition(text: []const u8, wanted: u32) !usize {
    var units: usize = 0;
    var offset: usize = 0;
    while (try scalars.read(text, offset, .utf8)) |scalar| {
        if (units == wanted) return offset;
        const width: usize = if (scalar.value > 0xffff) 2 else 1;
        if (wanted > units and wanted < units + width) return error.SplitSurrogatePair;
        units += width;
        offset = scalar.end;
    }
    if (units == wanted) return offset;
    return error.InvalidTextPosition;
}

test "HWPX text site edit preserves scalar boundaries and failed edits are atomic" {
    const a = std.testing.allocator;
    const items = try a.alloc(sites_module.Site, 1);
    items[0] = .{ .element_index = 3, .start = 10, .end = 20, .text = try a.dupe(u8, "한😀끝") };
    var sites: sites_module.Sites = .{ .items = items };
    defer sites.deinit(a);
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &sites, 0, 2, 0, "x", 100));
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &sites, 0, 1, 1, "x", 100));
    try std.testing.expectError(error.InvalidXmlCharacter, splice(a, &sites, 0, 0, 0, &.{0}, 100));
    try std.testing.expectError(error.InvalidTextPosition, splice(a, &sites, 0, 4, 1, "x", 100));
    try std.testing.expectEqualStrings("한😀끝", sites.items[0].text);
    try std.testing.expect(!try splice(a, &sites, 0, 1, 2, "😀", 100));
    try std.testing.expect(try splice(a, &sites, 0, 1, 2, "<&\r", 100));
    try std.testing.expectEqualStrings("한<&\r끝", sites.items[0].text);
    try std.testing.expectEqual(@as(usize, 10), sites.items[0].start);
    try std.testing.expectEqual(@as(usize, 20), sites.items[0].end);
}
