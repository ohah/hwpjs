const std = @import("std");
const plan_mod = @import("anchor_split_plan.zig");

test "HWPX anchor split plan keeps tab identity after current text edits" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀<p:tab width='100'/>B</p:t><p:pic/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const before = try plan_mod.build(a, &tree, &sites, locations, 1, 3, 3);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 2), before.len);
    try std.testing.expectEqual(.tab, before[0].kind);
    try std.testing.expectEqual(@as(usize, 0), before[0].unit);
    try std.testing.expectEqual(@as(usize, 2), before[1].unit);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "앞😀", 1000));
    const after = try plan_mod.build(a, &tree, &sites, locations, 1, 6, 6);
    defer a.free(after);
    try std.testing.expectEqualSlices(plan_mod.Move, before, after);
    var draft = try @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, 1, 6, 6, 1000);
    defer draft.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), draft.left.items.len);
    try std.testing.expectEqualStrings("앞😀A😀", draft.left.items[0].text);
    try std.testing.expectEqualStrings("", draft.right.items[0].text);
    try std.testing.expectEqualStrings("", draft.left.items[1].text);
    try std.testing.expectEqualStrings("B", draft.right.items[1].text);
    try std.testing.expectError(error.ProtectedInlineControl, @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, 1, 6, 7, 1000));
    try std.testing.expectError(error.SplitSurrogatePair, @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, 1, 5, 5, 1000));
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, 1, 6, 6, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, current: *const @import("text_sites.zig").Sites, bound: []const @import("section_text.zig").Location) !void {
            var prepared = try @import("paragraph_split_text.zig").prepareAnchored(allocator, source, current, bound, 1, 6, 6, 1000);
            defer prepared.deinit(allocator);
        }
    }.run, .{ &tree, &sites, locations });
    try std.testing.expectError(error.ProtectedInlineControl, plan_mod.build(a, &tree, &sites, locations, 1, 6, 7));
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX anchor split plan actual pictures lines and notes retain subtree identity" {
    const a = std.testing.allocator;
    const cases = [_]struct { path: []const u8, paragraphs: []const usize, count: usize }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", .paragraphs = &.{ 1, 4 }, .count = 2 },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", .paragraphs = &.{1}, .count = 2 },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx", .paragraphs = &.{ 1, 2 }, .count = 1 },
    };
    for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(2_000_000));
        defer a.free(bytes);
        var document = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var tree = try document.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        const original_xml = try a.dupe(u8, tree.source);
        defer a.free(original_xml);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        for (case.paragraphs) |paragraph| {
            const segments = try @import("anchor_text_positions.zig").build(a, &tree, &sites, locations, paragraph);
            defer a.free(segments);
            const end = segments[segments.len - 1].end_unit;
            var text_draft = try @import("paragraph_split_text.zig").prepareAnchored(a, &tree, &sites, locations, paragraph, 0, 0, 2_000_000);
            defer text_draft.deinit(a);
            var selected: usize = 0;
            for (sites.items, locations) |site, location| {
                if (location.paragraph_ordinal != paragraph) continue;
                try std.testing.expectEqualStrings("", text_draft.left.items[selected].text);
                try std.testing.expectEqualStrings(site.text, text_draft.right.items[selected].text);
                selected += 1;
            }
            try std.testing.expectEqual(selected, text_draft.right.items.len);
            const before = try plan_mod.build(a, &tree, &sites, locations, paragraph, 0, 0);
            defer a.free(before);
            const after = try plan_mod.build(a, &tree, &sites, locations, paragraph, end, end);
            defer a.free(after);
            const left_xml = try @import("paragraph_split_xml.zig").writeAnchored(a, &tree, &sites, locations, .{}, paragraph, 0, 0, false, 0, 2_000_000);
            defer a.free(left_xml);
            const right_xml = try @import("paragraph_split_xml.zig").writeAnchored(a, &tree, &sites, locations, .{}, paragraph, 0, 0, true, 0xffffffff, 2_000_000);
            defer a.free(right_xml);
            try std.testing.expectEqual(case.count, before.len);
            try std.testing.expectEqual(case.count, after.len);
            for (before, after) |right, left| {
                try std.testing.expectEqual(right.element_index, left.element_index);
                try std.testing.expectEqual(.right, right.side);
                try std.testing.expectEqual(.left, left.side);
                try std.testing.expectEqual(right.unit, left.unit);
                const element = tree.elements[right.element_index];
                const raw_object = tree.source[element.start_tag.start..element.end];
                try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, left_xml, raw_object));
                try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, right_xml, raw_object));
                const run = tree.elements[element.parent.?];
                try std.testing.expect(run.is(@import("document_xml.zig").paragraph_uri, "run"));
                const owner = run.parent.?;
                // 바깥 문단의 직접 run 개체만 반환하며 하위 문단 요소는 포함하지 않습니다.
                for (segments) |segment| if (segment.kind == .anchor and segment.index == right.element_index) {
                    const middle = try plan_mod.build(a, &tree, &sites, locations, paragraph, segment.start_unit, segment.start_unit);
                    defer a.free(middle);
                    for (middle) |move| {
                        try std.testing.expectEqual(owner, tree.elements[tree.elements[move.element_index].parent.?].parent.?);
                    }
                    try std.testing.expectError(error.ProtectedInlineControl, plan_mod.build(a, &tree, &sites, locations, paragraph, segment.start_unit, segment.end_unit));
                };
            }
        }
        try std.testing.expectEqualSlices(u8, original_xml, tree.source);
    }
}
