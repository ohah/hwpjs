//! Formula field source values; never permission to edit the cached label.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const markers = @import("field_markers.zig");
const parameters = @import("parameter_lists.zig");
pub const names = [_][]const u8{ "Prop", "Command", "Formula", "ResultFormat", "LastResult" };
pub const Row = struct {
    begin_node: usize,
    end_node: usize,
    editable: ?bool,
    dirty: ?bool,
    raw: [names.len]?[]const u8 = @splat(null),
};
pub const Snapshot = struct {
    fields: markers.Report,
    params: parameters.Report,
    rows: []Row,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        a.free(self.rows);
        self.params.deinit();
        self.fields.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, sections: []const trees.Tree, section: usize) !Snapshot {
    if (section >= sections.len) return error.InvalidSectionIndex;
    var fields = try markers.inspect(a, sections, .{});
    errdefer fields.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, sections, &fields);
    defer a.free(ranges);
    var params = try parameters.inspect(a, sections, .{});
    errdefer params.deinit();
    var rows: std.ArrayList(Row) = .empty;
    defer rows.deinit(a);
    for (ranges) |range| {
        if (range.section != section) continue;
        const begin = fields.markers[range.begin_marker];
        const values = begin.begin orelse return error.InvalidFieldLinks;
        const kind = values.type_raw orelse continue;
        if (!std.mem.eql(u8, kind, "FORMULA")) continue;
        if (rows.items.len >= 100000) return error.LimitExceeded;
        var row = Row{ .begin_node = begin.element_index, .end_node = fields.markers[range.end_marker].element_index, .editable = values.editable, .dirty = values.dirty };
        var found = false;
        for (params.roots) |root| {
            if (root.section_ordinal != section or root.parent_element_index != begin.element_index) continue;
            if (found) return error.AmbiguousFormulaFieldParameters;
            found = true;
            for (params.nodes[root.first_node .. root.first_node + root.node_count]) |node| {
                if (node.parent_node_index != root.first_node) continue;
                const name = node.name orelse continue;
                for (names, 0..) |expected, slot| {
                    if (!std.mem.eql(u8, name, expected)) continue;
                    if (row.raw[slot] != null) return error.DuplicateFormulaFieldParameter;
                    const expected_kind: parameters.Kind = if (slot == 0) .integer else .string;
                    if (node.kind != expected_kind or node.direct_children != 0) return error.InvalidFormulaFieldParameter;
                    row.raw[slot] = node.value orelse return error.InvalidFormulaFieldParameter;
                }
            }
        }
        try rows.append(a, row);
    }
    return .{ .fields = fields, .params = params, .rows = try rows.toOwnedSlice(a) };
}

test "HWPX formula field snapshot retains actual commands and cached values" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const inputs = [_]trees.Tree{session.sections[0].tree};
    var snapshot = try read(a, &inputs, 0);
    defer snapshot.deinit(a);
    try std.testing.expectEqual(@as(usize, 13), snapshot.rows.len);
    try std.testing.expectEqualStrings("8", snapshot.rows[0].raw[0].?);
    try std.testing.expectEqualStrings("=SUM(B?:E?)??%g,;;67.5", snapshot.rows[0].raw[1].?);
    try std.testing.expectEqualStrings("=SUM(B?:E?)", snapshot.rows[0].raw[2].?);
    try std.testing.expectEqualStrings("%g,", snapshot.rows[0].raw[3].?);
    try std.testing.expectEqualStrings("67.5", snapshot.rows[0].raw[4].?);
    for (snapshot.rows) |row| try std.testing.expectEqual(@as(?bool, false), row.editable);
}

test "HWPX formula field snapshot rejects ambiguous scalar source and owns failure cleanup" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'><p:parameters cnt='1'>";
    const suffix = "</p:parameters></p:fieldBegin></p:ctrl><p:t>3</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    const good = prefix ++ "<p:stringParam name='Formula'>=SUM(A1:A2)</p:stringParam>" ++ suffix;
    var tree = try trees.parse(a, good, .section, 0, 0, .{});
    defer tree.deinit(a);
    const inputs = [_]trees.Tree{tree};
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parts: []const trees.Tree) !void {
            var result = try read(allocator, parts, 0);
            defer result.deinit(allocator);
            try std.testing.expectEqualStrings("=SUM(A1:A2)", result.rows[0].raw[2].?);
            try std.testing.expectEqual(@as(?bool, null), result.rows[0].editable);
            try std.testing.expectEqual(@as(?[]const u8, null), result.rows[0].raw[4]);
        }
    }.run, .{@as([]const trees.Tree, &inputs)});
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &inputs, 1));
    inline for (.{
        .{ "<p:stringParam name='Formula'>A</p:stringParam><p:stringParam name='Formula'>B</p:stringParam>", error.DuplicateFormulaFieldParameter },
        .{ "<p:integerParam name='Formula'>3</p:integerParam>", error.InvalidFormulaFieldParameter },
    }) |case| {
        var invalid = try trees.parse(a, prefix ++ case[0] ++ suffix, .section, 0, 0, .{});
        defer invalid.deinit(a);
        try std.testing.expectError(case[1], read(a, &.{invalid}, 0));
    }
    var foreign = try trees.parse(a, prefix ++ "<f:stringParam name='Formula'>A</f:stringParam>" ++ suffix, .section, 0, 0, .{});
    defer foreign.deinit(a);
    var result = try read(a, &.{foreign}, 0);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(?[]const u8, null), result.rows[0].raw[2]);
}
