//! Candidate current value for a new run. Text remains owned by Sites.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, original: *const Paragraph, id: u32, inserted: []const u8, limit: usize) !Paragraph {
    if (original.sites.items.len != 0 or original.synthesized_run_character_id != null or original.character_styles != null or incompatible(original)) return error.SourceBindingMismatch;
    // The shared serializer validates source eligibility and XML characters.
    const checked = try @import("runless_paragraph_xml.zig").write(a, tree, original.template_element, id, inserted, limit);
    defer a.free(checked);
    var result = try original.clone(a);
    errdefer result.deinit(a);
    const rows = try a.alloc(@import("text_sites.zig").Site, 1);
    errdefer a.free(rows);
    const text = try a.dupe(u8, inserted);
    const node = tree.elements[original.template_element];
    rows[0] = .{ .element_index = original.template_element, .start = node.start_tag.end, .end = node.start_tag.end, .text = text, .missing_text = true };
    result.sites.deinit(a);
    result.sites = .{ .items = rows };
    result.synthesized_run_character_id = id;
    return result;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, limit: usize) ![]u8 {
    try validate(tree, paragraph);
    if (paragraph.character_styles) |styles| {
        const serializer = @import("runless_paragraph_xml.zig");
        const runs = try a.alloc(serializer.Run, styles.len);
        defer a.free(runs);
        const text = paragraph.sites.items[0].text;
        for (styles, runs) |span, *run| {
            const start = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, span.start_unit) orelse return error.LimitExceeded);
            const end = try @import("text_site_edit.zig").bytePosition(text, std.math.cast(u32, span.end_unit) orelse return error.LimitExceeded);
            run.* = .{ .character_id = span.char_shape_id.?, .text = text[start..end] };
        }
        return serializer.writeRuns(a, tree, paragraph.template_element, runs, limit);
    }
    return @import("runless_paragraph_xml.zig").write(a, tree, paragraph.template_element, paragraph.synthesized_run_character_id.?, paragraph.sites.items[0].text, limit);
}

pub fn validate(tree: *const Tree, paragraph: *const Paragraph) !void {
    if (paragraph.synthesized_run_character_id == null) return error.SourceBindingMismatch;
    if (incompatible(paragraph)) return error.SourceBindingMismatch;
    if (paragraph.sites.items.len != 1 or paragraph.template_element >= tree.elements.len) return error.SourceBindingMismatch;
    const site = paragraph.sites.items[0];
    const node = tree.elements[paragraph.template_element];
    if (site.element_index != paragraph.template_element or site.start != node.start_tag.end or site.end != site.start or !site.missing_text or site.anchor_boundary or site.empty_element) return error.SourceBindingMismatch;
    const uri = @import("document_xml.zig").paragraph_uri;
    if (!node.is(uri, "p") or !@import("element_whitespace_gaps.zig").empty(tree, paragraph.template_element)) return error.SourceBindingMismatch;
    var child = node.first_child;
    while (child) |index| {
        if (index >= tree.elements.len or !tree.elements[index].is(uri, "linesegarray")) return error.SourceBindingMismatch;
        child = tree.elements[index].next_sibling;
    }
    if (paragraph.character_styles) |styles| {
        if (styles.len == 0) return error.InvalidTextSites;
        var cursor: usize = 0;
        for (styles) |span| {
            if (span.start_unit != cursor or span.end_unit < cursor or span.site_start_unit != 0 or span.site_index != 0 or span.run_element != paragraph.template_element or span.char_shape_id == null or span.anchor_element != null or span.tab_element != null) return error.InvalidTextSites;
            _ = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, span.end_unit) orelse return error.LimitExceeded);
            cursor = span.end_unit;
        }
        if (cursor != try @import("text_site_edit.zig").utf16Length(site.text)) return error.InvalidTextSites;
    }
}

pub fn baseStyles(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) ![]@import("character_style_paint.zig").Span {
    try validate(tree, paragraph);
    return a.dupe(@import("character_style_paint.zig").Span, &.{.{ .start_unit = 0, .end_unit = try @import("text_site_edit.zig").utf16Length(paragraph.sites.items[0].text), .site_start_unit = 0, .site_index = 0, .run_element = paragraph.template_element, .char_shape_id = paragraph.synthesized_run_character_id }});
}

fn incompatible(paragraph: *const Paragraph) bool {
    return paragraph.generated_id != null or paragraph.paragraph_shape_id != null or paragraph.pieces != null or paragraph.protected_positions != null or paragraph.field_positions != null or paragraph.title_positions != null or paragraph.column_boundaries != null or paragraph.page_area_positions != null or paragraph.column_structure_changed;
}

test "runless current paragraph keeps Sites as sole text owner through clone splice and failures" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p styleIDRef='0'/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var original: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = try a.alloc(@import("text_sites.zig").Site, 0) } };
    defer original.deinit(a);
    var current = try prepare(a, &tree, &original, 2, "한😀", 4096);
    defer current.deinit(a);
    var snapshot = try current.clone(a);
    defer snapshot.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &current.sites, 0, 0, 1, "끝", 4096));
    try std.testing.expectEqualStrings("한😀", snapshot.sites.items[0].text);
    try std.testing.expectEqual(@as(?u32, 2), snapshot.synthesized_run_character_id);
    var borrowed_rows = [_]Paragraph{current};
    const borrowed: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &borrowed_rows };
    const bytes = try borrowed.byteSize(4096);
    try std.testing.expectError(error.LimitExceeded, borrowed.byteSize(bytes - 1));
    const xml = try write(a, &tree, &current, 4096);
    defer a.free(xml);
    try std.testing.expectEqualStrings("<p:p styleIDRef='0'><p:run charPrIDRef=\"2\"><p:t>끝😀</p:t></p:run></p:p>", xml);
    try std.testing.expectError(error.SplitSurrogatePair, @import("text_site_edit.zig").splice(a, &current.sites, 0, 2, 0, "bad", 4096));
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, base: *const Paragraph) !void {
            var result = try prepare(allocator, source, base, 2, "한😀", 4096);
            defer result.deinit(allocator);
            var copy = try result.clone(allocator);
            defer copy.deinit(allocator);
            const saved = try write(allocator, source, &copy, 4096);
            defer allocator.free(saved);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &original });
    try std.testing.expectEqual(@as(usize, 0), original.sites.items.len);
}

test "runless current common section save preserves other text and rejects forged ownership" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><!--keep--><p:p><p:run><p:t>other</p:t></p:run></p:p><p:p styleIDRef='0'><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer values.deinit(a);
    var replacement = try prepare(a, &tree, &values.paragraphs[1], 2, "한😀<&", 4096);
    std.mem.swap(Paragraph, &values.paragraphs[1], &replacement);
    replacement.deinit(a);
    const saved = try @import("paragraph_structure_save.zig").write(a, &tree, &values, .{}, &.{}, 4096);
    defer a.free(saved);
    try std.testing.expectEqualStrings("<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><!--keep--><p:p><p:run><p:t>other</p:t></p:run></p:p><p:p styleIDRef='0'><p:run charPrIDRef=\"2\"><p:t>한😀&lt;&amp;</p:t></p:run></p:p></s:sec>", saved);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const @import("paragraph_structure_values.zig").Values) !void {
            const result = try @import("paragraph_structure_save.zig").write(allocator, parsed, current, .{}, &.{}, 4096);
            defer allocator.free(result);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &values });
    const original_site = values.paragraphs[1].sites.items[0].element_index;
    values.paragraphs[1].sites.items[0].element_index = 0;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &values, .{}, &.{}, 4096));
    values.paragraphs[1].sites.items[0].element_index = original_site;
    try std.testing.expectEqualStrings(source, tree.source);
}

test "runless current partial styles serialize three runs on all failed allocations" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p styleIDRef='0'/></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var original: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = try a.alloc(@import("text_sites.zig").Site, 0) } };
    defer original.deinit(a);
    var current = try prepare(a, &tree, &original, 2, "A😀B", 4096);
    defer current.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, base: *const Paragraph) !void {
            var candidate = try base.clone(allocator);
            defer candidate.deinit(allocator);
            const styles = try baseStyles(allocator, source, &candidate);
            defer allocator.free(styles);
            try std.testing.expectError(error.SplitSurrogatePair, @import("character_style_paint.zig").prepare(allocator, &candidate.sites, styles, 2, 3, 9, &.{ 2, 9 }, 100));
            candidate.character_styles = try @import("character_style_paint.zig").prepare(allocator, &candidate.sites, styles, 1, 3, 9, &.{ 2, 9 }, 100);
            const xml = try write(allocator, source, &candidate, 4096);
            defer allocator.free(xml);
            try std.testing.expectEqualStrings("<p:p styleIDRef='0'><p:run charPrIDRef=\"2\"><p:t>A</p:t></p:run><p:run charPrIDRef=\"9\"><p:t>😀</p:t></p:run><p:run charPrIDRef=\"2\"><p:t>B</p:t></p:run></p:p>", xml);
        }
    };
    try Probe.run(a, &tree, &current);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &current });
    try std.testing.expect(current.character_styles == null);
    try std.testing.expectEqualStrings("A😀B", current.sites.items[0].text);
}

test "runless current actual session save and checkpoint exchange preserve immutable source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36386761_백제학연구총서위탁판매의뢰목록.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var before = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer before.deinit();
    try std.testing.expect(try session.canEdit(0, 28));
    const empty_text = try session.anchorText(0, 28);
    defer a.free(empty_text);
    try std.testing.expectEqualStrings("", empty_text);
    const initial_ranges = try @import("character_style_snapshot.zig").read(&session, 0, 28);
    defer a.free(initial_ranges);
    try std.testing.expectEqual(@as(usize, 1), initial_ranges.len);
    try std.testing.expectEqual(@as(?u32, 2), initial_ranges[0].char_shape_id);
    try std.testing.expectEqual(@as(usize, 0), initial_ranges[0].end_unit);
    try std.testing.expectError(error.InvalidTextPosition, session.splice(0, 28, 1, 0, "bad"));
    try std.testing.expect(try session.splice(0, 28, 0, 0, "본문😀<&"));
    try std.testing.expect(try session.canEdit(0, 28));
    try std.testing.expectError(error.SplitSurrogatePair, session.splice(0, 28, 3, 0, "bad"));
    try std.testing.expect(!try session.splice(0, 28, 0, 2, "본문"));
    const current_text = try session.anchorText(0, 28);
    defer a.free(current_text);
    try std.testing.expectEqualStrings("본문😀<&", current_text);
    const current_ranges = try @import("character_style_snapshot.zig").read(&session, 0, 28);
    defer a.free(current_ranges);
    try std.testing.expectEqual(@as(usize, 1), current_ranges.len);
    try std.testing.expectEqual(@as(?u32, 2), current_ranges[0].char_shape_id);
    try std.testing.expectEqual(@as(usize, 6), current_ranges[0].end_unit);
    const QueryProbe = struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session) !void {
            var borrowed = original.*;
            borrowed.allocator = allocator;
            const ranges = try @import("character_style_snapshot.zig").read(&borrowed, 0, 28);
            defer allocator.free(ranges);
            try std.testing.expectEqual(@as(usize, 6), ranges[0].end_unit);
            try std.testing.expectEqual(@as(?u32, 2), ranges[0].char_shape_id);
        }
    };
    try std.testing.checkAllAllocationFailures(a, QueryProbe.run, .{&session});
    try std.testing.expect(try session.splice(0, 28, 0, 0, "추가"));
    try std.testing.expect(try session.setCharacterProperties(0, 28, 0, 2, .{ .size = 1200 }));
    try std.testing.expect(try session.splice(0, 28, 0, 0, "더"));
    const styled_ranges = try @import("character_style_snapshot.zig").read(&session, 0, 28);
    defer a.free(styled_ranges);
    try std.testing.expectEqual(@as(usize, 2), styled_ranges.len);
    try std.testing.expectEqual(@as(usize, 3), styled_ranges[0].end_unit);
    try std.testing.expectEqual(@as(?u32, 2), styled_ranges[1].char_shape_id);
    const shapes = try @import("character_style_resources.zig").displayShapes(&session);
    defer a.free(shapes);
    var found_size = false;
    for (shapes) |shape| if (shape.id == styled_ranges[0].char_shape_id) {
        try std.testing.expectEqual(@as(?i32, 1200), shape.height);
        found_size = true;
    };
    try std.testing.expect(found_size);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 28);
    defer a.free(text);
    try std.testing.expectEqualStrings("더추가본문😀<&", text);
    const reopened_ranges = try @import("character_style_snapshot.zig").read(&reopened, 0, 28);
    defer a.free(reopened_ranges);
    try std.testing.expectEqualDeep(styled_ranges, reopened_ranges);
    try before.exchange(&session);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try before.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
