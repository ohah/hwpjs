//! Borrowed formula strings retained by an owned parameter report.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const parameters = @import("parameter_lists.zig");
pub const Query = struct {
    report: parameters.Report,
    values: @import("formula_parameters.zig").View,
    pub fn deinit(self: *Query) void {
        self.report.deinit();
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, begin: usize) !Query {
    const section = tree.section_ordinal orelse return error.InvalidFormulaSection;
    if (!try isFormula(a, tree, begin)) return error.InvalidFormulaFieldNode;
    var report = try parameters.inspectSection(a, tree, .{});
    errdefer report.deinit();
    const values = (try @import("formula_parameters.zig").read(&report, section, begin)) orelse return error.MissingFormulaParameters;
    return .{ .report = report, .values = values };
}

pub fn isFormula(a: std.mem.Allocator, tree: *const Tree, begin: usize) !bool {
    if (begin >= tree.elements.len or !tree.elements[begin].is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return error.InvalidFormulaFieldNode;
    const raw = (try tree.attributeValue(a, begin, "", "type")) orelse return false;
    const kind = try raw.toUtf8(a, 4096);
    defer a.free(kind);
    return std.mem.eql(u8, kind, "FORMULA");
}

fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:fieldBegin type='FORMULA'><p:parameters><p:stringParam name='Formula'>=SUM(A1:A2)</p:stringParam></p:parameters></p:fieldBegin></s:sec>", 7, 0, .{});
    defer tree.deinit(a);
    var query = try read(a, &tree, 1);
    defer query.deinit();
    try std.testing.expectEqualStrings("=SUM(A1:A2)", query.values.formula.?);
    try std.testing.expect(query.values.command == null);
}

test "HWPX formula source query allocation failures release borrowed report" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX formula source query actual command format and owned report" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, begin| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        var query = try read(a, tree, begin);
        defer query.deinit();
        try std.testing.expect(query.values.command != null);
        try std.testing.expect(query.values.formula != null);
        try std.testing.expect(query.values.result_format != null);
        try std.testing.expect(query.values.last_result != null);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 13), count);
    try std.testing.expectError(error.InvalidFormulaFieldNode, read(a, tree, 0));
}
