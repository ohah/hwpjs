//! Independent-oracle boundary: emit a generated ZIP, not a parser verdict.
const std = @import("std");
const zip = @import("zip/archive.zig");
const writer = @import("zip/replace_writer.zig");

test "ZIP replacement oracle output" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var archive = try zip.open(a, input, .{});
    defer archive.deinit();
    var selected: ?usize = null;
    for (archive.entries, 0..) |entry, index| {
        if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) selected = index;
    }
    const index = selected orelse return error.MissingSection;
    const xml = try archive.decode(archive.entries[index], 2_000_000);
    defer a.free(xml);
    const replacement = try std.mem.concat(a, u8, &.{ xml, "<!--ZIP replacement 한😀-->" });
    defer a.free(replacement);
    const output = try writer.write(a, input, &.{.{ .entry_index = index, .bytes = replacement }}, .{});
    defer a.free(output);
    try std.Io.File.stdout().writeStreamingAll(std.testing.io, output);
}

test "ZIP replacement corpus oracle output" {
    try corpus(false);
}

test "HWPX text editing corpus oracle output" {
    try corpus(true);
}

fn corpus(edit_text: bool) !void {
    const a = std.testing.allocator;
    const root = "legacy/rust/crates/hwp-core/tests/fixtures";
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
    defer dir.close(std.testing.io);
    var iterator = dir.iterate();
    var count: usize = 0;
    while (try iterator.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.name, ".hwpx") or std.mem.eql(u8, entry.name, "password-12345.hwpx")) continue;
        const input = try dir.readFileAlloc(std.testing.io, entry.name, a, .limited(64 * 1024 * 1024));
        defer a.free(input);
        var archive = try zip.open(a, input, .{});
        defer archive.deinit();
        var selected: ?usize = null;
        for (archive.entries, 0..) |item, index| {
            if (std.mem.eql(u8, item.name, "Contents/section0.xml")) selected = index;
        }
        const index = selected orelse return error.MissingSection;
        const xml = try archive.decode(archive.entries[index], 64 * 1024 * 1024);
        defer a.free(xml);
        const replacement = if (edit_text) editedXml(a, xml) catch |err| {
            std.debug.print("Text edit refused: {s}: {s}\n", .{ entry.name, @errorName(err) });
            return err;
        } else try std.mem.concat(a, u8, &.{ xml, "<!--ZIP replacement 한😀-->" });
        defer a.free(replacement);
        const output = try writer.write(a, input, &.{.{ .entry_index = index, .bytes = replacement }}, .{});
        defer a.free(output);
        const stdout = std.Io.File.stdout();
        var lengths: [8]u8 = undefined;
        std.mem.writeInt(u32, lengths[0..4], @intCast(entry.name.len), .little);
        std.mem.writeInt(u32, lengths[4..8], @intCast(output.len), .little);
        try stdout.writeStreamingAll(std.testing.io, &lengths);
        try stdout.writeStreamingAll(std.testing.io, entry.name);
        try stdout.writeStreamingAll(std.testing.io, output);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 44), count);
}

fn editedXml(a: std.mem.Allocator, xml: []const u8) ![]u8 {
    var tree = try @import("hwpx/xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("hwpx/text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    if (sites.items.len == 0) return error.MissingTextSite;
    _ = try @import("hwpx/text_site_edit.zig").splice(a, &sites, 0, 0, 0, "검증😀<&\r", 64 * 1024 * 1024);
    return @import("hwpx/text_sites_save.zig").write(a, &tree, &sites, .{}, 64 * 1024 * 1024);
}
