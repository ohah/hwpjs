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
    if (raw.borrowedNormalizedUtf8()) |kind| {
        if (kind.len > 4096) return error.LimitExceeded;
        return std.mem.eql(u8, kind, "FORMULA");
    }
    const kind = try raw.toUtf8(a, 4096);
    defer a.free(kind);
    return std.mem.eql(u8, kind, "FORMULA");
}

test "formula presence borrowed literal and normalized fallback keep exact limits" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:fieldBegin type='";
    const suffix = "'/></s:sec>";
    for ([_]struct { value: []const u8, formula: bool }{
        .{ .value = "FORMULA", .formula = true },
        .{ .value = "FORM&#85;LA", .formula = true },
        .{ .value = "formula", .formula = false },
        .{ .value = " FORMULA", .formula = false },
        .{ .value = "FORMULA&#x9;", .formula = false },
        .{ .value = "", .formula = false },
    }) |case| {
        const bytes = try std.mem.concat(a, u8, &.{ prefix, case.value, suffix });
        defer a.free(bytes);
        var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(case.formula, try isFormula(a, &tree, 1));
    }
    for ([_]usize{ 4096, 4097 }) |length| {
        const value = try a.alloc(u8, length);
        defer a.free(value);
        @memset(value, 'X');
        const bytes = try std.mem.concat(a, u8, &.{ prefix, value, suffix });
        defer a.free(bytes);
        var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
        defer tree.deinit(a);
        if (length == 4097) try std.testing.expectError(error.LimitExceeded, isFormula(a, &tree, 1)) else try std.testing.expect(!try isFormula(a, &tree, 1));
    }
}

/// Presence only; does not validate links, evaluate results, or grant editing.
pub fn hasFormula(a: std.mem.Allocator, tree: *const Tree) !bool {
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        if (try isFormula(a, tree, index)) return true;
    }
    return false;
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
