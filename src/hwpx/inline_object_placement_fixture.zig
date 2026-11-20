//! Authored two-section package. No external document or generated binary.
const std = @import("std");
pub fn create(a: std.mem.Allocator) ![]u8 {
    const initial = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(initial);
    var archive = try @import("../zip/archive.zig").open(a, initial, .{});
    defer archive.deinit();
    const Source = @import("../zip/store_writer.zig").Source;
    var entries: std.ArrayList(Source) = .empty;
    defer {
        for (entries.items) |entry| a.free(entry.bytes);
        entries.deinit(a);
    }
    for (archive.entries) |entry| {
        var bytes = try archive.decode(entry, 4000000);
        errdefer a.free(bytes);
        if (std.mem.eql(u8, entry.name, "Contents/header.xml")) {
            const changed = try std.mem.replaceOwned(u8, a, bytes, "secCnt=\"1\"", "secCnt=\"2\"");
            a.free(bytes);
            bytes = changed;
        }
        if (std.mem.eql(u8, entry.name, "Contents/content.hpf")) {
            const manifest = try std.mem.replaceOwned(u8, a, bytes, "</opf:manifest>", "<opf:item id=\"section1\" href=\"Contents/section1.xml\" media-type=\"application/xml\"/></opf:manifest>");
            a.free(bytes);
            bytes = manifest;
            const spine = try std.mem.replaceOwned(u8, a, bytes, "</opf:spine>", "<opf:itemref idref=\"section1\"/></opf:spine>");
            a.free(bytes);
            bytes = spine;
        }
        try entries.append(a, .{ .name = entry.name, .bytes = bytes });
    }
    const later = try archive.decode(archive.find("Contents/section0.xml").?, 4000000);
    entries.append(a, .{ .name = "Contents/section1.xml", .bytes = later }) catch |err| {
        a.free(later);
        return err;
    };
    return @import("../zip/store_writer.zig").write(a, entries.items, .{});
}
