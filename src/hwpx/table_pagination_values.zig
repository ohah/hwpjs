//! Source table pagination values, independent of measured page layout.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("../xml/root.zig");
const fields = @import("table_xml_fields.zig");
pub const PageBreak = enum { none, table, cell, unknown };
pub const Values = struct { page_break: ?PageBreak, repeat_header: ?bool, no_adjust: ?bool, cell_spacing: ?u32, border_fill_id: ?u32 };

pub fn read(a: std.mem.Allocator, tree: *const Tree, table: usize, max_bytes: usize) !Values {
    if (table >= tree.elements.len or !fields.childIs(tree, table, "tbl")) return error.InvalidTablePaginationNode;
    var attributes: [5]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, table, &.{ "pageBreak", "repeatHeader", "noAdjust", "cellSpacing", "borderFillIDRef" }, &attributes);
    var page_break: ?PageBreak = null;
    if (attributes[0]) |raw| {
        const value = try raw.toUtf8(a, max_bytes);
        defer a.free(value);
        page_break = if (std.mem.eql(u8, value, "NONE")) .none else if (std.mem.eql(u8, value, "TABLE")) .table else if (std.mem.eql(u8, value, "CELL")) .cell else .unknown;
    }
    var booleans: fields.BooleanCounts = .{};
    return .{
        .page_break = page_break,
        .repeat_header = try fields.noteBoolean(a, attributes[1], max_bytes, &booleans),
        .no_adjust = try fields.noteBoolean(a, attributes[2], max_bytes, &booleans),
        .cell_spacing = if (attributes[3]) |raw| try fields.unsigned(a, raw, max_bytes) else null,
        .border_fill_id = if (attributes[4]) |raw| try fields.unsigned(a, raw, max_bytes) else null,
    };
}

test "HWPX table pagination values absence zero unknown and all allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:tbl pageBreak='CELL' repeatHeader='1' noAdjust='0' cellSpacing='0' borderFillIDRef='1'/><p:tbl/><p:tbl pageBreak='FUTURE'/></p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(Values{ .page_break = .cell, .repeat_header = true, .no_adjust = false, .cell_spacing = 0, .border_fill_id = 1 }, try read(a, &tree, 3, 4096));
    try std.testing.expectEqualDeep(Values{ .page_break = null, .repeat_header = null, .no_adjust = null, .cell_spacing = null, .border_fill_id = null }, try read(a, &tree, 4, 4096));
    try std.testing.expectEqual(@as(?PageBreak, .unknown), (try read(a, &tree, 5, 4096)).page_break);
    try std.testing.expectError(error.InvalidTablePaginationNode, read(a, &tree, 0, 4096));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const result = try read(allocator, source, 3, 4096);
            try std.testing.expectEqual(@as(?PageBreak, .cell), result.page_break);
        }
    }.run, .{&tree});
}

test "HWPX table pagination values actual table matches independent XML observation" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var count: usize = 0;
    for (session.sections[0].tree.elements, 0..) |_, node| {
        if (!fields.childIs(&session.sections[0].tree, node, "tbl")) continue;
        try std.testing.expectEqualDeep(Values{ .page_break = .cell, .repeat_header = true, .no_adjust = false, .cell_spacing = 0, .border_fill_id = 3 }, try read(a, &session.sections[0].tree, node, 4096));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
