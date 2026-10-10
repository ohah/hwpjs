//! Existing paragraph reference patch; resource validation belongs to the session.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, id: u32, max_bytes: usize) ![]u8 {
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
    if (tree.elements[paragraph].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const attribute = (try tree.attributeValue(a, paragraph, "", "paraPrIDRef")) orelse return error.MissingParagraphShapeReference;
    const current = try @import("table_xml_fields.zig").unsigned(a, attribute, 4096);
    const span = tree.elements[paragraph].start_tag;
    const raw = tree.source[span.start..span.end];
    return patch(a, raw, attribute, current, id, max_bytes);
}

/// Apply after text/structure serialization; never replace the current ID with source bytes.
pub fn writeCurrent(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, rendered: []const u8, id: u32, max_bytes: usize) ![]u8 {
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
    const xml = @import("../xml/root.zig");
    var input = try xml.input.Input.init(rendered, .utf8, .{ .max_bytes = max_bytes });
    var tag = try xml.tags.parse(a, &input, .{});
    defer tag.deinit(a);
    const span = tree.elements[paragraph].start_tag;
    var source_input = try xml.input.Input.init(tree.source[span.start..span.end], .utf8, .{});
    var source_tag = try xml.tags.parse(a, &source_input, .{});
    defer source_tag.deinit(a);
    if (tag.kind == .end or !std.mem.eql(u8, tag.name.raw, source_tag.name.raw)) return error.SourceBindingMismatch;
    for (tag.attributes) |attribute| {
        if (!attribute.name.equals("paraPrIDRef", false)) continue;
        const current = try @import("table_xml_fields.zig").unsigned(a, attribute.value, 4096);
        return patch(a, rendered, attribute.value, current, id, max_bytes);
    }
    return error.MissingParagraphShapeReference;
}

fn patch(a: std.mem.Allocator, raw: []const u8, attribute: @import("../xml/attribute_value.zig").Value, current: u32, id: u32, max_bytes: usize) ![]u8 {
    if (current == id) {
        if (raw.len > max_bytes) return error.LimitExceeded;
        return a.dupe(u8, raw);
    }
    const quote = attribute.raw[0];
    const replacement = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, id, quote });
    defer a.free(replacement);
    const start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(raw.ptr);
    const change: @import("xml_source_writer.zig").Change = .{ .start = start, .end = start + attribute.raw.len, .text = "", .serialized_xml = replacement };
    return @import("xml_source_writer.zig").write(a, raw, &.{change}, max_bytes);
}

test "HWPX paragraph format writer preserves lexical source and all allocation failures" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p opaque='keep&amp;x' paraPrIDRef = '&#49;' styleIDRef='0'/><p:p/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, 0, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<p:p opaque='keep&amp;x' paraPrIDRef = '0' styleIDRef='0'/>", output);
        }
    }.run, .{&tree});
    const unchanged = try write(a, &tree, 1, 1, 4096);
    defer a.free(unchanged);
    const span = tree.elements[1].start_tag;
    try std.testing.expectEqualSlices(u8, tree.source[span.start..span.end], unchanged);
    try std.testing.expectError(error.MissingParagraphShapeReference, write(a, &tree, 2, 0, 4096));
    try std.testing.expectError(error.InvalidParagraphElement, write(a, &tree, 0, 0, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 0, 1));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 1, 1));
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const rendered = "<p:p id='99' paraPrIDRef='1'><p:run><p:t>edited</p:t></p:run></p:p>";
            const output = try writeCurrent(allocator, source, 1, rendered, 0, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<p:p id='99' paraPrIDRef='0'><p:run><p:t>edited</p:t></p:run></p:p>", output);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.SourceBindingMismatch, writeCurrent(a, &tree, 1, "<p:run paraPrIDRef='1'/>", 0, 4096));
}

test "HWPX paragraph format writer keeps all actual fixture paragraphs unchanged for identical IDs" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "p")) continue;
        const attribute = (try tree.attributeValue(a, index, "", "paraPrIDRef")) orelse return error.MissingParagraphShapeReference;
        const id = try @import("table_xml_fields.zig").unsigned(a, attribute, 4096);
        const output = try write(a, &tree, index, id, 4096);
        defer a.free(output);
        const raw = tree.source[element.start_tag.start..element.start_tag.end];
        try std.testing.expectEqualSlices(u8, raw, output);
        const changed = try write(a, &tree, index, if (id == 0) 1 else 0, 4096);
        defer a.free(changed);
        const at = @intFromPtr(attribute.raw.ptr) - @intFromPtr(raw.ptr);
        try std.testing.expectEqualSlices(u8, raw[0..at], changed[0..at]);
        const suffix = raw[at + attribute.raw.len ..];
        try std.testing.expect(std.mem.endsWith(u8, changed, suffix));
        count += 1;
    }
    try std.testing.expect(count > 0);
}

test "HWPX paragraph format structural save patches only reference and survives split reopen" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &counters);
    var transferred = false;
    defer if (!transferred) current.deinit(a);
    const empty = try a.alloc(@import("text_sites.zig").Site, 0);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = current;
    transferred = true;
    const paragraph = &section.structure_values.?.paragraphs[1];
    paragraph.paragraph_shape_id = 0;
    const span = section.tree.elements[paragraph.template_element].start_tag;
    const opening = try write(a, &section.tree, paragraph.template_element, 0, 4096);
    defer a.free(opening);
    const expected = try std.mem.concat(a, u8, &.{ section.tree.source[0..span.start], opening, section.tree.source[span.end..] });
    defer a.free(expected);
    const saved = try session.save();
    defer a.free(saved);
    var document = try @import("package.zig").inspectDocument(a, saved, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualSlices(u8, expected, tree.source);
    try std.testing.expect(try session.splitParagraph(0, section.first_paragraph + 1, 0, 0));
    try std.testing.expectEqual(@as(?u32, 0), session.sections[0].structure_values.?.paragraphs[1].paragraph_shape_id);
    try std.testing.expectEqual(@as(?u32, 0), session.sections[0].structure_values.?.paragraphs[2].paragraph_shape_id);
    const split = try session.save();
    defer a.free(split);
    var reopened = try @import("editor_session.zig").open(a, split, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(session.sections[0].last_paragraph, reopened.sections[0].last_paragraph);
}
