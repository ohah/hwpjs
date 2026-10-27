//! 원본 grid 관측. 축/쓰기방향/단위/스키마 기본값은 정규화하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const settings = @import("section_direct_settings.zig");
const definitions = @import("section_definition.zig");
const values = @import("xml_values.zig");
const Owner = struct { section: usize, node: usize };
const Grid = struct {
    node: usize,
    parent_node: usize,
    line_grid_raw: ?[]const u8,
    line_grid_value: ?u32,
    line_grid_error: ?[]const u8,
    char_grid_raw: ?[]const u8,
    char_grid_value: ?u32,
    char_grid_error: ?[]const u8,
    wonggoji_format_raw: ?[]const u8,
    wonggoji_format_value: ?bool,
    wonggoji_format_error: ?[]const u8,
    other_attributes: usize,
    extension_attributes: usize,
    direct_children: usize,
};
const Row = struct {
    section: usize,
    node: usize,
    body_owner: ?usize,
    text_direction_raw: ?[]const u8,
    grid_sources: []const Grid,
};
const Envelope = struct {
    schemaVersion: u8 = 1,
    normalization: []const u8 = "none",
    schemaDefaultApplied: bool = false,
    sections: usize,
    rows: []const Row,
};
fn issue(errors: *const settings.ValueErrors, item: *const settings.Item, field: settings.Field) ?[]const u8 {
    return errors.get(.{ .section = item.section_ordinal, .node = item.element_index, .field = field });
}
fn integer(errors: *const settings.ValueErrors, item: *const settings.Item, field: settings.Field) !?u32 {
    if (issue(errors, item, field) != null) return null;
    return if (item.get(field)) |raw| try values.unsigned32(raw) else null;
}
pub fn encodeTrees(a: std.mem.Allocator, trees: []const Tree) ![]u8 {
    var errors: settings.ValueErrors = .init(a);
    defer errors.deinit();
    var observed = try settings.inspect(a, trees, .{ .kind_filter = .grid, .observation_errors = &errors });
    defer observed.deinit(a);
    var report = try definitions.inspect(a, trees, .{});
    defer report.deinit(a);
    var grids: std.AutoHashMap(Owner, std.ArrayList(Grid)) = .init(a);
    defer {
        var lists = grids.valueIterator();
        while (lists.next()) |list| list.deinit(a);
        grids.deinit();
    }
    for (observed.items) |*item| {
        const entry = try grids.getOrPut(.{ .section = item.section_ordinal, .node = item.parent_element_index });
        if (!entry.found_existing) entry.value_ptr.* = .empty;
        try entry.value_ptr.append(a, .{
            .node = item.element_index,
            .parent_node = item.parent_element_index,
            .line_grid_raw = item.get(.line_grid),
            .line_grid_value = try integer(&errors, item, .line_grid),
            .line_grid_error = issue(&errors, item, .line_grid),
            .char_grid_raw = item.get(.char_grid),
            .char_grid_value = try integer(&errors, item, .char_grid),
            .char_grid_error = issue(&errors, item, .char_grid),
            .wonggoji_format_raw = item.get(.wonggoji_format),
            .wonggoji_format_value = if (issue(&errors, item, .wonggoji_format) != null) null else if (item.get(.wonggoji_format)) |raw| try values.boolean(raw) else null,
            .wonggoji_format_error = issue(&errors, item, .wonggoji_format),
            .other_attributes = item.other_attributes,
            .extension_attributes = item.extension_attributes,
            .direct_children = item.direct_children,
        });
    }
    const rows = try a.alloc(Row, report.definitions.len);
    defer a.free(rows);
    var cursor: usize = 0;
    for (trees, 0..) |*tree, section| {
        var owners = try @import("section_tab_ownership.zig").collect(a, tree);
        defer owners.deinit();
        while (cursor < report.definitions.len and report.definitions[cursor].section_ordinal == section) : (cursor += 1) {
            const d = &report.definitions[cursor];
            const entries = grids.get(.{ .section = section, .node = d.element_index });
            rows[cursor] = .{
                .section = section,
                .node = d.element_index,
                .body_owner = owners.get(d.element_index),
                .text_direction_raw = d.get(.text_direction),
                .grid_sources = if (entries) |list| list.items else &.{},
            };
        }
    }
    if (cursor != rows.len) return error.SourceBindingMismatch;
    return std.json.Stringify.valueAlloc(a, Envelope{ .sections = trees.len, .rows = rows }, .{});
}
pub fn encode(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) ![]u8 {
    const trees = try a.alloc(Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| tree.* = section.tree;
    return encodeTrees(a, trees);
}
