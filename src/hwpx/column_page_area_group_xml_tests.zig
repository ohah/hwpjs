const std = @import("std");

test "mixed declaration public resplit covers every source and generated body boundary" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    for (0..6) |first| for ([_]usize{ 1, 2 }) |paragraph| {
        const length = if (paragraph == 1) first else 5 - first;
        for (0..length + 1) |second| {
            var session = try @import("editor_session.zig").open(a, input, .{});
            defer session.deinit();
            _ = try session.mergeParagraphPair(0, 1, 2);
            const header = try session.anchorText(0, 2);
            defer a.free(header);
            const footer = try session.anchorText(0, 3);
            defer a.free(footer);
            _ = try session.splitParagraph(0, 1, @intCast(first), 0);
            const baseline = try session.save();
            defer a.free(baseline);
            var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
            defer history.deinit();
            try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = paragraph, .start = @intCast(second), .deleted = 0, .inserted = "" }));
            const saved = try session.save();
            defer a.free(saved);
            var reopened = try @import("editor_session.zig").open(a, saved, .{});
            defer reopened.deinit();
            try std.testing.expectEqual(@as(usize, 5), reopened.sections[0].last_paragraph);
            const text = "첫 페이지";
            const seam = try @import("text_site_edit.zig").bytePosition(text, @intCast(first));
            const selected = if (paragraph == 1) text[0..seam] else text[seam..];
            const cut = try @import("text_site_edit.zig").bytePosition(selected, @intCast(second));
            const bodies = if (paragraph == 1) [_][]const u8{ selected[0..cut], selected[cut..], text[seam..] } else [_][]const u8{ text[0..seam], selected[0..cut], selected[cut..] };
            const expected = if (first == 5 and paragraph == 2) [_][]const u8{ bodies[0], bodies[1], header, footer, bodies[2] } else [_][]const u8{ bodies[0], bodies[1], bodies[2], header, footer };
            for (expected, 1..) |value, ordinal| {
                const before = try session.anchorText(0, ordinal);
                defer a.free(before);
                const after = try reopened.anchorText(0, ordinal);
                defer a.free(after);
                try std.testing.expectEqualStrings(value, before);
                try std.testing.expectEqualStrings(value, after);
            }
            try std.testing.expect(try history.undo(&session));
            const undone = try session.save();
            defer a.free(undone);
            try std.testing.expectEqualSlices(u8, baseline, undone);
            try std.testing.expect(try history.redo(&session));
            const redone = try session.save();
            defer a.free(redone);
            try std.testing.expectEqualSlices(u8, saved, redone);
        }
    };
}

test "mixed declaration public remerge restores split ZIP and retains followup text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    for (0..6) |cut| for ([_]usize{ 1, 2 }) |paragraph| {
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        _ = try session.mergeParagraphPair(0, 1, 2);
        const baseline = try session.save();
        defer a.free(baseline);
        _ = try session.splitParagraph(0, 1, @intCast(cut), 0);
        const split = try session.save();
        defer a.free(split);
        var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .merge, .paragraph = 1, .right_paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
        const restored = try session.save();
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, baseline, restored);
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, split, undone);
        _ = try session.splice(0, paragraph, 0, 0, "후속😀<&");
        const left = try session.anchorText(0, 1);
        defer a.free(left);
        const right = try session.anchorText(0, 2);
        defer a.free(right);
        const expected = try std.mem.concat(a, u8, &.{ left, right });
        defer a.free(expected);
        _ = try session.mergeParagraphPair(0, 1, 2);
        const typed = try session.save();
        defer a.free(typed);
        var reopened = try @import("editor_session.zig").open(a, typed, .{});
        defer reopened.deinit();
        const actual = try reopened.anchorText(0, 1);
        defer a.free(actual);
        try std.testing.expectEqualStrings(expected, actual);
    };
}

test "mixed declaration public followup input preserves split groups and history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    for ([_]u32{ 0, 1, 5 }) |cut| for ([_]usize{ 1, 2 }) |paragraph| {
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        _ = try session.mergeParagraphPair(0, 1, 2);
        _ = try session.splitParagraph(0, 1, cut, 0);
        const before = try session.anchorText(0, paragraph);
        defer a.free(before);
        const baseline = try session.save();
        defer a.free(baseline);
        var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "후속😀<&" }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        const expected = try std.mem.concat(a, u8, &.{ "후속😀<&", before });
        defer a.free(expected);
        const actual = try reopened.anchorText(0, paragraph);
        defer a.free(actual);
        try std.testing.expectEqualStrings(expected, actual);
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, baseline, undone);
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
        try std.testing.expectError(error.SplitSurrogatePair, session.splice(0, paragraph, 3, 0, "거부"));
        try std.testing.expectError(error.InvalidXmlCharacter, session.splice(0, paragraph, 0, 0, &.{0}));
        try std.testing.expect(!try session.splice(0, paragraph, 0, 0, ""));
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, saved, unchanged);
    };
}

test "mixed declaration public split ZIP reopen and history preserve actual document" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    for (0..6) |cut| {
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
        _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
        _ = try session.mergeParagraphPair(0, 1, 2);
        const header = try session.anchorText(0, 2);
        defer a.free(header);
        const footer = try session.anchorText(0, 3);
        defer a.free(footer);
        const baseline = try session.save();
        defer a.free(baseline);
        var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = @intCast(cut), .deleted = 0, .inserted = "" }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        try std.testing.expectEqual(@as(usize, 4), reopened.sections[0].last_paragraph);
        const body = "첫 페이지";
        const byte = try @import("text_site_edit.zig").bytePosition(body, @intCast(cut));
        const expected = [_][]const u8{ body[0..byte], body[byte..], header, footer };
        for (expected, 1..) |text, ordinal| {
            const current_text = try session.anchorText(0, ordinal);
            defer a.free(current_text);
            try std.testing.expectEqualStrings(text, current_text);
            const actual = try reopened.anchorText(0, ordinal);
            defer a.free(actual);
            try std.testing.expectEqualStrings(text, actual);
        }
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, baseline, undone);
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
    }
}

test "mixed declaration full section save retains split topology and nested edits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    _ = try session.mergeParagraphPair(0, 1, 2);
    const section = &session.sections[0];
    const current = &section.structure_values.?;
    const options = @import("editor_session.zig").siteOptions(session.options);
    for (0..6) |cut| {
        var candidate = try @import("column_page_area_structure_split.zig").prepare(a, &section.tree, current, 0, @intCast(cut), @intCast(cut), 999, 4000000);
        defer candidate.deinit(a);
        const xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, 4000000);
        defer a.free(xml);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "머리😀"));
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "꼬리&lt;&amp;"));
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var top: usize = 0;
        var total: usize = 0;
        for (tree.elements) |element| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
            total += 1;
            if (element.parent == 0) top += 1;
        };
        try std.testing.expectEqual(@as(usize, 2), top);
        try std.testing.expectEqual(@as(usize, 4), total);
    }
    var relocated = try current.clone(a);
    defer relocated.deinit(a);
    relocated.paragraphs[0].page_area_positions.?[0].unit = 0;
    relocated.paragraphs[0].page_area_positions.?[0].affinity = .left;
    var candidate = try @import("column_page_area_structure_split.zig").prepare(a, &section.tree, &relocated, 0, 1, 1, 999, 4000000);
    defer candidate.deinit(a);
    const xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, 4000000);
    defer a.free(xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "머리😀"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "꼬리&lt;&amp;"));
}

test "mixed declaration group XML preserves both inventories through split and reparse" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
    defer original.deinit(a);
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    _ = try session.mergeParagraphPair(0, 1, 2);
    const current = &section.structure_values.?;
    const source = &section.tree;
    for (0..6) |cut| {
        var candidate = try @import("column_page_area_structure_split.zig").prepare(a, source, current, 0, @intCast(cut), @intCast(cut), 999, 4000000);
        defer candidate.deinit(a);
        const hosts = candidate.paragraphs[0..2];
        const output = try @import("page_area_group_xml.zig").writeWithColumnPageAreas(a, source, hosts, .{}, 4000000);
        defer a.free(output);
        const edited = try @import("page_area_group_xml.zig").writeCurrentWithColumnPageAreas(a, source, hosts, &candidate, &original, .{}, 4000000);
        defer a.free(edited);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, edited, "머리😀"));
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, edited, "꼬리&lt;&amp;"));
        if (cut == 1) try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, rows: []const @import("paragraph_structure_values.zig").Paragraph, expected: []const u8) !void {
                const actual = try @import("page_area_group_xml.zig").writeWithColumnPageAreas(allocator, tree, rows, .{}, 4000000);
                defer allocator.free(actual);
                try std.testing.expectEqualSlices(u8, expected, actual);
            }
        }.run, .{ source, @as([]const @import("paragraph_structure_values.zig").Paragraph, hosts), @as([]const u8, output) });
        for (current.paragraphs[0].column_boundaries.?) |column| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, source.sourceOf(column.source_element)));
        for (current.paragraphs[0].page_area_positions.?) |area| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, source.sourceOf(area.source_element)));
        const wrapped = try std.mem.concat(a, u8, &.{ source.source[source.elements[0].start_tag.start..source.elements[0].start_tag.end], output, source.source[source.elements[0].end_tag.?.start..source.elements[0].end_tag.?.end] });
        defer a.free(wrapped);
        var tree = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
        defer tree.deinit(a);
        const left = tree.elements[0].first_child.?;
        const right = tree.elements[left].next_sibling.?;
        try std.testing.expect(tree.elements[right].next_sibling == null);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &sites, locations, 2);
        defer a.free(positions);
        const areas = try @import("page_area_source_positions.zig").collect(a, &tree, right, positions, tree.elements.len);
        defer a.free(areas);
        try std.testing.expectEqual(@as(usize, 2), areas.len);
        for (areas) |area| try std.testing.expectEqual(@as(u32, @intCast(5 - cut)), area.unit);
        const left_areas = try @import("page_area_source_positions.zig").collect(a, &tree, left, &.{}, tree.elements.len);
        defer a.free(left_areas);
        try std.testing.expectEqual(@as(usize, 0), left_areas.len);
    }
}
