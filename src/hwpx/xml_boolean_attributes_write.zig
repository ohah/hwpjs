//! Source-bound boolean attributes, including absent attributes. No flow policy.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime names: []const []const u8, values: [names.len]bool, max_bytes: usize) ![]u8 {
    comptime {
        for (names, 0..) |name, index| {
            if (name.len == 0) @compileError("Empty boolean attribute name");
            for (name, 0..) |c, offset| {
                const letter = (c >= 'A' and c <= 'Z') or (c >= 'a' and c <= 'z') or c == '_';
                if (!letter and !(offset > 0 and ((c >= '0' and c <= '9') or c == '-' or c == '.'))) @compileError("Expected an unprefixed ASCII attribute name");
            }
            for (names[0..index]) |prior| if (std.mem.eql(u8, prior, name)) @compileError("Duplicate boolean attribute name");
        }
    }
    if (node >= tree.elements.len) return error.InvalidXmlAttributeNode;
    if (tree.elements[node].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const span = tree.elements[node].start_tag;
    const raw = tree.source[span.start..span.end];
    var attributes: [names.len]?@import("../xml/attribute_value.zig").Value = undefined;
    try tree.unprefixedAttributeValues(a, node, names, &attributes);
    var patches: [names.len + 1]writer.Change = undefined;
    var count: usize = 0;
    var missing: std.ArrayList(u8) = .empty;
    defer missing.deinit(a);
    for (names, attributes, values) |name, attribute, value| {
        if (attribute) |existing| {
            const decoded = try existing.toUtf8(a, 4096);
            defer a.free(decoded);
            if (try @import("xml_values.zig").boolean(decoded) == value) continue;
            const replacement: []const u8 = if (existing.raw[0] == '\'') (if (value) "'1'" else "'0'") else (if (value) "\"1\"" else "\"0\"");
            const start = @intFromPtr(existing.raw.ptr) - @intFromPtr(raw.ptr);
            patches[count] = .{ .start = start, .end = start + existing.raw.len, .text = "", .serialized_xml = replacement };
            count += 1;
        } else {
            const length = std.math.add(usize, name.len, 5) catch return error.LimitExceeded;
            if (length > max_bytes -| missing.items.len) return error.LimitExceeded;
            try missing.appendSlice(a, " ");
            try missing.appendSlice(a, name);
            try missing.appendSlice(a, if (value) "=\"1\"" else "=\"0\"");
        }
    }
    if (missing.items.len != 0) {
        const close = raw.len - (if (std.mem.endsWith(u8, raw, "/>")) @as(usize, 2) else 1);
        patches[count] = .{ .start = close, .end = close, .text = "", .serialized_xml = missing.items };
        count += 1;
    }
    std.mem.sort(writer.Change, patches[0..count], {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, raw, patches[0..count], max_bytes);
}

test "boolean attribute write preserves lexical spelling and separates namespace ownership" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:p x:pageBreak='keep' columnBreak = 'true' pageBreak=\"&#48;\" opaque='&amp;'/><p:p x:pageBreak='keep'/><p:p></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    const kept = try write(a, &tree, 1, &.{ "pageBreak", "columnBreak" }, .{ false, true }, 1000);
    defer a.free(kept);
    try std.testing.expectEqualStrings(tree.source[tree.elements[1].start_tag.start..tree.elements[1].start_tag.end], kept);
    const changed = try write(a, &tree, 1, &.{ "pageBreak", "columnBreak" }, .{ true, false }, 1000);
    defer a.free(changed);
    try std.testing.expectEqualStrings("<p:p x:pageBreak='keep' columnBreak = '0' pageBreak=\"1\" opaque='&amp;'/>", changed);
    const added = try write(a, &tree, 2, &.{ "pageBreak", "columnBreak" }, .{ true, false }, 1000);
    defer a.free(added);
    try std.testing.expectEqualStrings("<p:p x:pageBreak='keep' pageBreak=\"1\" columnBreak=\"0\"/>", added);
    const bounded = try write(a, &tree, 2, &.{ "pageBreak", "columnBreak" }, .{ true, false }, added.len);
    defer a.free(bounded);
    try std.testing.expectEqualSlices(u8, added, bounded);
    const assembled = try writer.write(a, input, &.{.{ .start = tree.elements[2].start_tag.start, .end = tree.elements[2].start_tag.end, .text = "", .start_tag = added }}, 2000);
    defer a.free(assembled);
    var reopened = try @import("section_tree.zig").parse(a, assembled, 0, 0, .{});
    defer reopened.deinit(a);
    const page = (try reopened.attributeValue(a, 2, "", "pageBreak")).?;
    const column = (try reopened.attributeValue(a, 2, "", "columnBreak")).?;
    try std.testing.expectEqualStrings("\"1\"", page.raw);
    try std.testing.expectEqualStrings("\"0\"", column.raw);
    const opening = try write(a, &tree, 3, &.{ "pageBreak", "columnBreak" }, .{ false, true }, 1000);
    defer a.free(opening);
    try std.testing.expectEqualStrings("<p:p pageBreak=\"0\" columnBreak=\"1\">", opening);
    try std.testing.expectError(error.InvalidXmlAttributeNode, write(a, &tree, tree.elements.len, &.{"pageBreak"}, .{true}, 1000));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 2, &.{ "pageBreak", "columnBreak" }, .{ true, false }, added.len - 1));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "boolean attribute write mixed insertion and replacement cleans every allocation failure" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p columnBreak='true'/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, &.{ "pageBreak", "columnBreak" }, .{ true, false }, 1000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<p:p columnBreak='0' pageBreak=\"1\"/>", output);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}

test "boolean attribute write rejects malformed source booleans without publishing partial edits" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p columnBreak='maybe'/></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidXmlBoolean, write(a, &tree, 1, &.{ "pageBreak", "columnBreak" }, .{ true, false }, 1000));
    try std.testing.expectEqualStrings(input, tree.source);
}
