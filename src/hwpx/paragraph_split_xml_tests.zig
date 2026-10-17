const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const text_split = @import("paragraph_split_text.zig");
const xml_split = @import("paragraph_split_xml.zig");

test "HWPX split XML real root and nested paragraphs reparse with text and owner preserved" {
    try @import("../testing/checked_allocator.zig").run(verifyActualParagraphSplits, .{});
}

fn verifyActualParagraphSplits(a: std.mem.Allocator) !void {
    var exercised: usize = 0;
    for ([_][]const u8{ "charshape", "table", "table-bug" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        for (session.sections) |*section| {
            var candidates: std.ArrayList(usize) = .empty;
            defer candidates.deinit(a);
            for (section.first_paragraph..section.last_paragraph + 1) |paragraph| {
                @import("plain_paragraph_policy.zig").validate(&section.tree, &section.sites, section.locations, paragraph) catch |err| switch (err) {
                    error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.MissingTextSite => continue,
                    else => return err,
                };
                try candidates.append(a, paragraph);
            }
            if (candidates.items.len == 0) continue;
            for ([_]usize{ candidates.items[0], candidates.items[candidates.items.len / 2], candidates.items[candidates.items.len - 1] }) |paragraph| {
                const positions = try @import("paragraph_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, paragraph);
                defer a.free(positions);
                const end: u32 = @intCast(positions[positions.len - 1].end_unit);
                for ([_]u32{ 0, end / 2, end }) |at| {
                    var draft = text_split.prepare(a, &section.tree, &section.sites, section.locations, paragraph, at, at, 4_000_000) catch |err| switch (err) {
                        error.SplitSurrogatePair => continue,
                        else => return err,
                    };
                    defer draft.deinit(a);
                    const id = try @import("paragraph_instance_ids.zig").next(a, &.{section.tree}, &.{}, 2_000_000);
                    const left = try xml_split.write(a, &section.tree, &draft, false, 0, 4_000_000);
                    defer a.free(left);
                    const right = try xml_split.write(a, &section.tree, &draft, true, id, 4_000_000);
                    defer a.free(right);
                    const owner = section.tree.elements[draft.paragraph_element];
                    const complete = try @import("paragraph_split_section.zig").write(a, &section.tree, &draft, id, 4_000_000);
                    defer a.free(complete);
                    try std.testing.expect(std.mem.startsWith(u8, complete, section.tree.source[0..owner.start_tag.start]));
                    try std.testing.expect(std.mem.endsWith(u8, complete, section.tree.source[owner.end..]));
                    try std.testing.expectEqualStrings(left, complete[owner.start_tag.start..][0..left.len]);
                    try std.testing.expectEqualStrings(right, complete[owner.start_tag.start + left.len ..][0..right.len]);
                    var reopened = try tree_mod.parse(a, complete, .section, section.tree.section_ordinal, section.tree.item_index, .{});
                    defer reopened.deinit(a);
                    var new_sites = try @import("text_sites.zig").collect(a, &reopened, .{});
                    defer new_sites.deinit(a);
                    const new_locations = try @import("text_site_locations.zig").build(a, &reopened, &new_sites, .{});
                    defer a.free(new_locations);
                    const local_paragraph = paragraph - section.first_paragraph + 1;
                    var texts: [2]std.ArrayList(u8) = .{ .empty, .empty };
                    defer for (&texts) |*text| text.deinit(a);
                    for (new_sites.items, new_locations) |site, location| {
                        if (location.paragraph_ordinal == local_paragraph) try texts[0].appendSlice(a, site.text);
                        if (location.paragraph_ordinal == local_paragraph + 1) try texts[1].appendSlice(a, site.text);
                    }
                    for ([_]@import("text_sites.zig").Sites{ draft.left, draft.right }, &texts) |expected, actual| {
                        var wanted: std.ArrayList(u8) = .empty;
                        defer wanted.deinit(a);
                        for (expected.items) |site| try wanted.appendSlice(a, site.text);
                        try std.testing.expectEqualStrings(wanted.items, actual.items);
                    }
                    const first = try @import("paragraph_site_owner.zig").resolve(&reopened, &new_sites, new_locations, local_paragraph);
                    const second = try @import("paragraph_site_owner.zig").resolve(&reopened, &new_sites, new_locations, local_paragraph + 1);
                    try std.testing.expectEqual(reopened.elements[first].parent, reopened.elements[second].parent);
                    const new_id = (try reopened.attributeValue(a, second, "", "id")).?;
                    const id_text = try new_id.toUtf8(a, 100);
                    defer a.free(id_text);
                    try std.testing.expectEqual(id, try @import("xml_values.zig").unsigned32(id_text));
                    exercised += 1;
                }
            }
        }
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, input, saved);
    }
    try std.testing.expect(exercised >= 9);
}
