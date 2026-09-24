const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const table_fields = @import("table_xml_fields.zig");
const cell_fields = @import("table_cell_fields.zig");
const table_attributes = @import("table_attributes.zig");
const table_children = @import("table_children.zig");
const table_shape = @import("table_shape.zig");
const table_child_topology = @import("table_child_topology.zig");
const cell_sub_lists = @import("table_cell_sub_lists.zig");
const header_resources = @import("header_resources.zig");
const selection = @import("compatibility_selection.zig");
const tree_selection = @import("xml_tree_selection.zig");

pub const Options = struct {
    max_tables: usize = 100_000,
    max_rows: usize = 1_000_000,
    max_cells: usize = 4_000_000,
    max_grid_slots: usize = 100_000,
    max_total_grid_slots: usize = 4_000_000,
    max_total_cell_slots: usize = 8_000_000,
    max_attribute_bytes: usize = 4096,
    cell_sub_lists: cell_sub_lists.Options = .{},
    table_children: table_children.Options = .{},
    table_shape: table_shape.Options = .{},
};

/// Structural observations, not a claim that the table can be laid out or edited.
pub const Report = struct {
    sections: usize = 0,
    tables: usize = 0,
    rows: usize = 0,
    cells: usize = 0,
    grid_slots: usize = 0,
    cell_slots: usize = 0,
    missing_row_count: usize = 0,
    missing_column_count: usize = 0,
    row_count_mismatch: usize = 0,
    empty_rows: usize = 0,
    missing_address: usize = 0,
    duplicate_address: usize = 0,
    missing_span: usize = 0,
    duplicate_span: usize = 0,
    missing_coordinate: usize = 0,
    missing_span_value: usize = 0,
    row_address_mismatch: usize = 0,
    zero_span: usize = 0,
    outside_grid: usize = 0,
    overlaps: usize = 0,
    uncovered_slots: usize = 0,
    cell_fields: cell_fields.Report = .{},
    table_attributes: table_attributes.Report = .{},
    table_children: table_children.Report = .{},
    table_shape: table_shape.Report = .{},
    table_child_topology: table_child_topology.Report = .{},
    cell_sub_lists: cell_sub_lists.Report = .{},
};

pub fn initReport(border_fills: ?*const header_resources.Table) Report {
    var report: Report = .{};
    report.cell_fields.border_fill_references_checked = border_fills != null;
    report.table_attributes.border_fill_references_checked = border_fills != null;
    report.table_children.border_references_checked = border_fills != null;
    return report;
}

fn inspectCell(a: std.mem.Allocator, tree: *const tree_mod.Tree, cell: usize, row_index: usize, rows: ?u32, cols: ?u32, occupied: ?[]u8, options: Options, border_fills: ?*const header_resources.Table, report: *Report) !void {
    if (report.cells == options.max_cells) return error.LimitExceeded;
    report.cells += 1;
    try table_child_topology.inspectCell(a, tree, cell, &report.table_child_topology);
    try cell_fields.inspectCell(a, tree, cell, options.max_attribute_bytes, border_fills, &report.cell_fields);
    try cell_sub_lists.inspectCell(a, tree, cell, options.max_attribute_bytes, options.cell_sub_lists, &report.cell_sub_lists);
    const addr = table_fields.uniqueChild(tree, cell, table_fields.cell_child_names[0], &report.missing_address, &report.duplicate_address);
    const span = table_fields.uniqueChild(tree, cell, table_fields.cell_child_names[1], &report.missing_span, &report.duplicate_span);
    const col = if (addr) |index| try table_fields.optionalUnsigned(a, tree, index, "colAddr", options.max_attribute_bytes) else null;
    const row = if (addr) |index| try table_fields.optionalUnsigned(a, tree, index, "rowAddr", options.max_attribute_bytes) else null;
    const col_span = if (span) |index| try table_fields.optionalUnsigned(a, tree, index, "colSpan", options.max_attribute_bytes) else null;
    const row_span = if (span) |index| try table_fields.optionalUnsigned(a, tree, index, "rowSpan", options.max_attribute_bytes) else null;
    if (addr != null and (col == null or row == null)) report.missing_coordinate += 1;
    if (span != null and (col_span == null or row_span == null)) report.missing_span_value += 1;
    if (row) |value| if (value != row_index) {
        report.row_address_mismatch += 1;
    };
    if ((col_span != null and col_span.? == 0) or (row_span != null and row_span.? == 0)) report.zero_span += 1;
    if (col == null or row == null or col_span == null or row_span == null) return;
    if (rows == null or cols == null) return;
    // Subtraction guards also cover u32 arithmetic overflow.
    if (row.? >= rows.? or col.? >= cols.? or row_span.? > rows.? - row.? or col_span.? > cols.? - col.?) {
        report.outside_grid += 1;
        return;
    }
    const grid = occupied orelse return;
    const area = std.math.mul(usize, row_span.?, col_span.?) catch return error.LimitExceeded;
    if (report.cell_slots > options.max_total_cell_slots or area > options.max_total_cell_slots - report.cell_slots) return error.LimitExceeded;
    report.cell_slots += area;
    for (row.?..row.? + row_span.?) |r| {
        for (col.?..col.? + col_span.?) |c| {
            const slot = r * @as(usize, cols.?) + c;
            if (grid[slot] != 0) report.overlaps += 1 else grid[slot] = 1;
        }
    }
}

fn inspectTable(a: std.mem.Allocator, tree: *const tree_mod.Tree, table: usize, options: Options, border_fills: ?*const header_resources.Table, report: *Report) !void {
    if (report.tables == options.max_tables) return error.LimitExceeded;
    report.tables += 1;
    try table_attributes.inspectTable(a, tree, table, options.max_attribute_bytes, border_fills, &report.table_attributes);
    const rows = try table_fields.optionalUnsigned(a, tree, table, "rowCnt", options.max_attribute_bytes);
    const cols = try table_fields.optionalUnsigned(a, tree, table, "colCnt", options.max_attribute_bytes);
    try table_children.inspectTable(a, tree, table, rows, cols, options.max_attribute_bytes, options.table_children, border_fills, &report.table_children);
    try table_shape.inspectTable(a, tree, table, options.max_attribute_bytes, options.table_shape, &report.table_shape);
    if (rows == null) report.missing_row_count += 1;
    if (cols == null) report.missing_column_count += 1;
    var occupied: ?[]u8 = null;
    if (rows != null and cols != null) {
        const slots = std.math.mul(usize, rows.?, cols.?) catch return error.LimitExceeded;
        if (slots > options.max_grid_slots) return error.LimitExceeded;
        if (report.grid_slots > options.max_total_grid_slots or slots > options.max_total_grid_slots - report.grid_slots) return error.LimitExceeded;
        report.grid_slots += slots;
        occupied = try a.alloc(u8, slots);
        @memset(occupied.?, 0);
    }
    defer if (occupied) |grid| a.free(grid);

    var direct_rows: usize = 0;
    var row_cursor = tree.elements[table].first_child;
    while (row_cursor) |row| : (row_cursor = tree.elements[row].next_sibling) {
        if (!table_fields.childIs(tree, row, "tr")) continue;
        if (report.rows == options.max_rows) return error.LimitExceeded;
        report.rows += 1;
        try table_child_topology.inspectRow(a, tree, row, &report.table_child_topology);
        var direct_cells: usize = 0;
        var cell_cursor = tree.elements[row].first_child;
        while (cell_cursor) |cell| : (cell_cursor = tree.elements[cell].next_sibling) {
            if (!table_fields.childIs(tree, cell, "tc")) continue;
            direct_cells += 1;
            try inspectCell(a, tree, cell, direct_rows, rows, cols, occupied, options, border_fills, report);
        }
        if (direct_cells == 0) report.empty_rows += 1;
        direct_rows += 1;
    }
    if (rows) |declared| if (declared != direct_rows) {
        report.row_count_mismatch += 1;
    };
    if (occupied) |grid| for (grid) |slot| {
        if (slot == 0) report.uncovered_slots += 1;
    };
}

/// Scan all 2011 hp:tbl descendants (including nested tables) of each selected
/// section; only direct hp:tr/hp:tc/hp:cellAddr/hp:cellSpan children define a grid.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    return inspectWithBorderFills(a, sections, options, null);
}

/// The known-document path supplies its actual header inventory; standalone
/// structural inspection deliberately leaves reference counts unpopulated.
pub fn inspectWithBorderFills(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options, border_fills: ?*const header_resources.Table) !Report {
    var report = initReport(border_fills);
    for (sections) |*section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        for (section.elements, 0..) |element, index| {
            if (element.is(document_xml.paragraph_uri, "tbl")) try inspectTable(a, section, index, options, border_fills, &report);
        }
        report.sections += 1;
    }
    return report;
}

/// Explicit selected-branch view. Raw inspectWithBorderFills continues to
/// count both branches and does not evaluate required-namespace attributes.
pub fn inspectSelectedWithBorderFills(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options, border_fills: ?*const header_resources.Table, supported_namespaces: []const []const u8) !Report {
    const policy: selection.Policy = .{ .mode = .selected, .supported_namespaces = supported_namespaces };
    try selection.validate(policy);
    var report = initReport(border_fills);
    for (sections) |*section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        const frames = try tree_selection.build(a, section, policy, options.max_attribute_bytes);
        defer a.free(frames);
        for (section.elements, frames, 0..) |element, frame, index| {
            if (frame.active and element.is(document_xml.paragraph_uri, "tbl")) try inspectTable(a, section, index, options, border_fills, &report);
        }
        report.sections += 1;
    }
    return report;
}

fn belowDirectMasterSubList(tree: *const tree_mod.Tree, index: usize) bool {
    var cursor = tree.elements[index].parent;
    while (cursor) |parent| : (cursor = tree.elements[parent].parent) {
        if (tree.elements[parent].parent == 0 and tree.elements[parent].is(document_xml.paragraph_uri, "subList")) return true;
    }
    return false;
}

/// Applies the same table/cell field and occupancy rules only below a
/// root-direct master-page hp:subList. Returns that part's direct subList count.
pub fn inspectMasterPage(a: std.mem.Allocator, tree: *const tree_mod.Tree, options: Options, border_fills: ?*const header_resources.Table, report: *Report) !usize {
    if (tree.part_kind != .master_page or tree.elements.len == 0) return error.InvalidPartKind;
    var sub_lists: usize = 0;
    var root_child = tree.elements[0].first_child;
    while (root_child) |index| : (root_child = tree.elements[index].next_sibling) {
        sub_lists += @intFromBool(tree.elements[index].is(document_xml.paragraph_uri, "subList"));
    }
    for (tree.elements, 0..) |element, index| {
        if (element.is(document_xml.paragraph_uri, "tbl") and belowDirectMasterSubList(tree, index)) try inspectTable(a, tree, index, options, border_fills, report);
    }
    return sub_lists;
}

/// Same master-page table scope, with inactive switch branches excluded from
/// table and cell budgets. All XML nodes remain syntax-checked by the tree.
pub fn inspectSelectedMasterPage(a: std.mem.Allocator, tree: *const tree_mod.Tree, options: Options, border_fills: ?*const header_resources.Table, supported_namespaces: []const []const u8, report: *Report) !usize {
    if (tree.part_kind != .master_page or tree.elements.len == 0) return error.InvalidPartKind;
    const policy: selection.Policy = .{ .mode = .selected, .supported_namespaces = supported_namespaces };
    const frames = try tree_selection.build(a, tree, policy, options.max_attribute_bytes);
    defer a.free(frames);
    var sub_lists: usize = 0;
    var root_child = tree.elements[0].first_child;
    while (root_child) |index| : (root_child = tree.elements[index].next_sibling) {
        sub_lists += @intFromBool(tree.elements[index].is(document_xml.paragraph_uri, "subList"));
    }
    for (tree.elements, frames, 0..) |element, frame, index| {
        if (frame.active and element.is(document_xml.paragraph_uri, "tbl")) try inspectTable(a, tree, index, options, border_fills, report);
    }
    return sub_lists;
}
