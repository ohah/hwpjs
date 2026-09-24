const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const values = @import("xml_values.zig");

pub const Options = struct {
    max_tables: usize = 100_000,
    max_rows: usize = 1_000_000,
    max_cells: usize = 4_000_000,
    max_grid_slots: usize = 100_000,
    max_total_grid_slots: usize = 4_000_000,
    max_total_cell_slots: usize = 8_000_000,
    max_attribute_bytes: usize = 4096,
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
};

fn childIs(tree: *const tree_mod.Tree, index: usize, local: []const u8) bool {
    return tree.elements[index].is(document_xml.paragraph_uri, local);
}

fn number(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, name: []const u8, max_bytes: usize) !?u32 {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return null;
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return try values.unsigned32(bytes);
}

fn uniqueChild(tree: *const tree_mod.Tree, parent: usize, name: []const u8, missing: *usize, duplicate: *usize) ?usize {
    var found: ?usize = null;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (!childIs(tree, index, name)) continue;
        if (found != null) {
            duplicate.* += 1;
            return null;
        }
        found = index;
    }
    if (found == null) missing.* += 1;
    return found;
}

fn inspectCell(a: std.mem.Allocator, tree: *const tree_mod.Tree, cell: usize, row_index: usize, rows: ?u32, cols: ?u32, occupied: ?[]u8, options: Options, report: *Report) !void {
    if (report.cells == options.max_cells) return error.LimitExceeded;
    report.cells += 1;
    const addr = uniqueChild(tree, cell, "cellAddr", &report.missing_address, &report.duplicate_address);
    const span = uniqueChild(tree, cell, "cellSpan", &report.missing_span, &report.duplicate_span);
    const col = if (addr) |index| try number(a, tree, index, "colAddr", options.max_attribute_bytes) else null;
    const row = if (addr) |index| try number(a, tree, index, "rowAddr", options.max_attribute_bytes) else null;
    const col_span = if (span) |index| try number(a, tree, index, "colSpan", options.max_attribute_bytes) else null;
    const row_span = if (span) |index| try number(a, tree, index, "rowSpan", options.max_attribute_bytes) else null;
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

fn inspectTable(a: std.mem.Allocator, tree: *const tree_mod.Tree, table: usize, options: Options, report: *Report) !void {
    if (report.tables == options.max_tables) return error.LimitExceeded;
    report.tables += 1;
    const rows = try number(a, tree, table, "rowCnt", options.max_attribute_bytes);
    const cols = try number(a, tree, table, "colCnt", options.max_attribute_bytes);
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
        if (!childIs(tree, row, "tr")) continue;
        if (report.rows == options.max_rows) return error.LimitExceeded;
        report.rows += 1;
        var direct_cells: usize = 0;
        var cell_cursor = tree.elements[row].first_child;
        while (cell_cursor) |cell| : (cell_cursor = tree.elements[cell].next_sibling) {
            if (!childIs(tree, cell, "tc")) continue;
            direct_cells += 1;
            try inspectCell(a, tree, cell, direct_rows, rows, cols, occupied, options, report);
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
    var report: Report = .{};
    for (sections) |*section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        for (section.elements, 0..) |element, index| {
            if (element.is(document_xml.paragraph_uri, "tbl")) try inspectTable(a, section, index, options, &report);
        }
        report.sections += 1;
    }
    return report;
}
