const std = @import("std");
const t = std.testing;
const Tree = @import("xml_part_tree.zig").Tree;
const V = @import("paragraph_structure_values.zig");
const helper = @import("empty_continuation_style.zig");
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0'><p:run charPrIDRef='6'><p:t>AB</p:t></p:run><p:run charPrIDRef='5'><p:t>CD</p:t></p:run></p:p></s:sec>";
fn values(a: std.mem.Allocator, tree: *const Tree) !V.Values {
    var sites = try @import("text_sites.zig").collect(a, tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, tree, &sites, .{});
    defer a.free(locations);
    var count: @import("section_text.zig").Report = .{};
    return @import("paragraph_structure_collect.zig").collect(a, tree, &sites, locations, .{}, &count);
}
fn run(a: std.mem.Allocator, tree: *const Tree, before: *const V.Values) !void {
    var after = try @import("paragraph_structure_split.zig").prepare(a, tree, before, 0, 4, 4, 2, 100000);
    defer after.deinit(a);
    const right = &after.paragraphs[1];
    const length = right.sites.items.len;
    helper.apply(a, tree, &before.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100) catch |err| {
        try t.expect(right.character_styles == null);
        try t.expectEqual(length, right.sites.items.len);
        for (right.sites.items) |site| try t.expectEqual(@as(usize, 0), site.text.len);
        return err;
    };
    try t.expectEqual(@as(usize, 2), right.sites.items.len);
    try t.expectEqual(@as(?u32, 5), right.character_styles.?[0].char_shape_id);
    try t.expectEqual(@as(?u32, 5), right.character_styles.?[1].char_shape_id);
    var cloned = try right.clone(a);
    defer cloned.deinit(a);
    try t.expectEqual(@as(?u32, 5), cloned.character_styles.?[0].char_shape_id);
}
test "continuation helper OOM keeps all source sites and uncommitted style atomic" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var original = try values(a, &tree);
    defer original.deinit(a);
    var counter = t.FailingAllocator.init(a, .{});
    var nr: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
    try run(nr.allocator(), &tree, &original);
    if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
    try @import("../testing/allocation_failures.zig").check(run, .{ &tree, &original });
    try t.expect(original.paragraphs[0].character_styles == null);
    try t.expectEqualStrings("AB", original.paragraphs[0].sites.items[0].text);
    try t.expectEqualStrings("CD", original.paragraphs[0].sites.items[1].text);
}
test "continuation helper rejects altered binding invalid resource and span budget without mutation" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var original = try values(a, &tree);
    defer original.deinit(a);
    var after = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 4, 4, 2, 100000);
    defer after.deinit(a);
    const right = &after.paragraphs[1];
    try t.expectError(error.LimitExceeded, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 1));
    try t.expect(right.character_styles == null);
    try t.expectError(error.InvalidResourceReference, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 6 }, 100));
    try t.expect(right.character_styles == null);
    const saved = right.sites.items[0].start;
    right.sites.items[0].start += 1;
    try t.expectError(error.InvalidTextSites, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    right.sites.items[0].start = saved;
    try helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100);
    const complete = right.character_styles.?;
    right.character_styles = complete[0..1];
    try t.expectError(error.InvalidTextSites, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    right.character_styles = complete;
    const first = complete[0];
    complete[0] = complete[1];
    complete[1] = first;
    try t.expectError(error.SourceBindingMismatch, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    complete[1] = complete[0];
    complete[0] = first;
    const element = original.paragraphs[0].sites.items[0].element_index;
    const child = tree.elements[element].first_child;
    tree.elements[element].first_child = tree.elements.len;
    try t.expectError(error.SourceBindingMismatch, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
    tree.elements[element].first_child = child;
    right.character_styles.?[0].run_element = 0;
    try t.expectError(error.SourceBindingMismatch, helper.apply(a, &tree, &original.paragraphs[0], right, 4, 4, &.{ 3, 5, 6 }, 100));
}
test "continuation helper leaves middle split and selected deletion policy unchanged" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var original = try values(a, &tree);
    defer original.deinit(a);
    var middle = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 2, 2, 2, 100000);
    defer middle.deinit(a);
    try helper.apply(a, &tree, &original.paragraphs[0], &middle.paragraphs[1], 2, 2, &.{ 3, 5, 6 }, 100);
    try t.expect(middle.paragraphs[1].character_styles == null);
    try t.expectEqualStrings("CD", middle.paragraphs[1].sites.items[1].text);
    var selected = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 2, 4, 2, 100000);
    defer selected.deinit(a);
    try helper.apply(a, &tree, &original.paragraphs[0], &selected.paragraphs[1], 2, 4, &.{ 3, 5, 6 }, 100);
    try t.expect(selected.paragraphs[1].character_styles == null);
}

const context_header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='4'><h:charPr id='0'/><h:charPr id='3'/><h:charPr id='5'/><h:charPr id='6'/></h:charProperties><h:styles itemCnt='1'><h:style id='7' charPrIDRef='5'/></h:styles></h:refList></h:head>";
fn contextXml(a: std.mem.Allocator, first: []const u8, last: []const u8, parent_style: bool) ![]u8 {
    return std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'{s}><p:run{s}><p:t>AB</p:t></p:run><p:run{s}><p:t>CD</p:t></p:run></p:p></s:sec>", .{ if (parent_style) " styleIDRef='7'" else "", first, last });
}
fn contextSession(first: []const u8, last: []const u8, parent_style: bool, with_header: bool, owned: bool, expected: ?u32, failure: ?anyerror) !void {
    const a = t.allocator;
    const xml = try contextXml(a, first, last, parent_style);
    defer a.free(xml);
    const fixture = @import("test_formula_fixture.zig");
    const input = if (with_header) try fixture.zipWithSectionHeader(a, xml, context_header) else try fixture.zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    if (owned) _ = try session.setCharacterFormat(0, 1, 2, 4, 3);
    const before = try session.save();
    defer a.free(before);
    if (failure) |err| {
        try t.expectError(err, session.splitParagraph(0, 1, 4, 0));
        const after = try session.save();
        defer a.free(after);
        try t.expectEqualSlices(u8, before, after);
        return;
    }
    try t.expect(try session.splitParagraph(0, 1, 4, 0));
    const right = &session.sections[0].structure_values.?.paragraphs[1];
    if (expected) |id| {
        // 선택한 carrier는 두 source site를 모두 보존하면서 numeric intent를 소유합니다.
        try t.expectEqual(@as(?u32, id), right.character_styles.?[0].char_shape_id);
    } else try t.expect(right.character_styles == null);
    try t.expectEqual(@as(usize, 2), right.sites.items.len);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const roundtrip = try reopened.save();
    defer a.free(roundtrip);
    try t.expectEqualSlices(u8, saved, roundtrip);
    if (parent_style) {
        var paragraphs: usize = 0;
        for (reopened.sections[0].tree.elements, 0..) |element, index| {
            if (!element.is(@import("document_xml.zig").paragraph_uri, "p")) continue;
            const attribute = (try reopened.sections[0].tree.attributeValue(a, index, "", "styleIDRef")).?;
            const text = try attribute.toUtf8(a, 100);
            defer a.free(text);
            try t.expectEqualStrings("7", text);
            paragraphs += 1;
        }
        try t.expectEqual(@as(usize, 2), paragraphs);
    }
}
test "continuation missing context 1 all absent references retain legacy no-resource split" {
    try contextSession("", "", false, false, false, null, null);
}
test "continuation missing context 2 absent prefix explicit tail inherits source5" {
    try contextSession("", " charPrIDRef='5'", false, true, false, 5, null);
}
// Source/ref 보존만 검증합니다. 다음 입력의 effective style5 상속 증거가 아닙니다.
test "continuation missing context 3 absent tail preserves source binding only" {
    try contextSession(" charPrIDRef='6'", "", true, true, false, null, null);
}
test "continuation missing context 4 explicit zero is a real resource reference" {
    try contextSession(" charPrIDRef='6'", " charPrIDRef='0'", false, true, false, 0, null);
}
test "continuation missing context 5 source5 and owned3 remain distinct" {
    try contextSession(" charPrIDRef='6'", " charPrIDRef='5'", false, true, false, 5, null);
    try contextSession(" charPrIDRef='6'", " charPrIDRef='5'", false, true, true, 3, null);
}
test "continuation missing context 6 invalid explicit resource stays an atomic error" {
    try contextSession(" charPrIDRef='6'", " charPrIDRef='999'", false, true, false, null, error.InvalidResourceReference);
}
test "continuation missing context 7 empty and nonnumeric references are not absence" {
    const a = t.allocator;
    for ([_][]const u8{ " charPrIDRef=''", " charPrIDRef='abc'", " charPrIDRef='-1'" }) |bad| {
        const xml = try contextXml(a, "", bad, false);
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var current = try values(a, &tree);
        defer current.deinit(a);
        try t.expectError(error.InvalidNonNegativeInteger, helper.hasStyleContext(a, &tree, &current.paragraphs[0]));
    }
}
test "continuation missing context 8 explicit zero with missing resources is not swallowed" {
    try contextSession("", " charPrIDRef='0'", false, false, false, null, error.MissingReferenceList);
}
fn contextScan(a: std.mem.Allocator, tree: *const Tree, paragraph: *const V.Paragraph) !void {
    try t.expect(try helper.hasStyleContext(a, tree, paragraph));
}
test "continuation missing context 9 context scanning OOM preserves borrowed source" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var current = try values(a, &tree);
    defer current.deinit(a);
    try @import("../testing/allocation_failures.zig").check(contextScan, .{ &tree, &current.paragraphs[0] });
    try t.expect(current.paragraphs[0].character_styles == null);
    try t.expectEqualStrings("AB", current.paragraphs[0].sites.items[0].text);
}
test "continuation missing context 10 empty budget and forged owner stay strict" {
    const a = t.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var current = try values(a, &tree);
    defer current.deinit(a);
    try t.expect(try helper.hasStyleContext(a, &tree, &current.paragraphs[0]));
    var after = try @import("paragraph_structure_split.zig").prepare(a, &tree, &current, 0, 4, 4, 2, 100000);
    defer after.deinit(a);
    try t.expectError(error.LimitExceeded, helper.apply(a, &tree, &current.paragraphs[0], &after.paragraphs[1], 4, 4, &.{ 3, 5, 6 }, 0));
    const index = current.paragraphs[0].sites.items[0].element_index;
    const parent = tree.elements[index].parent;
    tree.elements[index].parent = null;
    try t.expectError(error.SourceBindingMismatch, helper.hasStyleContext(a, &tree, &current.paragraphs[0]));
    tree.elements[index].parent = parent;
    tree.elements[index].parent = tree.elements.len;
    try t.expectError(error.SourceBindingMismatch, helper.hasStyleContext(a, &tree, &current.paragraphs[0]));
    tree.elements[index].parent = parent;
    current.paragraphs[0].sites.items[0].element_index = parent.?;
    try t.expectError(error.SourceBindingMismatch, helper.hasStyleContext(a, &tree, &current.paragraphs[0]));
    current.paragraphs[0].sites.items[0].element_index = tree.elements.len;
    try t.expectError(error.SourceBindingMismatch, helper.hasStyleContext(a, &tree, &current.paragraphs[0]));
    current.paragraphs[0].sites.items[0].element_index = index;
    try t.expect(after.paragraphs[1].character_styles == null);
    try t.expectEqualStrings("AB", current.paragraphs[0].sites.items[0].text);
}
