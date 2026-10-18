//! Change one explicit language font reference while preserving other XML.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const faces = @import("font_faces.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, language: faces.Language, id: u32, limit: usize) ![]u8 {
    const current = (try @import("character_font_references.zig").read(a, tree, node, 4096)) orelse return error.MissingCharacterFontReference;
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    if (current[@backingInt(language)] == id) return a.dupe(u8, fragment);
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(@import("document_xml.zig").head_uri, "fontRef")) continue;
        const name = faces.reference_names[@backingInt(language)];
        const attribute = try tree.attributeValue(a, index, "", name);
        const replacement = if (attribute) |raw| try std.fmt.allocPrint(a, "{c}{d}{c}", .{ raw.raw[0], id, raw.raw[0] }) else try std.fmt.allocPrint(a, " {s}=\"{d}\"", .{ name, id });
        defer a.free(replacement);
        const element = tree.elements[index];
        const start = if (attribute) |raw| @intFromPtr(raw.raw.ptr) - @intFromPtr(fragment.ptr) else element.start_tag.end - tree.elements[node].start_tag.start - (if (element.end_tag == null) @as(usize, 2) else @as(usize, 1));
        return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = start, .end = start + if (attribute) |raw| raw.raw.len else @as(usize, 0), .text = "", .serialized_xml = replacement }}, limit);
    }
    return error.MissingCharacterFontReference;
}

test "character font patch changes only one language preserves zero and allocation failures" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='9' textColor='#ff0000'><!--keep--><h:fontRef latin = '7' hangul='&#48;' opaque='keep'/><h:bold/></h:charPr><h:charPr/></h:head>";
            var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
            defer tree.deinit(a);
            try std.testing.checkAllAllocationFailures(a, struct {
                fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
                    const changed = try write(allocator, source, 1, .latin, 42, 4096);
                    defer allocator.free(changed);
                    try std.testing.expectEqualStrings("<h:charPr id='9' textColor='#ff0000'><!--keep--><h:fontRef latin = '42' hangul='&#48;' opaque='keep'/><h:bold/></h:charPr>", changed);
                    const same = try write(allocator, source, 1, .hangul, 0, 4096);
                    defer allocator.free(same);
                    try std.testing.expectEqualStrings(source.sourceOf(1), same);
                    const inserted = try write(allocator, source, 1, .symbol, 0, 4096);
                    defer allocator.free(inserted);
                    try std.testing.expectEqualStrings("<h:charPr id='9' textColor='#ff0000'><!--keep--><h:fontRef latin = '7' hangul='&#48;' opaque='keep' symbol=\"0\"/><h:bold/></h:charPr>", inserted);
                }
            }.run, .{&tree});
            try std.testing.expectEqualStrings(input, tree.source);
            try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .latin, 0, 1));
            try std.testing.expectError(error.MissingCharacterFontReference, write(a, &tree, 4, .latin, 0, 4096));
        }
    }.run, .{});
}

test "character font patch preserves actual header outside one language attribute" {
    try @import("../testing/checked_allocator.zig").run(checkActualHeader, .{});
}

fn checkActualHeader(a: std.mem.Allocator) !void {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/facename.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var verified: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").head_uri, "charPr")) continue;
        var child = element.first_child;
        const font = block: {
            while (child) |index| : (child = tree.elements[index].next_sibling) {
                if (tree.elements[index].is(@import("document_xml.zig").head_uri, "fontRef")) break :block index;
            }
            return error.MissingCharacterFontReference;
        };
        for (faces.languages, 0..) |language, ordinal| {
            const raw = (try tree.attributeValue(a, font, "", faces.reference_names[ordinal])) orelse return error.MissingFontLanguageReference;
            const value = try raw.toUtf8(a, 64);
            defer a.free(value);
            const existing = try @import("xml_values.zig").unsigned32(value);
            const target: u32 = if (existing == 0) 1 else 0;
            const fragment = try write(a, &tree, node, language, target, 4_000_000);
            defer a.free(fragment);
            const output = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = fragment }}, 4_000_000);
            defer a.free(output);
            const start = @intFromPtr(raw.raw.ptr) - @intFromPtr(tree.source.ptr);
            const expected = try std.fmt.allocPrint(a, "{s}{c}{d}{c}{s}", .{ tree.source[0..start], raw.raw[0], target, raw.raw[0], tree.source[start + raw.raw.len ..] });
            defer a.free(expected);
            try std.testing.expectEqualStrings(expected, output);
            var parsed = try @import("xml_part_tree.zig").parse(a, output, .header, null, tree.item_index, .{});
            defer parsed.deinit(a);
            const changed = (try @import("character_font_references.zig").read(a, &parsed, node, 64)).?;
            const original = (try @import("character_font_references.zig").read(a, &tree, node, 64)).?;
            for (changed, original, 0..) |after, before, index| try std.testing.expectEqual(if (index == ordinal) @as(?u32, target) else before, after);
            verified += 1;
        }
    }
    try std.testing.expect(verified >= faces.languages.len);
}
