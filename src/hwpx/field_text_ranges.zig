//! Source-bound field content ranges assembled from the existing marker linker.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const fields = @import("field_markers.zig");

pub const Range = struct {
    section: usize,
    begin_marker: usize,
    end_marker: usize,
    content_start: usize,
    content_end: usize,
};

/// Caller owns the range array; source offsets refer to unchanged input trees.
/// This is not permission to edit every field type or evaluate its result.
pub fn build(a: std.mem.Allocator, trees: []const tree_module.Tree, report: *const fields.Report) ![]Range {
    if (report.sections != trees.len) return error.InvalidFieldLinks;
    if (report.duplicate_begin_ids != 0 or report.unmatched_begins != 0 or report.unresolved_ends != 0 or report.non_lifo_closures != 0 or report.fieldid_mismatches != 0) return error.InvalidFieldLinks;
    var ranges: std.ArrayList(Range) = .empty;
    defer ranges.deinit(a);
    for (report.markers, 0..) |begin, index| {
        if (begin.kind == .end) {
            const begin_index = begin.matched_marker_index orelse return error.InvalidFieldLinks;
            if (begin_index >= index or report.markers[begin_index].kind != .begin or report.markers[begin_index].matched_marker_index != index) return error.InvalidFieldLinks;
            continue;
        }
        const end_index = begin.matched_marker_index orelse return error.InvalidFieldLinks;
        if (end_index >= report.markers.len or end_index <= index) return error.InvalidFieldLinks;
        const end = report.markers[end_index];
        if (end.kind != .end or end.matched_marker_index != index or begin.section_ordinal != end.section_ordinal or begin.section_ordinal >= trees.len) return error.InvalidFieldLinks;
        const tree = &trees[begin.section_ordinal];
        if (begin.element_index >= tree.elements.len or end.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        const uri = @import("document_xml.zig").paragraph_uri;
        if (tree.section_ordinal != begin.section_ordinal or !tree.elements[begin.element_index].is(uri, "fieldBegin") or !tree.elements[end.element_index].is(uri, "fieldEnd")) return error.SourceBindingMismatch;
        if (!std.mem.eql(u8, begin.raw_xml, tree.sourceOf(begin.element_index)) or !std.mem.eql(u8, end.raw_xml, tree.sourceOf(end.element_index))) return error.SourceBindingMismatch;
        const start_offset = tree.elements[begin.element_index].end;
        const end_offset = tree.elements[end.element_index].start_tag.start;
        if (end_offset < start_offset or end_offset > tree.source.len) return error.SourceBindingMismatch;
        try ranges.append(a, .{ .section = begin.section_ordinal, .begin_marker = index, .end_marker = end_index, .content_start = start_offset, .content_end = end_offset });
    }
    return ranges.toOwnedSlice(a);
}

test "HWPX field text ranges reuse explicit links across paragraphs and fail allocation safely" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>first</p:t></p:run></p:p><p:p><p:run><p:t>last</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]tree_module.Tree{tree};
    var report = try fields.inspect(a, &trees, .{});
    defer report.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, inputs: []const tree_module.Tree, linked: *const fields.Report) !void {
            const ranges = try build(allocator, inputs, linked);
            defer allocator.free(ranges);
            try std.testing.expectEqual(@as(usize, 1), ranges.len);
            const content = inputs[0].source[ranges[0].content_start..ranges[0].content_end];
            try std.testing.expect(std.mem.indexOf(u8, content, "first") != null);
            try std.testing.expect(std.mem.indexOf(u8, content, "last") != null);
        }
    }.run, .{ &trees, &report });
    report.unmatched_begins = 1;
    try std.testing.expectError(error.InvalidFieldLinks, build(a, &trees, &report));
}

test "HWPX field text ranges bind actual hyperlink fixture" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const trees = [_]tree_module.Tree{tree};
    var report = try fields.inspect(a, &trees, .{});
    defer report.deinit();
    const ranges = try build(a, &trees, &report);
    defer a.free(ranges);
    try std.testing.expect(ranges.len > 0);
    try std.testing.expectEqual(report.begins, ranges.len);
    for (ranges) |range| try std.testing.expect(range.content_start <= range.content_end);
}

test "HWPX field text ranges reject forged reciprocal links and foreign source bindings" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var trees = [_]tree_module.Tree{tree};
    var report = try fields.inspect(a, &trees, .{});
    defer report.deinit();
    const end_index = report.markers[0].matched_marker_index.?;
    const original_end_link = report.markers[end_index].matched_marker_index;
    const markers = @constCast(report.markers);
    markers[0].kind = .end;
    try std.testing.expectError(error.InvalidFieldLinks, build(a, &trees, &report));
    markers[0].kind = .begin;
    markers[end_index].matched_marker_index = null;
    try std.testing.expectError(error.InvalidFieldLinks, build(a, &trees, &report));
    markers[end_index].matched_marker_index = original_end_link;
    const original_element = report.markers[0].element_index;
    markers[0].element_index = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &trees, &report));
    markers[0].element_index = original_element;
    // Change the bound tree, not the owned report string: equal element names
    // and matching IDs do not establish an exact original-source binding.
    const original_byte = trees[0].source[tree.elements[original_element].start_tag.start + 1];
    @constCast(trees[0].source)[tree.elements[original_element].start_tag.start + 1] = 'x';
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &trees, &report));
    @constCast(trees[0].source)[tree.elements[original_element].start_tag.start + 1] = original_byte;
    trees[0].section_ordinal = 1;
    try std.testing.expectError(error.SourceBindingMismatch, build(a, &trees, &report));
    trees[0].section_ordinal = 0;
    const valid = try build(a, &trees, &report);
    defer a.free(valid);
    try std.testing.expectEqual(@as(usize, 1), valid.len);
}
