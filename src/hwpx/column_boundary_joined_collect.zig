//! Initial column inventory in current joined-piece order; not editable state.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const Position = @import("column_boundary_position.zig").Position;

pub fn collect(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, limit: usize) ![]Position {
    return collectMode(a, tree, joined, limit, false, false);
}

pub fn collectWithTabs(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, limit: usize) ![]Position {
    return collectMode(a, tree, joined, limit, true, false);
}

pub fn collectWithAnchors(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, limit: usize) ![]Position {
    return collectMode(a, tree, joined, limit, true, true);
}

test "column joined anchor actual table hosts retain declarations and nested source XML" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/borderfill.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(session.options);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer original.deinit(a);
    var candidate = try @import("paragraph_source_anchor_merge.zig").prepare(a, &section.tree, &original, 0, 4, 1000000);
    defer candidate.deinit(a);
    const paragraph = &candidate.paragraphs[0];
    try @import("column_boundary_joined_materialize.zig").installWithAnchors(a, &section.tree, paragraph, 10000);
    const xml = try @import("column_boundary_joined_xml.zig").writeWithAnchors(a, &section.tree, paragraph, options, 1000000);
    defer a.free(xml);
    var objects: usize = 0;
    var declarations: usize = 0;
    for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "tbl")) {
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, section.tree.sourceOf(index)));
            objects += 1;
        }
        if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, section.tree.sourceOf(index)));
            declarations += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 2), objects);
    try std.testing.expect(declarations > 0);
    const section_xml = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, 1000000);
    defer a.free(section_xml);
    for (section.tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "tbl")) {
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section_xml, section.tree.sourceOf(index)));
    };
    var reopened = try @import("xml_part_tree.zig").parse(a, section_xml, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var hosts: usize = 0;
    for (reopened.elements) |element| if (element.is(@import("document_xml.zig").paragraph_uri, "p") and element.parent == 0) {
        hosts += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), hosts);
    const original_count = section.last_paragraph;
    try std.testing.expect(try session.mergeParagraphPair(0, 1, 5));
    try std.testing.expect(try session.splice(0, 1, 0, 0, "호스트😀<&"));
    const current_text = try session.anchorText(0, 1);
    defer a.free(current_text);
    try std.testing.expect(std.mem.startsWith(u8, current_text, "호스트😀<&"));
    const zip = try session.save();
    defer a.free(zip);
    var reopened_session = try @import("editor_session.zig").open(a, zip, .{});
    defer reopened_session.deinit();
    try std.testing.expectEqual(original_count - 1, reopened_session.sections[0].last_paragraph);
    const reopened_text = try reopened_session.anchorText(0, 1);
    defer a.free(reopened_text);
    try std.testing.expect(std.mem.startsWith(u8, reopened_text, "호스트😀<&"));
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "column joined anchor inventory includes object width in column coordinates" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:pic/><p:ctrl><p:colPr/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p><p:run><p:rect/><p:t>C</p:t><p:ctrl><p:colPr/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    const Piece = @import("paragraph_joined_values.zig").Piece;
    var pieces = [_]Piece{
        .{ .template_element = original.paragraphs[0].template_element, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = original.paragraphs[0].sites.items.len },
        .{ .template_element = original.paragraphs[1].template_element, .source_ordinal = 2, .generated_id = null, .first_site = original.paragraphs[0].sites.items.len, .site_count = original.paragraphs[1].sites.items.len },
    };
    const view: Joined = .{ .pieces = &pieces, .sites = sites };
    try std.testing.expectError(error.UnsupportedParagraphControl, collectWithTabs(a, &tree, &view, 100));
    const boundaries = try collectWithAnchors(a, &tree, &view, 100);
    defer a.free(boundaries);
    try std.testing.expectEqual(@as(usize, 2), boundaries.len);
    try std.testing.expectEqual(@as(u32, 4), boundaries[0].unit);
    try std.testing.expectEqual(@as(u32, 7), boundaries[1].unit);
    const validate = @import("column_boundary_joined_partition.zig").validateWithAnchors;
    try validate(a, &tree, &view, boundaries);
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &view, boundaries[0..1]));
    const first = boundaries[0];
    const second = boundaries[1];
    boundaries[0].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, validate(a, &tree, &view, boundaries));
    boundaries[0] = first;
    boundaries[1].source_element = first.source_element;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &view, boundaries));
    boundaries[1] = second;
    boundaries[1].unit = 8;
    try std.testing.expectError(error.InvalidTextPosition, validate(a, &tree, &view, boundaries));
    boundaries[1] = second;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Joined) !void {
            const owned = try collectWithAnchors(allocator, parsed, current, 100);
            defer allocator.free(owned);
            try @import("column_boundary_joined_partition.zig").validateWithAnchors(allocator, parsed, current, owned);
            const source: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = current.pieces[0].template_element, .source_ordinal = 1, .sites = current.sites, .pieces = current.pieces };
            var candidate = try source.clone(allocator);
            defer candidate.deinit(allocator);
            @import("column_boundary_joined_materialize.zig").installWithAnchors(allocator, parsed, &candidate, 100) catch |err| {
                try std.testing.expect(candidate.column_boundaries == null);
                return err;
            };
            try std.testing.expectEqualSlices(Position, owned, candidate.column_boundaries.?);
            const installed = candidate.column_boundaries.?.ptr;
            try @import("column_boundary_joined_materialize.zig").installWithAnchors(allocator, parsed, &candidate, 0);
            try std.testing.expect(installed == candidate.column_boundaries.?.ptr);
            const positions = try @import("paragraph_joined_positions.zig").buildWithAnchors(allocator, parsed, &candidate.joined().?);
            defer allocator.free(positions);
            candidate.protected_positions = try @import("paragraph_protected_positions.zig").side(allocator, positions, 0, 0, true);
            const rendered = try @import("column_boundary_joined_xml.zig").writeWithAnchors(allocator, parsed, &candidate, .{}, 10000);
            defer allocator.free(rendered);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, rendered, "<p:pic"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, rendered, "<p:rect"));
            try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, rendered, "<p:colPr"));
            candidate.column_boundaries.?[0].unit = 0;
            const moved = try @import("column_boundary_joined_xml.zig").writeWithAnchors(allocator, parsed, &candidate, .{}, 10000);
            defer allocator.free(moved);
            try std.testing.expect(std.mem.indexOf(u8, moved, "<p:colPr").? < std.mem.indexOf(u8, moved, "A😀").?);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, moved, "<p:pic"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, moved, "<p:rect"));
            const values: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = (&candidate)[0..1] };
            const section_xml = try @import("paragraph_structure_save.zig").write(allocator, parsed, &values, .{}, &.{}, 10000);
            defer allocator.free(section_xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section_xml, "<p:pic"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section_xml, "<p:rect"));
            try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, section_xml, "<p:colPr"));
            try std.testing.expect(try @import("column_boundary_joined_splice.zig").spliceGroupWithAnchors(allocator, parsed, (&candidate)[0..1], 0, 0, 0, "앞😀", 10000));
            const edited_section = try @import("paragraph_structure_save.zig").write(allocator, parsed, &values, .{}, &.{}, 10000);
            defer allocator.free(edited_section);
            try std.testing.expect(std.mem.indexOf(u8, edited_section, "앞😀") != null);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, edited_section, "<p:pic"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, edited_section, "<p:rect"));
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &tree, &view });
    try std.testing.expectError(error.LimitExceeded, collectWithAnchors(a, &tree, &view, 1));
    try std.testing.expectEqualStrings(xml, tree.source);
}

fn collectMode(a: std.mem.Allocator, tree: *const Tree, joined: *const Joined, limit: usize, allow_tabs: bool, anchors: bool) ![]Position {
    try joined.validate();
    var output: std.ArrayList(Position) = .empty;
    defer output.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var units: usize = 0;
    for (joined.pieces, 0..) |piece, index| {
        const paragraph = try joined.paragraph(index);
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, &paragraph);
        defer a.free(locations);
        if (anchors) try @import("plain_paragraph_policy.zig").validateWithAnchors(tree, &paragraph.sites, locations, 1) else try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, allow_tabs);
        const positions = if (anchors) try @import("anchor_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1) else try @import("paragraph_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
        defer a.free(positions);
        if (piece.owns_source) {
            if (piece.generated_id != null or piece.source_ordinal == null) return error.SourceBindingMismatch;
            const local = try @import("column_boundary_collect.zig").collect(a, tree, piece.template_element, positions, .right, limit -| output.items.len);
            defer a.free(local);
            for (local) |boundary| {
                if ((try seen.getOrPut(a, boundary.source_element)).found_existing) return error.DuplicateColumnBoundary;
                _ = try @import("column_boundary_xml.zig").control(tree, boundary.source_element);
                var current = boundary;
                current.unit = std.math.cast(u32, std.math.add(usize, units, boundary.unit) catch return error.LimitExceeded) orelse return error.LimitExceeded;
                if (current.unit == 0) current.affinity = .left;
                try output.append(a, current);
            }
        } else if (piece.generated_id == null or piece.source_ordinal != null) return error.SourceBindingMismatch;
        if (positions.len != 0) units = std.math.add(usize, units, positions[positions.len - 1].end_unit) catch return error.LimitExceeded;
    }
    _ = std.math.cast(u32, units) orelse return error.LimitExceeded;
    return output.toOwnedSlice(a);
}

test "column joined tab inventory counts Unicode and inline tabs in global coordinates" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀<p:tab/></p:t><p:ctrl><p:colPr/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p><p:run><p:t>C<p:tab/></p:t><p:ctrl><p:colPr/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var first_sites: usize = 0;
    for (locations) |location| if (location.paragraph_ordinal == 1) {
        first_sites += 1;
    };
    var pieces: [2]@import("paragraph_joined_values.zig").Piece = undefined;
    var found: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
        pieces[found] = .{ .template_element = index, .source_ordinal = found + 1, .generated_id = null, .first_site = if (found == 0) 0 else first_sites, .site_count = if (found == 0) first_sites else sites.items.len - first_sites };
        found += 1;
    };
    const view: Joined = .{ .pieces = &pieces, .sites = sites };
    try std.testing.expectError(error.UnsupportedInlineControl, collect(a, &tree, &view, 100));
    const boundaries = try collectWithTabs(a, &tree, &view, 100);
    defer a.free(boundaries);
    try std.testing.expectEqual(@as(usize, 2), boundaries.len);
    try std.testing.expectEqual(@as(u32, 4), boundaries[0].unit);
    try std.testing.expectEqual(@as(u32, 7), boundaries[1].unit);
    const validate = @import("column_boundary_joined_partition.zig").validateWithTabs;
    try validate(a, &tree, &view, boundaries);
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &view, boundaries[0..1]));
    const original_first = boundaries[0];
    boundaries[0].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, validate(a, &tree, &view, boundaries));
    boundaries[0] = original_first;
    boundaries[0].source_element = boundaries[1].source_element;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &view, boundaries));
    boundaries[0] = original_first;
    boundaries[1].unit = 8;
    try std.testing.expectError(error.InvalidTextPosition, validate(a, &tree, &view, boundaries));
    boundaries[1].unit = 7;
    const paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = pieces[0].template_element, .source_ordinal = 1, .sites = sites, .pieces = &pieces, .column_boundaries = boundaries };
    var edited = try paragraph.clone(a);
    defer edited.deinit(a);
    const splice = @import("column_boundary_joined_splice.zig").spliceWithTabs;
    try std.testing.expectError(error.ProtectedInlineControl, splice(a, &tree, &edited, 3, 1, "", 10000));
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &tree, &edited, 2, 0, "x", 10000));
    try std.testing.expectError(error.InvalidXmlCharacter, splice(a, &tree, &edited, 0, 0, &.{0}, 10000));
    try std.testing.expect(!try splice(a, &tree, &edited, 0, 3, "A😀", 10000));
    try std.testing.expectEqualDeep(boundaries, edited.column_boundaries.?);
    try std.testing.expectEqualStrings(sites.items[0].text, edited.sites.items[0].text);
    var borrowed_rows = [_]@import("paragraph_structure_values.zig").Paragraph{paragraph};
    const borrowed: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &borrowed_rows };
    var current_split = try @import("column_boundary_joined_tab_split_values.zig").prepare(a, &tree, &borrowed, 0, 4, 4, 2, 10000);
    defer current_split.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), current_split.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 0), current_split.paragraphs[0].column_boundaries.?.len);
    try std.testing.expectEqual(@as(usize, 2), current_split.paragraphs[1].column_boundaries.?.len);
    try std.testing.expectEqual(@as(usize, 1), current_split.paragraphs[0].protected_positions.?.len);
    try std.testing.expectEqual(@as(usize, 1), current_split.paragraphs[1].protected_positions.?.len);
    const split_xml = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &tree, &current_split, .{}, &.{}, 10000);
    defer a.free(split_xml);
    var split_tree = try @import("xml_part_tree.zig").parse(a, split_xml, .section, 0, 0, .{});
    defer split_tree.deinit(a);
    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &tree, &current_split, &split_tree, .{}, 10000);
    var repeated = try @import("paragraph_structure_split.zig").prepare(a, &tree, &current_split, 1, 1, 1, 3, 10000);
    defer repeated.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), repeated.paragraphs.len);
    try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &repeated, 2, 0, 0, "입력😀", 10000));
    const repeated_xml = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &tree, &repeated, .{}, &.{}, 10000);
    defer a.free(repeated_xml);
    var repeated_tree = try @import("xml_part_tree.zig").parse(a, repeated_xml, .section, 0, 0, .{});
    defer repeated_tree.deinit(a);
    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &tree, &repeated, &repeated_tree, .{}, 10000);
    var remerged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &repeated, 1, 10000);
    defer remerged.deinit(a);
    try @import("column_boundary_tab_roundtrip_test.zig").verifyMergedText(a, &tree, &repeated.paragraphs[1], &repeated.paragraphs[2], &remerged.paragraphs[1], 10000);
    const remerged_xml = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &tree, &remerged, .{}, &.{}, 10000);
    defer a.free(remerged_xml);
    var remerged_tree = try @import("xml_part_tree.zig").parse(a, remerged_xml, .section, 0, 0, .{});
    defer remerged_tree.deinit(a);
    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &tree, &remerged, &remerged_tree, .{}, 10000);
    var complete = try @import("column_boundary_joined_tab_merge.zig").prepare(a, &tree, &remerged, 0, 10000);
    defer complete.deinit(a);
    try @import("column_boundary_tab_roundtrip_test.zig").verifyMergedText(a, &tree, &remerged.paragraphs[0], &remerged.paragraphs[1], &complete.paragraphs[0], 10000);
    const complete_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &complete, .{}, &.{}, 10000);
    defer a.free(complete_xml);
    var complete_tree = try @import("xml_part_tree.zig").parse(a, complete_xml, .section, 0, 0, .{});
    defer complete_tree.deinit(a);
    try @import("column_boundary_tab_roundtrip_test.zig").verify(a, &tree, &complete, &complete_tree, .{}, 10000);
    const original_column = current_split.paragraphs[1].column_boundaries.?[0].source_element;
    current_split.paragraphs[1].column_boundaries.?[0].source_element = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, @import("column_boundary_joined_tab_split_values.zig").prepare(a, &tree, &current_split, 1, 1, 1, 3, 10000));
    current_split.paragraphs[1].column_boundaries.?[0].source_element = original_column;
    try @import("column_boundary_joined_group.zig").validateWithTabs(a, &tree, current_split.paragraphs);
    var saved_tabs: usize = 0;
    var saved_columns: usize = 0;
    for (split_tree.elements) |element| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "tab")) saved_tabs += 1;
        if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) saved_columns += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), saved_tabs);
    try std.testing.expectEqual(@as(usize, 2), saved_columns);
    for ([_]u32{ 0, 1, 3, 4, 5, 6, 7 }) |boundary| {
        var split = try @import("column_boundary_joined_tab_split.zig").prepare(a, &tree, &paragraph, boundary, boundary, 10000);
        defer split.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), split.columns.left.len + split.columns.right.len);
        try std.testing.expectEqual(@as(usize, 2), split.text.tabs.left.len + split.text.tabs.right.len);
        if (boundary == 4) {
            try std.testing.expectEqual(@as(usize, 0), split.columns.left.len);
            try std.testing.expectEqual(@as(u32, 0), split.columns.right[0].unit);
            try std.testing.expectEqual(@as(u32, 3), split.columns.right[1].unit);
            try std.testing.expectEqual(@as(usize, 1), split.text.tabs.left.len);
            try std.testing.expectEqual(@as(usize, 2), split.text.tabs.right[0].unit);
        }
    }
    try std.testing.expectError(error.SplitSurrogatePair, @import("column_boundary_joined_tab_split.zig").prepare(a, &tree, &paragraph, 2, 2, 10000));
    try std.testing.expectError(error.ProtectedInlineControl, @import("column_boundary_joined_tab_split.zig").prepare(a, &tree, &paragraph, 3, 4, 10000));
    const saved = try @import("column_boundary_joined_xml.zig").writeWithTabs(a, &tree, &paragraph, .{}, 10000);
    defer a.free(saved);
    const root = tree.elements[0];
    const wrapped = try std.mem.concat(a, u8, &.{ tree.source[root.start_tag.start..root.start_tag.end], saved, tree.source[root.end_tag.?.start..root.end_tag.?.end] });
    defer a.free(wrapped);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var tabs: usize = 0;
    var columns: usize = 0;
    for (reopened.elements) |element| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "tab")) tabs += 1;
        if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) columns += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), tabs);
    try std.testing.expectEqual(@as(usize, 2), columns);
    try std.testing.expectError(error.LimitExceeded, collectWithTabs(a, &tree, &view, 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, current: *const Joined) !void {
            const output = try collectWithTabs(allocator, source, current, 100);
            defer allocator.free(output);
            try @import("column_boundary_joined_partition.zig").validateWithTabs(allocator, source, current, output);
            var owner: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = current.pieces[0].template_element, .source_ordinal = 1, .sites = current.sites, .pieces = current.pieces };
            try @import("column_boundary_joined_materialize.zig").installWithTabs(allocator, source, &owner, 100);
            defer allocator.free(owner.column_boundaries.?);
            const bytes = try @import("column_boundary_joined_xml.zig").writeWithTabs(allocator, source, &owner, .{}, 10000);
            defer allocator.free(bytes);
            const source_locations = try @import("text_site_locations.zig").build(allocator, source, &current.sites, .{});
            defer allocator.free(source_locations);
            var report: @import("section_text.zig").Report = .{};
            var values = try @import("paragraph_structure_collect.zig").collect(allocator, source, &current.sites, source_locations, .{}, &report);
            defer values.deinit(allocator);
            var owned_candidate = try @import("column_boundary_source_merge.zig").prepareOwnedTabs(allocator, source, &values, 0, 10000);
            defer owned_candidate.deinit(allocator);
            const owned_saved = try @import("paragraph_structure_save.zig").write(allocator, source, &owned_candidate, .{}, &.{}, 10000);
            defer allocator.free(owned_saved);
            var owned_parsed = try @import("xml_part_tree.zig").parse(allocator, owned_saved, .section, 0, 0, .{});
            defer owned_parsed.deinit(allocator);
            try @import("column_boundary_tab_roundtrip_test.zig").verify(allocator, source, &owned_candidate, &owned_parsed, .{}, 10000);
            var candidate = try @import("column_boundary_source_merge.zig").prepareWithTabs(allocator, source, &values, 0, 10000);
            defer candidate.deinit(allocator);
            _ = try @import("column_boundary_joined_splice.zig").spliceWithTabs(allocator, source, &candidate.paragraphs[0], 0, 0, "열😀", 10000);
            try std.testing.expectEqual(@as(u32, 7), candidate.paragraphs[0].column_boundaries.?[0].unit);
            try std.testing.expectEqual(@as(u32, 10), candidate.paragraphs[0].column_boundaries.?[1].unit);
            var split = try @import("column_boundary_joined_tab_split.zig").prepare(allocator, source, &candidate.paragraphs[0], 7, 7, 10000);
            defer split.deinit(allocator);
            var split_values = try @import("column_boundary_joined_tab_split_values.zig").prepare(allocator, source, &candidate, 0, 7, 7, 2, 10000);
            defer split_values.deinit(allocator);
            const split_saved = try @import("paragraph_structure_save.zig").writeWithColumnTabs(allocator, source, &split_values, .{}, &.{}, 10000);
            defer allocator.free(split_saved);
            var reparsed = try @import("xml_part_tree.zig").parse(allocator, split_saved, .section, 0, 0, .{});
            defer reparsed.deinit(allocator);
            try @import("column_boundary_tab_roundtrip_test.zig").verify(allocator, source, &split_values, &reparsed, .{}, 10000);
            var repeated_values = try @import("column_boundary_joined_tab_split_values.zig").prepare(allocator, source, &split_values, 1, 1, 1, 3, 10000);
            defer repeated_values.deinit(allocator);
            _ = try @import("column_boundary_joined_splice.zig").spliceGroupWithTabs(allocator, source, repeated_values.paragraphs, 2, 0, 0, "입력😀", 10000);
            const repeated_saved = try @import("paragraph_structure_save.zig").writeWithColumnTabs(allocator, source, &repeated_values, .{}, &.{}, 10000);
            defer allocator.free(repeated_saved);
            var repeated_parsed = try @import("xml_part_tree.zig").parse(allocator, repeated_saved, .section, 0, 0, .{});
            defer repeated_parsed.deinit(allocator);
            try @import("column_boundary_tab_roundtrip_test.zig").verify(allocator, source, &repeated_values, &repeated_parsed, .{}, 10000);
            var remerged_values = try @import("column_boundary_joined_tab_merge.zig").prepare(allocator, source, &repeated_values, 1, 10000);
            defer remerged_values.deinit(allocator);
            try @import("column_boundary_tab_roundtrip_test.zig").verifyMergedText(allocator, source, &repeated_values.paragraphs[1], &repeated_values.paragraphs[2], &remerged_values.paragraphs[1], 10000);
            const remerged_saved = try @import("paragraph_structure_save.zig").writeWithColumnTabs(allocator, source, &remerged_values, .{}, &.{}, 10000);
            defer allocator.free(remerged_saved);
            var remerged_parsed = try @import("xml_part_tree.zig").parse(allocator, remerged_saved, .section, 0, 0, .{});
            defer remerged_parsed.deinit(allocator);
            try @import("column_boundary_tab_roundtrip_test.zig").verify(allocator, source, &remerged_values, &remerged_parsed, .{}, 10000);
            const section = try @import("paragraph_structure_save.zig").writeWithColumnTabs(allocator, source, &candidate, .{}, &.{}, 10000);
            defer allocator.free(section);
        }
    }.run, .{ &tree, &view });
    try std.testing.expectEqualStrings(xml, tree.source);
}
