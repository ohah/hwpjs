//! Native scanner의 문서 전체 문단 번호와 원본 텍스트 사이트를 사용하는 인라인 삽입입니다.
const std = @import("std");
const insertion = @import("../image/image_insertion.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const scanner = @import("section_text.zig");

pub fn locate(a: std.mem.Allocator, tree: *const Tree, request: insertion.Request, counters: *scanner.Report) !?usize {
    const Context = struct {
        tree: *const Tree,
        request: insertion.Request,
        found: ?usize = null,
        fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (value != .paragraph_start) return;
            const boundary = value.paragraph_start;
            if (boundary.location.section_ordinal != self.request.target.section or boundary.location.paragraph_ordinal != self.request.target.paragraph) return;
            if (self.found != null) return error.SourceBindingMismatch;
            self.found = try self.tree.startTagIndex(boundary.tag.raw);
        }
    };
    var context: Context = .{ .tree = tree, .request = request };
    try scanner.scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidSectionIndex, tree.item_index, .{}, counters, .{ .context = &context, .on_event = Context.event });
    return context.found;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, request: insertion.Request, picture: []const u8, limit: usize) ![]u8 {
    try @import("field_free_section.zig").validate(a, tree, limit);
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(xml.paragraph_uri, "p")) return error.InvalidParagraphIndex;
    const root = tree.elements[paragraph].parent orelse return error.UnsupportedPictureInsertionHost;
    if (!tree.elements[root].is(xml.section_uri, "sec")) return error.UnsupportedPictureInsertionHost;
    var lines: ?usize = null;
    var run = tree.elements[paragraph].first_child;
    while (run) |node| : (run = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        if (element.is(xml.paragraph_uri, "linesegarray")) {
            if (lines != null) return error.UnsupportedPictureInsertionHost;
            lines = node;
            continue;
        }
        if (!element.is(xml.paragraph_uri, "run")) return error.UnsupportedPictureInsertionHost;
        var child = element.first_child;
        while (child) |index| : (child = tree.elements[index].next_sibling) {
            const entry = tree.elements[index];
            if (entry.is(xml.paragraph_uri, "t") and entry.first_child == null) continue;
            // 첫 본문 문단의 구역 정의는 위치·내용을 변경하지 않고 보존합니다.
            if (entry.is(xml.paragraph_uri, "secPr")) continue;
            return error.UnsupportedPictureInsertionControl;
        }
    }
    var sites = try @import("text_sites.zig").collect(a, tree, .{ .max_text_bytes = insertion.max_text_bytes });
    defer sites.deinit(a);
    var actual: std.ArrayList(u8) = .empty;
    defer actual.deinit(a);
    var selected: std.ArrayList(usize) = .empty;
    defer selected.deinit(a);
    var last_node: ?usize = null;
    for (sites.items, 0..) |site, index| {
        const parent = tree.elements[site.element_index].parent orelse continue;
        if (tree.elements[parent].parent != paragraph) continue;
        if (!tree.elements[site.element_index].is(xml.paragraph_uri, "t") or site.missing_text) return error.UnsupportedPictureInsertionHost;
        if (last_node == site.element_index) return error.UnsupportedPictureInsertionTextSegments;
        last_node = site.element_index;
        if (site.text.len > insertion.max_text_bytes -| actual.items.len) return error.LimitExceeded;
        try actual.appendSlice(a, site.text);
        try selected.append(a, index);
    }
    const byte_at = try insertion.verifyText(actual.items, request);
    var consumed: usize = 0;
    var selected_site: ?usize = null;
    var local_at: usize = 0;
    for (selected.items) |index| {
        const length = sites.items[index].text.len;
        if (byte_at >= consumed and byte_at - consumed <= length) {
            selected_site = index;
            local_at = byte_at - consumed;
            break;
        }
        consumed += length;
    }
    const site = sites.items[selected_site orelse return error.UnsupportedEmptyPictureInsertionText];
    const element = tree.elements[site.element_index];
    const raw_open = tree.source[element.start_tag.start..element.start_tag.end];
    var input = try @import("../xml/input.zig").Input.init(raw_open, .utf8, .{ .max_bytes = raw_open.len, .max_characters = raw_open.len });
    var tag = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = raw_open.len });
    defer tag.deinit(a);
    // 분할되는 t에 미지의 식별자·속성을 복제하지 않습니다. namespace와 xml:space만 보존합니다.
    for (tag.attributes) |attribute| {
        if (try @import("../xml/namespaces.zig").isDeclaration(attribute.name)) continue;
        if (!std.mem.eql(u8, attribute.name.raw, "xml:space")) return error.UnsupportedPictureInsertionTextAttributes;
    }
    const opening = if (element.end_tag == null) try std.fmt.allocPrint(a, "{s}>", .{raw_open[0 .. raw_open.len - 2]}) else try a.dupe(u8, raw_open);
    defer a.free(opening);
    const closing = try std.fmt.allocPrint(a, "</{s}>", .{tag.name.raw});
    defer a.free(closing);
    const left = try @import("xml_source_writer.zig").write(a, "", &.{.{ .start = 0, .end = 0, .text = site.text[0..local_at] }}, limit);
    defer a.free(left);
    const right = try @import("xml_source_writer.zig").write(a, "", &.{.{ .start = 0, .end = 0, .text = site.text[local_at..] }}, limit);
    defer a.free(right);
    const replacement = try std.fmt.allocPrint(a, "{s}{s}{s}{s}{s}{s}{s}", .{ opening, left, closing, picture, opening, right, closing });
    defer a.free(replacement);
    const source_writer = @import("xml_source_writer.zig");
    var changes: [2]source_writer.Change = undefined;
    changes[0] = .{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = replacement };
    var count: usize = 1;
    if (lines) |node| {
        changes[1] = .{ .start = tree.elements[node].start_tag.start, .end = tree.elements[node].end, .text = "", .serialized_xml = "" };
        count += 1;
        if (changes[1].start < changes[0].start) std.mem.swap(source_writer.Change, &changes[0], &changes[1]);
    }
    return source_writer.write(a, tree.source, changes[0..count], limit);
}
