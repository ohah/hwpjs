const std = @import("std");
const a = std.testing.allocator;
const options = @import("editor_session.zig").siteOptions(.{});

test "HWPX structure ZIP real fixtures preserve every non-target entry and reopen split topology" {
    try verify(false);
}

pub fn verify(emit: bool) !void {
    var exercised: usize = 0;
    for ([_][]const u8{ "charshape", "table", "table-bug" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
        defer a.free(trees);
        for (session.sections, trees) |section, *tree| tree.* = section.tree;
        const id = try @import("paragraph_instance_ids.zig").next(a, trees, &.{}, 2_000_000);
        for (session.sections, 0..) |*section, section_index| {
            var counters: @import("section_text.zig").Report = .{ .paragraphs = section.first_paragraph - 1 };
            var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &counters);
            defer values.deinit(a);
            for (values.paragraphs, 0..) |_, index| {
                var current = @import("paragraph_structure_split.zig").prepare(a, &section.tree, &values, index, 0, 0, id, 4_000_000) catch |err| switch (err) {
                    error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.MissingTextSite, error.UnsupportedParagraphTracking => continue,
                    else => {
                        std.debug.print("split failure {s} section {d} paragraph {d}: {s}\n", .{ name, section_index, index, @errorName(err) });
                        return err;
                    },
                };
                defer current.deinit(a);
                const xml = @import("paragraph_structure_save.zig").write(a, &section.tree, &current, options, section.field_dirty.items, 4_000_000) catch |err| {
                    std.debug.print("save failure {s} section {d} paragraph {d}: {s}\n", .{ name, section_index, index, @errorName(err) });
                    return err;
                };
                defer a.free(xml);
                const output = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = xml }}, .{});
                defer a.free(output);
                if (emit) {
                    var header: [24]u8 = undefined;
                    for ([_]usize{ name.len, output.len, section.entry_index, index, id, section_index }, 0..) |value, offset| std.mem.writeInt(u32, header[offset * 4 ..][0..4], @intCast(value), .little);
                    try std.Io.File.stdout().writeStreamingAll(std.testing.io, &header);
                    try std.Io.File.stdout().writeStreamingAll(std.testing.io, name);
                    try std.Io.File.stdout().writeStreamingAll(std.testing.io, output);
                }
                var reopened = try @import("editor_session.zig").open(a, output, .{});
                defer reopened.deinit();
                const selected = &reopened.sections[section_index];
                try std.testing.expectEqual(section.last_paragraph - section.first_paragraph + 2, selected.last_paragraph - selected.first_paragraph + 1);
                var new_counters: @import("section_text.zig").Report = .{ .paragraphs = selected.first_paragraph - 1 };
                var actual = try @import("paragraph_structure_collect.zig").collect(a, &selected.tree, &selected.sites, selected.locations, options, &new_counters);
                defer actual.deinit(a);
                try std.testing.expectEqual(current.paragraphs.len, actual.paragraphs.len);
                for (current.paragraphs, actual.paragraphs) |expected, got| {
                    var wanted: std.ArrayList(u8) = .empty;
                    defer wanted.deinit(a);
                    var received: std.ArrayList(u8) = .empty;
                    defer received.deinit(a);
                    for (expected.sites.items) |site| try wanted.appendSlice(a, site.text);
                    for (got.sites.items) |site| try received.appendSlice(a, site.text);
                    try std.testing.expectEqualStrings(wanted.items, received.items);
                    var actual_index: usize = 0;
                    for (expected.sites.items) |site| {
                        if (site.text.len == 0) continue;
                        while (actual_index < got.sites.items.len and got.sites.items[actual_index].text.len == 0) actual_index += 1;
                        try std.testing.expect(actual_index < got.sites.items.len);
                        try std.testing.expectEqualStrings(site.text, got.sites.items[actual_index].text);
                        actual_index += 1;
                    }
                    while (actual_index < got.sites.items.len and got.sites.items[actual_index].text.len == 0) actual_index += 1;
                    try std.testing.expectEqual(got.sites.items.len, actual_index);
                }
                var before_zip = try @import("../zip/archive.zig").open(a, input, .{});
                defer before_zip.deinit();
                var after_zip = try @import("../zip/archive.zig").open(a, output, .{});
                defer after_zip.deinit();
                try std.testing.expectEqual(before_zip.entries.len, after_zip.entries.len);
                for (before_zip.entries, after_zip.entries, 0..) |before, after, entry_index| {
                    try std.testing.expectEqualStrings(before.name, after.name);
                    if (entry_index == section.entry_index) continue;
                    const old = try before_zip.decode(before, 4_000_000);
                    defer a.free(old);
                    const new = try after_zip.decode(after, 4_000_000);
                    defer a.free(new);
                    try std.testing.expectEqualSlices(u8, old, new);
                    try std.testing.expectEqualSlices(u8, before.compressed, after.compressed);
                }
                const unchanged = try session.save();
                defer a.free(unchanged);
                try std.testing.expectEqualSlices(u8, input, unchanged);
                exercised += 1;
                break;
            }
        }
    }
    try std.testing.expect(exercised >= 3);
}
