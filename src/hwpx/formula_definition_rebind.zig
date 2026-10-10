//! Rebind immutable source element identities after transient topology output.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("formula_definition_values.zig").Values;

fn id(a: std.mem.Allocator, tree: *const Tree, node: usize) ![]u8 {
    if (!try @import("formula_source_query.zig").isFormula(a, tree, node)) return error.SourceBindingMismatch;
    const raw = (try tree.attributeValue(a, node, "", "id")) orelse return error.MissingFormulaIdentity;
    return raw.toUtf8(a, 4096);
}

pub fn rebind(a: std.mem.Allocator, original: *const Tree, rendered: *const Tree, definitions: *const Values) !Values {
    if (original.section_ordinal != rendered.section_ordinal) return error.SourceBindingMismatch;
    var result: Values = .{};
    errdefer result.deinit(a);
    for (definitions.entries.items) |entry| {
        const target = try findNode(a, original, rendered, entry.begin_element);
        var before = try @import("formula_source_query.zig").read(a, original, entry.begin_element);
        defer before.deinit();
        var after = try @import("formula_source_query.zig").read(a, rendered, target);
        defer after.deinit();
        if (!equalOptional(before.values.formula, after.values.formula) or !equalOptional(before.values.result_format, after.values.result_format)) return error.SourceBindingMismatch;
        _ = try result.set(a, rendered, target, entry.formula);
    }
    return result;
}

/// Resolve the same explicit field ID in another topology of the same section.
pub fn findNode(a: std.mem.Allocator, original: *const Tree, rendered: *const Tree, begin: usize) !usize {
    if (original.section_ordinal != rendered.section_ordinal) return error.SourceBindingMismatch;
    const identity = try id(a, original, begin);
    defer a.free(identity);
    if (identity.len == 0) return error.MissingFormulaIdentity;
    var found: ?usize = null;
    for (rendered.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        const raw = (try rendered.attributeValue(a, node, "", "id")) orelse continue;
        const candidate = try raw.toUtf8(a, 4096);
        defer a.free(candidate);
        if (!std.mem.eql(u8, candidate, identity)) continue;
        if (found != null) return error.DuplicateFormulaIdentity;
        found = node;
    }
    const target = found orelse return error.MissingFormulaIdentity;
    if (!try @import("formula_source_query.zig").isFormula(a, rendered, target)) return error.SourceBindingMismatch;
    return target;
}

fn equalOptional(left: ?[]const u8, right: ?[]const u8) bool {
    if (left == null or right == null) return left == null and right == null;
    return std.mem.eql(u8, left.?, right.?);
}

test "HWPX formula identity rejects missing duplicate and foreign field type" {
    const a = std.testing.allocator;
    var original = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer original.deinit(a);
    var begin: usize = 0;
    for (original.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = index;
    }
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const cases = [_][]const u8{
        "<p:fieldBegin id='2' type='FORMULA'/>",
        "<p:fieldBegin id='1' type='FORMULA'/><p:fieldBegin id='1' type='FORMULA'/>",
        "<p:fieldBegin id='1' type='HYPERLINK'/>",
    };
    const errors = [_]anyerror{ error.MissingFormulaIdentity, error.DuplicateFormulaIdentity, error.SourceBindingMismatch };
    for (cases, errors) |body, expected| {
        const xml = try std.mem.concat(a, u8, &.{ prefix, body, "</s:sec>" });
        defer a.free(xml);
        var rendered = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer rendered.deinit(a);
        try std.testing.expectError(expected, findNode(a, &original, &rendered, begin));
    }
}

test "HWPX formula definition rebind follows explicit identity after shifted elements" {
    const a = std.testing.allocator;
    const source = @import("test_formula_fixture.zig").section;
    var original = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer original.deinit(a);
    const boundary = std.mem.indexOf(u8, source, "<p:tbl").?;
    const composed = try std.mem.concat(a, u8, &.{ source[0..boundary], "<p:p><p:run><p:t>extra</p:t></p:run></p:p>", source[boundary..] });
    defer a.free(composed);
    var rendered = try @import("xml_part_tree.zig").parse(a, composed, .section, 0, 0, .{});
    defer rendered.deinit(a);
    var node: usize = 0;
    for (original.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) {
        node = index;
    };
    var definitions: Values = .{};
    defer definitions.deinit(a);
    _ = try definitions.set(a, &original, node, "=AVG(A1:A1)");
    var mapped = try rebind(a, &original, &rendered, &definitions);
    defer mapped.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), mapped.entries.items.len);
    try std.testing.expect(mapped.entries.items[0].begin_element != node);
    try std.testing.expectEqualStrings("=AVG(A1:A1)", mapped.entries.items[0].formula);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, old: *const Tree, current: *const Tree, values: *const Values) !void {
            var copy = try rebind(allocator, old, current, values);
            defer copy.deinit(allocator);
            try std.testing.expectEqualStrings("=AVG(A1:A1)", copy.entries.items[0].formula);
        }
    }.run, .{ &original, &rendered, &definitions });
}
