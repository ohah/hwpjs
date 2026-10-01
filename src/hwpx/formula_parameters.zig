//! Formula parameter projection over the existing owned parameter report.
const std = @import("std");
const parameters = @import("parameter_lists.zig");

/// Strings borrow Report; null is absent, an empty slice is present-empty.
pub const View = struct {
    command: ?[]const u8 = null,
    formula: ?[]const u8 = null,
    result_format: ?[]const u8 = null,
    last_result: ?[]const u8 = null,
};

pub fn read(report: *const parameters.Report, section: usize, begin_element: usize) !?View {
    var result: ?View = null;
    for (report.roots) |root| {
        if (root.section_ordinal != section or root.parent_element_index != begin_element) continue;
        if (!std.mem.eql(u8, root.parent_uri, @import("document_xml.zig").paragraph_uri) or !std.mem.eql(u8, root.parent_local_name, "fieldBegin")) continue;
        if (root.first_node > report.nodes.len or root.node_count > report.nodes.len - root.first_node) return error.InvalidFormulaParameters;
        if (root.node_count == 0 or report.nodes[root.first_node].kind != .parameters) continue;
        if (result != null) return error.DuplicateFormulaParameters;
        var view: View = .{};
        for (report.nodes[root.first_node..][0..root.node_count]) |node| {
            if (node.parent_node_index != root.first_node) continue;
            const name = node.name orelse continue;
            const field: *?[]const u8 = if (std.mem.eql(u8, name, "Command")) &view.command else if (std.mem.eql(u8, name, "Formula")) &view.formula else if (std.mem.eql(u8, name, "ResultFormat")) &view.result_format else if (std.mem.eql(u8, name, "LastResult")) &view.last_result else continue;
            if (node.kind != .string or node.value == null or node.unknown_children != 0 or node.direct_children != 0) return error.InvalidFormulaParameterType;
            if (field.* != null) return error.DuplicateFormulaParameter;
            field.* = node.value.?;
        }
        result = view;
    }
    return result;
}

test "HWPX formula parameters preserve missing empty and reject duplicate or mistyped direct values" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:fieldBegin id='1' type='FORMULA'><p:parameters>";
    const cases = [_][]const u8{
        "<p:stringParam name='Formula'></p:stringParam>",
        "<p:stringParam name='Formula'>=SUM(A1:A2)</p:stringParam><p:stringParam name='Formula'>x</p:stringParam>",
        "<p:integerParam name='Formula'>1</p:integerParam>",
        "<p:listParam><p:stringParam name='Formula'>hidden</p:stringParam></p:listParam>",
        "<p:stringParam name='Formula'><p:unknown/></p:stringParam>",
        "</p:parameters><p:parameters><p:stringParam name='Formula'>duplicate root</p:stringParam>",
    };
    for (cases, 0..) |body, index| {
        const source = try std.mem.concat(a, u8, &.{ prefix, body, "</p:parameters></p:fieldBegin></s:sec>" });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        const trees = [_]@import("xml_part_tree.zig").Tree{tree};
        var report = try parameters.inspect(a, &trees, .{});
        defer report.deinit();
        switch (index) {
            0 => {
                const view = (try read(&report, 0, 1)).?;
                try std.testing.expectEqualStrings("", view.formula.?);
                try std.testing.expect(view.command == null);
            },
            1 => try std.testing.expectError(error.DuplicateFormulaParameter, read(&report, 0, 1)),
            2 => try std.testing.expectError(error.InvalidFormulaParameterType, read(&report, 0, 1)),
            3 => try std.testing.expect((try read(&report, 0, 1)).?.formula == null),
            4 => try std.testing.expectError(error.InvalidFormulaParameterType, read(&report, 0, 1)),
            5 => try std.testing.expectError(error.DuplicateFormulaParameters, read(&report, 0, 1)),
            else => unreachable,
        }
        try std.testing.expect(try read(&report, 1, 1) == null);
    }
}
