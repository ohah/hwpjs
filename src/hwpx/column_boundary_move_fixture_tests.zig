//! Actual ZIP relocation probes; not production session command coverage.
const std = @import("std");
const uri = @import("document_xml.zig").paragraph_uri;

test "column boundary move actual multicolumn ZIP fixtures preserves settings and other payloads" {
    const a = std.testing.allocator;
    var exercised: usize = 0;
    for ([_][]const u8{ "multicolumns", "multicolumns-widths" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        var archive = try @import("../zip/archive.zig").open(a, input, .{});
        defer archive.deinit();
        for (session.sections, 0..) |*section, section_index| {
            for (section.tree.elements, 0..) |element, source_element| {
                if (!element.is(uri, "colPr")) continue;
                const control = element.parent.?;
                const run = section.tree.elements[control].parent.?;
                const owner = section.tree.elements[run].parent.?;
                var selected: ?usize = null;
                for (section.sites.items, 0..) |site, index| {
                    if (site.missing_text or site.anchor_boundary) continue;
                    const text_run = section.tree.elements[site.element_index].parent orelse continue;
                    if (section.tree.elements[text_run].parent == owner) {
                        selected = index;
                        break;
                    }
                }
                const site_index = selected orelse return error.MissingFixtureTextSite;
                const site = section.sites.items[site_index];
                const length = try @import("text_site_edit.zig").utf16Length(site.text);
                var at: u32 = @intCast(length / 2);
                _ = @import("text_site_edit.zig").bytePosition(site.text, at) catch |err| switch (err) {
                    error.SplitSurrogatePair => blk: {
                        at -= 1;
                        break :blk try @import("text_site_edit.zig").bytePosition(site.text, at);
                    },
                    else => return err,
                };
                const ordinal = section.locations[site_index].paragraph_ordinal;
                const positions = try @import("anchor_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, ordinal);
                defer a.free(positions);
                var expected: ?u32 = null;
                for (positions) |position| if (position.kind == .text and position.index == site_index) {
                    expected = @intCast(position.start_unit + at);
                };
                const xml = try @import("column_boundary_move_xml.zig").writeAt(a, &section.tree, source_element, &section.sites, section.locations, ordinal, expected.?, 4_000_000);
                defer a.free(xml);
                try std.testing.expect(std.mem.startsWith(u8, xml, section.tree.source[0..section.tree.elements[owner].start_tag.start]));
                try std.testing.expect(std.mem.endsWith(u8, xml, section.tree.source[section.tree.elements[owner].end..]));
                const saved = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = xml }}, .{});
                defer a.free(saved);
                var reopened = try @import("editor_session.zig").open(a, saved, .{});
                defer reopened.deinit();
                const changed = &reopened.sections[section_index];
                const changed_owner = try @import("paragraph_site_owner.zig").resolve(&changed.tree, &changed.sites, changed.locations, ordinal);
                const new_positions = try @import("anchor_text_positions.zig").build(a, &changed.tree, &changed.sites, changed.locations, ordinal);
                defer a.free(new_positions);
                const boundaries = try @import("column_boundary_collect.zig").collect(a, &changed.tree, changed_owner, new_positions, .right, 1);
                defer a.free(boundaries);
                try std.testing.expectEqual(@as(usize, 1), boundaries.len);
                try std.testing.expectEqual(expected.?, boundaries[0].unit);
                try std.testing.expectEqualStrings(section.tree.sourceOf(source_element), changed.tree.sourceOf(boundaries[0].source_element));
                var old_text: std.ArrayList(u8) = .empty;
                defer old_text.deinit(a);
                var new_text: std.ArrayList(u8) = .empty;
                defer new_text.deinit(a);
                for (section.sites.items, section.locations) |text_site, location| if (location.paragraph_ordinal == ordinal) {
                    try old_text.appendSlice(a, text_site.text);
                };
                for (changed.sites.items, changed.locations) |text_site, location| if (location.paragraph_ordinal == ordinal) {
                    try new_text.appendSlice(a, text_site.text);
                };
                try std.testing.expectEqualSlices(u8, old_text.items, new_text.items);
                var new_archive = try @import("../zip/archive.zig").open(a, saved, .{});
                defer new_archive.deinit();
                try std.testing.expectEqual(archive.entries.len, new_archive.entries.len);
                for (archive.entries, new_archive.entries, 0..) |old, new, index| {
                    try std.testing.expectEqualStrings(old.name, new.name);
                    if (index == section.entry_index) continue;
                    const before = try archive.decode(old, 4_000_000);
                    defer a.free(before);
                    const after = try new_archive.decode(new, 4_000_000);
                    defer a.free(after);
                    try std.testing.expectEqualSlices(u8, before, after);
                }
                exercised += 1;
            }
        }
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, input, unchanged);
    }
    try std.testing.expectEqual(@as(usize, 6), exercised);
}
