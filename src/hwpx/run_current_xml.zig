//! Serialize one current run through shared text writer and namespace closure.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const sites_mod = @import("text_sites.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: sites_mod.Options, limit: usize) ![]u8 {
    return writeMode(a, tree, paragraph, run, options, limit, false);
}

pub fn writeMode(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: sites_mod.Options, limit: usize, continuation: bool) ![]u8 {
    return writeModePolicy(a, tree, paragraph, run, options, limit, continuation, false, false);
}

pub fn writeWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: sites_mod.Options, limit: usize, continuation: bool) ![]u8 {
    return writeModePolicy(a, tree, paragraph, run, options, limit, continuation, true, false);
}

/// 원본 필드 run을 현재 텍스트와 함께 보존합니다. 생성/재귀속 필드는 별도 경로입니다.
pub fn writeSourceFields(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: sites_mod.Options, limit: usize) ![]u8 {
    if (paragraph.generated_id != null or paragraph.field_positions != null or paragraph.character_styles != null) return error.UnsupportedStructuralFieldEdit;
    return writeModePolicy(a, tree, paragraph, run, options, limit, false, false, true);
}

pub fn writeOwnedFields(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: sites_mod.Options, owned: []const @import("field_position.zig").Position, fields: []const @import("text_sites_save.zig").FieldDirty, continuation: bool, limit: usize) ![]u8 {
    var source_view = paragraph.*;
    source_view.generated_id = null;
    source_view.field_positions = null;
    const rendered = try writeSourceFields(a, tree, &source_view, run, options, limit);
    defer a.free(rendered);
    return @import("field_run_ownership_xml.zig").write(a, tree, run, rendered, owned, fields, continuation, limit);
}

fn writeModePolicy(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, run: usize, options: sites_mod.Options, limit: usize, continuation: bool, allow_tabs: bool, allow_fields: bool) ![]u8 {
    if (run >= tree.elements.len) return error.InvalidElementIndex;
    const node = tree.elements[run];
    if (!node.is(@import("document_xml.zig").paragraph_uri, "run") or node.parent != paragraph.template_element) return error.SourceBindingMismatch;
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    if (allow_fields) try @import("plain_paragraph_policy.zig").validateForCharacterFormat(tree, &paragraph.sites, locations, 1) else try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, allow_tabs);
    var original = try sites_mod.collect(a, tree, options);
    defer original.deinit(a);
    const flat = try a.dupe(sites_mod.Site, original.items);
    defer a.free(flat);
    const seen = try a.alloc(bool, flat.len);
    defer a.free(seen);
    @memset(seen, false);
    var found: usize = 0;
    for (paragraph.sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if (element.start_tag.start < node.start_tag.start or element.end > node.end) continue;
        var matched = false;
        for (flat, 0..) |*target, index| {
            if (target.element_index != site.element_index or target.start != site.start) continue;
            if (target.end != site.end or target.empty_element != site.empty_element or target.missing_text != site.missing_text or target.anchor_boundary != site.anchor_boundary) return error.SourceBindingMismatch;
            if (seen[index]) return error.SourceBindingMismatch;
            seen[index] = true;
            target.* = site;
            matched = true;
            break;
        }
        if (!matched) return error.SourceBindingMismatch;
        found += 1;
    }
    for (original.items, seen) |site, present| {
        const element = tree.elements[site.element_index];
        if (try @import("paragraph_site_owner.zig").ancestor(tree, site.element_index) != paragraph.template_element) continue;
        if (element.start_tag.start >= node.start_tag.start and element.end <= node.end and !present) return error.SourceBindingMismatch;
    }
    const closed = try @import("xml_subtree_closure.zig").write(a, tree, run, limit);
    defer a.free(closed);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", closed, "</p:p></s:sec>" });
    defer a.free(wrapper);
    const source_limit = std.math.add(usize, wrapper.len, limit) catch return error.LimitExceeded;
    var normalized = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = source_limit });
    defer normalized.deinit(a);
    var normalized_sites = try sites_mod.collect(a, &normalized, options);
    defer normalized_sites.deinit(a);
    var direct_count: usize = 0;
    for (normalized_sites.items) |site| {
        if (try @import("paragraph_site_owner.zig").ancestor(&normalized, site.element_index) == 1) direct_count += 1;
    }
    if (direct_count != found) return error.SourceBindingMismatch;
    // A plain paragraph may contain a section/control metadata-only run.
    // It owns no editable site, but still needs namespace closure and the
    // same continuation metadata removal as a run carrying current text.
    if (found == 0) return writeOutput(a, &normalized, continuation, limit);
    const rows = try a.dupe(sites_mod.Site, normalized_sites.items);
    defer a.free(rows);
    var next: usize = 0;
    for (flat, seen) |site, selected| {
        if (!selected) continue;
        while (next < rows.len and try @import("paragraph_site_owner.zig").ancestor(&normalized, rows[next].element_index) != 1) : (next += 1) {}
        if (next >= rows.len) return error.SourceBindingMismatch;
        rows[next].text = site.text;
        next += 1;
    }
    const projected: sites_mod.Sites = .{ .items = rows };
    const changed = try @import("text_sites_save.zig").write(a, &normalized, &projected, options, source_limit);
    defer a.free(changed);
    var rendered = try @import("xml_part_tree.zig").parse(a, changed, .section, 0, 0, .{ .max_xml_bytes = source_limit });
    defer rendered.deinit(a);
    // Changes occur inside this run only, so its element index is stable even
    // when a missing/empty text element is materialized within it.
    if (rendered.elements.len < 3 or !rendered.elements[2].is(@import("document_xml.zig").paragraph_uri, "run")) return error.SourceBindingMismatch;
    return writeOutput(a, &rendered, continuation, limit);
}

test "current run XML retains nested header footer sites and geometry" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:ctrl><p:header><p:subList><p:p><p:run><p:t>HEAD</p:t></p:run><p:linesegarray/></p:p></p:subList></p:header></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    const paragraph = &values.paragraphs[0];
    a.free(paragraph.sites.items[0].text);
    paragraph.sites.items[0].text = try a.dupe(u8, "앞😀");
    const rendered = try write(a, &tree, paragraph, 2, .{}, 10000);
    defer a.free(rendered);
    try std.testing.expect(std.mem.indexOf(u8, rendered, "앞😀") != null);
    try std.testing.expect(std.mem.indexOf(u8, rendered, "<p:t>HEAD</p:t></p:run><p:linesegarray/>") != null);
    const continuation = try writeMode(a, &tree, paragraph, 2, .{}, 10000, true);
    defer a.free(continuation);
    try std.testing.expect(std.mem.indexOf(u8, continuation, "HEAD") == null);
    try std.testing.expect(std.mem.indexOf(u8, continuation, "앞😀") != null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Paragraph) !void {
            for ([_]bool{ false, true }) |generated| {
                const output = try writeMode(allocator, parsed, current, 2, .{}, 10000, generated);
                defer allocator.free(output);
                try std.testing.expect(std.mem.indexOf(u8, output, "앞😀") != null);
                try std.testing.expectEqual(!generated, std.mem.indexOf(u8, output, "HEAD") != null);
            }
        }
    }.run, .{ &tree, paragraph });
    try std.testing.expectEqualStrings(source, tree.source);
}

fn writeOutput(a: std.mem.Allocator, rendered: *const Tree, continuation: bool, limit: usize) ![]u8 {
    if (rendered.elements.len < 3 or !rendered.elements[2].is(@import("document_xml.zig").paragraph_uri, "run")) return error.SourceBindingMismatch;
    const output = rendered.sourceOf(2);
    if (output.len > limit) return error.LimitExceeded;
    var removals: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer removals.deinit(a);
    const base = rendered.elements[2].start_tag.start;
    var removed_end = base;
    for (rendered.elements[3..], 3..) |element, index| {
        if (element.start_tag.start < removed_end or !@import("paragraph_continuation_metadata.zig").remove(element, continuation)) continue;
        if (try @import("paragraph_site_owner.zig").ancestor(rendered, index) != 1) continue;
        try removals.append(a, .{ .start = element.start_tag.start - base, .end = element.end - base, .text = "" });
        removed_end = element.end;
    }
    return @import("xml_source_writer.zig").write(a, output, removals.items, limit);
}
