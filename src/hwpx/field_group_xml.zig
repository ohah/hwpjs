//! 현재 필드 소유 그룹을 원본 ctrl과 현재 사이트에서 임시 XML로 조립합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Move = @import("field_split_plan.zig").Move;

pub fn write(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, options: @import("text_sites.zig").Options, limit: usize, max_markers: usize) ![]u8 {
    return writeDirty(a, trees, section, rows, report, options, &.{}, limit, max_markers);
}

pub fn writeDirty(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, options: @import("text_sites.zig").Options, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize, max_markers: usize) ![]u8 {
    return writePolicy(a, trees, section, rows, report, options, fields, limit, max_markers, true, false);
}

pub fn writeStyledDirty(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, options: @import("text_sites.zig").Options, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize, max_markers: usize) ![]u8 {
    return writePolicy(a, trees, section, rows, report, options, fields, limit, max_markers, true, false);
}

/// Serialize whole computed ownership; caller still validates formula semantics.
pub fn writeWholeFormulaDirty(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, options: @import("text_sites.zig").Options, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize, max_markers: usize) ![]u8 {
    return writePolicy(a, trees, section, rows, report, options, fields, limit, max_markers, true, true);
}

fn writePolicy(a: std.mem.Allocator, trees: []const Tree, section: usize, rows: []const Paragraph, report: *const @import("field_markers.zig").Report, options: @import("text_sites.zig").Options, fields: []const @import("text_sites_save.zig").FieldDirty, limit: usize, max_markers: usize, allow_styles: bool, allow_formula: bool) ![]u8 {
    if (allow_formula) try @import("field_partition.zig").validateWholeFormula(a, trees, section, rows, report, max_markers) else if (allow_styles) try @import("field_partition.zig").validateStyled(a, trees, section, rows, report, max_markers) else try @import("field_partition.zig").validate(a, trees, section, rows, report, max_markers);
    var inventory: std.ArrayList(Move) = .empty;
    defer inventory.deinit(a);
    for (rows) |row| for (row.field_positions.?) |position| try inventory.append(a, .{ .position = position, .side = .left, .unit = position.unit });
    const tree = &trees[section];
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (rows) |*row| {
        const continuation = row.generated_id != null;
        var owned: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer owned.deinit(a);
        for (row.field_positions.?) |position| try owned.put(a, position.element_index, {});
        const planned = try a.dupe(Move, inventory.items);
        defer a.free(planned);
        for (planned) |*move| {
            move.side = if (owned.contains(move.position.element_index) == continuation) .right else .left;
        }
        const xml = if (allow_styles and row.character_styles != null)
            try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptions(a, tree, row, fields, options, limit -| output.items.len)
        else
            try @import("paragraph_split_xml.zig").writeFieldsDirty(a, tree, row.template_element, &row.sites, options, continuation, row.generated_id orelse 0, planned, fields, limit -| output.items.len);
        defer a.free(xml);
        const formatted = if (row.paragraph_shape_id) |id| try @import("paragraph_format_write.zig").writeCurrent(a, tree, row.template_element, xml, id, limit -| output.items.len) else null;
        defer if (formatted) |bytes| a.free(bytes);
        const bytes = formatted orelse xml;
        if (bytes.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, bytes);
    }
    return output.toOwnedSlice(a);
}
