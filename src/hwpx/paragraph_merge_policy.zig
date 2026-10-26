//! Structural source adjacency, independent of text projection and XML output.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph) !void {
    return validateMode(a, tree, left, right, false, false, false);
}

pub fn validateWithTabs(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph) !void {
    return validateMode(a, tree, left, right, true, false, false);
}

pub fn validateWithAnchors(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph) !void {
    return validateMode(a, tree, left, right, true, true, false);
}

pub fn validateWithColumnPageAreas(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph) !void {
    return validateMode(a, tree, left, right, false, false, true);
}

fn validateMode(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph, allow_tabs: bool, anchors: bool, page_areas: bool) !void {
    for ([_]*const Paragraph{ left, right }) |paragraph| {
        if (paragraph.template_element >= tree.elements.len) return error.InvalidParagraphElement;
        try @import("paragraph_structure_policy.zig").validate(a, tree, paragraph.template_element);
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
        defer a.free(locations);
        if (anchors) try @import("plain_paragraph_policy.zig").validateWithAnchors(tree, &paragraph.sites, locations, 1) else try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, allow_tabs);
    }
    const l = tree.elements[left.template_element];
    const r = tree.elements[right.template_element];
    if (!l.is(uri, "p") or !r.is(uri, "p")) return error.InvalidParagraphElement;
    if (l.parent != r.parent) return error.CrossParagraphOwner;
    if (left.template_element == right.template_element) {
        if (right.source_ordinal != null or right.generated_id == null) return error.InvalidParagraphAdjacency;
        return;
    }
    if (l.next_sibling != right.template_element) return error.InvalidParagraphAdjacency;
    if (page_areas) return @import("column_boundary_joined_metadata.zig").validateRightWithPageAreas(tree, right.template_element);
    // A right source paragraph's section/column control is not mere text:
    // never silently discard it when retaining the left paragraph's identity.
    for (tree.elements, 0..) |element, index| {
        if (element.start_tag.start < r.start_tag.end or element.end > r.end) continue;
        if (anchors) {
            // 객체 내부 선언은 그 객체의 원문과 함께 보존되며 호스트 선언이 아닙니다.
            if (try @import("paragraph_site_owner.zig").ancestor(tree, index) != right.template_element) continue;
            if (@import("run_anchor.zig").kind(tree, index) != null) continue;
        }
        if (element.is(uri, "ctrl") and @import("retained_page_number.zig").supported(tree, index)) continue;
        if (element.is(uri, "secPr") or element.is(uri, "ctrl")) return error.UnsupportedMergeMetadata;
    }
}

test "HWPX merge policy preserves owner boundaries and section metadata" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t></p:run></p:p><p:p id='3'><p:run><p:secPr/><p:t>C</p:t></p:run></p:p><p:subList><p:p id='4'><p:run><p:t>D</p:t></p:run></p:p></p:subList></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    try validate(a, &tree, &current.paragraphs[0], &current.paragraphs[1]);
    try std.testing.expectError(error.InvalidParagraphAdjacency, validate(a, &tree, &current.paragraphs[0], &current.paragraphs[2]));
    try std.testing.expectError(error.UnsupportedMergeMetadata, validate(a, &tree, &current.paragraphs[1], &current.paragraphs[2]));
    try std.testing.expectError(error.CrossParagraphOwner, validate(a, &tree, &current.paragraphs[2], &current.paragraphs[3]));
    try std.testing.expectError(error.InvalidParagraphAdjacency, validate(a, &tree, &current.paragraphs[0], &current.paragraphs[0]));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, paragraphs: []const Paragraph) !void {
            try validate(allocator, source, &paragraphs[0], &paragraphs[1]);
        }
    }.run, .{ &tree, current.paragraphs });
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX anchor merge policy distinguishes nested metadata from host metadata" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:rect><p:subList><p:p><p:run><p:t>inner</p:t></p:run></p:p></p:subList></p:rect></p:run></p:p><p:p><p:run><p:t>B</p:t><p:ctrl><p:footNote><p:subList><p:p><p:run><p:secPr/><p:t>note</p:t></p:run></p:p></p:subList></p:footNote></p:ctrl></p:run></p:p><p:p><p:run><p:secPr/><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), current.paragraphs.len);
    try validateWithAnchors(a, &tree, &current.paragraphs[0], &current.paragraphs[2]);
    try std.testing.expectError(error.UnsupportedParagraphControl, validateWithTabs(a, &tree, &current.paragraphs[0], &current.paragraphs[2]));
    try std.testing.expectError(error.UnsupportedMergeMetadata, validateWithAnchors(a, &tree, &current.paragraphs[2], &current.paragraphs[4]));
    try std.testing.expectError(error.CrossParagraphOwner, validateWithAnchors(a, &tree, &current.paragraphs[0], &current.paragraphs[1]));
    const left = &current.paragraphs[0];
    const right = &current.paragraphs[2];
    var first = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, left);
    defer first.deinit(a);
    var second = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, right);
    defer second.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepareWithAnchors(a, &tree, &first, &second, 10000);
    defer joined.deinit(a);
    const mapped = try @import("paragraph_joined_positions.zig").buildWithAnchors(a, &tree, &joined);
    defer a.free(mapped);
    const owned = try @import("paragraph_protected_positions.zig").side(a, mapped, 0, 0, true);
    defer a.free(owned);
    const saved = try @import("paragraph_joined_xml.zig").writeOwnedAnchors(a, &tree, &joined, .{}, 10000, owned);
    defer a.free(saved);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "inner"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:t>note</p:t>"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:secPr/>"));
    try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, saved, "<p:p>"));
    for (owned) |item| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, tree.sourceOf(item.element_index)));
    const root = tree.elements[0];
    const closing = root.end_tag orelse return error.InvalidPartKind;
    const wrapped = try std.mem.concat(a, u8, &.{ tree.source[root.start_tag.start..root.start_tag.end], saved, tree.source[closing.start..closing.end] });
    defer a.free(wrapped);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var host_count: usize = 0;
    var nested_count: usize = 0;
    for (reopened.elements) |element| if (element.is(uri, "p")) {
        if (element.parent == 0) host_count += 1 else nested_count += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), host_count);
    try std.testing.expectEqual(@as(usize, 2), nested_count);
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX page number merge retains zero width source setting and original session" {
    const a = std.testing.allocator;
    const control = "<p:ctrl><p:pageNum pos='BOTTOM_CENTER' formatType='DIGIT' sideChar=''/></p:ctrl>";
    const body = try std.mem.concat(a, u8, &.{ "<p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run>", control, "<p:t>B</p:t></p:run></p:p>" });
    defer a.free(body);
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, body);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const text = try session.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("AB", text);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "pageNum"));
    const reopened_text = try reopened.anchorText(0, 1);
    defer a.free(reopened_text);
    try std.testing.expectEqualStrings("AB", reopened_text);
    try std.testing.expectEqualSlices(u8, input, session.source);
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const rejoined = try session.save();
    defer a.free(rejoined);
    try std.testing.expectEqualSlices(u8, saved, rejoined);
}

test "HWPX page number merge candidate and XML allocation failures retain source" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:pageNum pos='BOTTOM_CENTER'/></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, before: *const @import("paragraph_structure_values.zig").Values) !void {
            const Joined = @import("paragraph_joined_values.zig").Joined;
            var left = try Joined.fromParagraph(allocator, &before.paragraphs[0]);
            defer left.deinit(allocator);
            var right = try Joined.fromParagraph(allocator, &before.paragraphs[1]);
            defer right.deinit(allocator);
            var joined = try @import("paragraph_joined_merge.zig").prepare(allocator, source, &left, &right, 10000);
            defer joined.deinit(allocator);
            const saved = try @import("paragraph_joined_xml.zig").write(allocator, source, &joined, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "pageNum"));
            try std.testing.expect(std.mem.indexOf(u8, saved, "BOTTOM_CENTER") != null);
        }
    }.run, .{ &tree, &current });
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqualStrings("A", current.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("B", current.paragraphs[1].sites.items[0].text);
}
