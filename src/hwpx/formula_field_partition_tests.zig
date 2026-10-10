const std = @import("std");

test "whole formula partition rejects split result ownership and preserves text-field policy" {
    const a = std.testing.allocator;
    const Tree = @import("xml_part_tree.zig").Tree;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'/></p:ctrl><p:t>67.5</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    var fields = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer fields.deinit();
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    var draft = try @import("field_split_draft.zig").prepare(a, &trees, 0, &current.paragraphs[0], &fields, 2, 2, 10000, 100);
    defer draft.deinit(a);
    const split = @import("field_structure_split.zig");
    for ([_]u32{ 0, 4 }) |at| {
        var candidate = try split.prepareWholeFormula(a, &trees, 0, &current, 0, at, at, 2, &fields, 10000, 100);
        defer candidate.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs.len);
        const owner: usize = if (at == 0) 1 else 0;
        try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs[owner].field_positions.?.len);
        try std.testing.expectEqual(@as(usize, 0), candidate.paragraphs[1 - owner].field_positions.?.len);
        try std.testing.expectEqualStrings("67.5", candidate.paragraphs[owner].sites.items[0].text);
    }
    for ([_]u32{ 1, 2, 3 }) |at| try std.testing.expectError(error.ProtectedFieldRange, split.prepareWholeFormula(a, &trees, 0, &current, 0, at, at, 2, &fields, 10000, 100));
    try std.testing.expectError(error.ProtectedFieldRange, split.prepareWholeFormula(a, &trees, 0, &current, 0, 0, 4, 2, &fields, 10000, 100));
    try std.testing.expectError(error.InvalidParagraphInstanceId, split.prepareWholeFormula(a, &trees, 0, &current, 0, 0, 0, 1, &fields, 10000, 100));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: []const Tree, original: *const @import("paragraph_structure_values.zig").Values, linked_fields: *const @import("field_markers.zig").Report) !void {
            var candidate = try @import("field_structure_split.zig").prepareWholeFormula(allocator, borrowed, 0, original, 0, 0, 0, 2, linked_fields, 10000, 100);
            defer candidate.deinit(allocator);
            try std.testing.expectEqualStrings("67.5", original.paragraphs[0].sites.items[0].text);
            try std.testing.expectEqualStrings("67.5", candidate.paragraphs[1].sites.items[0].text);
        }
    }.run, .{ &trees, &current, &fields });
    current.paragraphs[0].field_positions = try @import("field_source_positions.zig").build(a, &trees, 0, &current.paragraphs[0], &fields, 100);
    const partition = @import("field_partition.zig");
    try partition.validateWholeFormula(a, &trees, 0, current.paragraphs, &fields, 100);
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, partition.validateStyled(a, &trees, 0, current.paragraphs, &fields, 100));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: []const Tree, rows: []const @import("paragraph_structure_values.zig").Paragraph, linked: *const @import("field_markers.zig").Report) !void {
            try @import("field_partition.zig").validateWholeFormula(allocator, parsed, 0, rows, linked, 100);
        }
    }.run, .{ &trees, current.paragraphs, &fields });
    const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
    var rows: [2]Paragraph = undefined;
    var initialized: usize = 0;
    defer for (rows[0..initialized]) |*row| row.deinit(a);
    for (&rows, 0..) |*row, index| {
        row.* = try current.paragraphs[0].clone(a);
        initialized += 1;
        row.sites.deinit(a);
        row.sites = try (if (index == 0) &draft.text.left else &draft.text.right).clone(a);
        a.free(row.field_positions.?);
        row.field_positions = null;
        row.field_positions = try @import("field_structure_split.zig").side(a, draft.markers, if (index == 0) .left else .right);
        if (index == 1) {
            row.source_ordinal = null;
            row.generated_id = 2;
        }
    }
    try std.testing.expectError(error.ProtectedFieldRange, partition.validateWholeFormula(a, &trees, 0, &rows, &fields, 100));
    var source = current.paragraphs[0];
    source.field_positions = null;
    var whole = try @import("field_split_draft.zig").prepare(a, &trees, 0, &source, &fields, 0, 0, 10000, 100);
    defer whole.deinit(a);
    const left_sites = try whole.text.left.clone(a);
    rows[0].sites.deinit(a);
    rows[0].sites = left_sites;
    a.free(rows[0].field_positions.?);
    rows[0].field_positions = try a.alloc(@import("field_position.zig").Position, 0);
    const right_sites = try whole.text.right.clone(a);
    rows[1].sites.deinit(a);
    rows[1].sites = right_sites;
    a.free(rows[1].field_positions.?);
    rows[1].field_positions = null;
    rows[1].field_positions = try a.dupe(@import("field_position.zig").Position, current.paragraphs[0].field_positions.?);
    try partition.validateWholeFormula(a, &trees, 0, &rows, &fields, 100);
    const group = @import("field_group_xml.zig");
    const saved = try group.writeWholeFormulaDirty(a, &trees, 0, &rows, &fields, .{}, &.{}, 10000, 100);
    defer a.free(saved);
    const wrapped = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", saved, "</s:sec>" });
    defer a.free(wrapped);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer parsed.deinit(a);
    var linked = try @import("field_markers.zig").inspect(a, &.{parsed}, .{});
    defer linked.deinit();
    try std.testing.expectEqual(@as(usize, 2), linked.markers.len);
    var paragraph_count: usize = 0;
    var right: ?usize = null;
    for (parsed.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "p")) {
        paragraph_count += 1;
        right = index;
    };
    try std.testing.expectEqual(@as(usize, 2), paragraph_count);
    for (linked.markers) |marker| try std.testing.expectEqual(right.?, try @import("paragraph_site_owner.zig").ancestor(&parsed, marker.element_index));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "67.5"));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, group.writeStyledDirty(a, &trees, 0, &rows, &fields, .{}, &.{}, 10000, 100));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: []const Tree, paragraphs: []const Paragraph, report_fields: *const @import("field_markers.zig").Report, expected: []const u8) !void {
            const xml = try @import("field_group_xml.zig").writeWholeFormulaDirty(allocator, borrowed, 0, paragraphs, report_fields, .{}, &.{}, 10000, 100);
            defer allocator.free(xml);
            try std.testing.expectEqualSlices(u8, expected, xml);
        }
    }.run, .{ &trees, &rows, &fields, saved });
    {
        const owned = rows[1].field_positions.?;
        rows[1].field_positions = owned[0..1];
        defer rows[1].field_positions = owned;
        try std.testing.expectError(error.SourceBindingMismatch, partition.validateWholeFormula(a, &trees, 0, &rows, &fields, 100));
    }
    try std.testing.expectEqualStrings("67.5", current.paragraphs[0].sites.items[0].text);
}
