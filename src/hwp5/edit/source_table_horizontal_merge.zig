//! Merge one rectangular range of an authored source table. Surviving records retain
//! their original framing; only the TABLE per-row cell counts and anchor LIST_HEADER fields change.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const plain_grid = @import("source_table_plain_grid.zig");
const geom = @import("source_table_cell_split_geometry.zig");
const Version = @import("../version.zig").Version;

pub const Selection = struct { row: u16, first_column: u16, last_column: u16, last_row: ?u16 = null };

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, request: grid.Request, selection: Selection, limits: grid.Limits) ![]u8 {
    if (request.command != null or request.split != null or request.new_paragraph_ids.len != 0) return error.InvalidSourceTableGridOperation;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const before = try plain_grid.inspect(scratch, source, version, request, limits);
    const tree = before.tree;
    const table = before.marker.record.value.table;
    const last_row = selection.last_row orelse selection.row;
    if (selection.row > last_row or last_row >= table.row_count or selection.first_column > selection.last_column or
        selection.last_column >= table.column_count or
        (selection.row == last_row and selection.first_column == selection.last_column)) return error.InvalidSourceTableCellMerge;
    const links = try @import("../body/control_links.zig").Links.build(scratch, tree);
    const owner = before.marker.parent.?;
    for (links.items) |link| {
        if (link.control_node == owner and link.identity == .exact) break;
    } else return error.InvalidSourceTableGridTarget;
    const x = try geom.axis(scratch, before.metadata, table.column_count, true);
    const y = try geom.axis(scratch, before.metadata, table.row_count, false);
    const column_span = selection.last_column - selection.first_column + 1;
    const row_span = last_row - selection.row + 1;
    const covered_count = @as(usize, column_span) * row_span - 1;
    const removals = try scratch.alloc(struct { start: usize, end: usize }, covered_count);
    var removed: usize = 0;
    var removed_bytes: usize = 0;
    var first_index: ?usize = null;
    for (before.cells, 0..) |cell, index| {
        const value = cell.value;
        if (value.row > last_row) break;
        if (value.row < selection.row or value.column < selection.first_column or value.column > selection.last_column) continue;
        if (value.column_span != 1 or value.row_span != 1) return error.UnsupportedSourceTableGrid;
        if (value.row == selection.row and value.column == selection.first_column) {
            first_index = index;
            continue;
        }
        if (first_index == null or removed == removals.len) return error.UnsupportedSourceTableGrid;
        if (cell.group.paragraph_count != 1 or tree.nodes[cell.group.header_node].subtree_end != cell.group.header_node + 1)
            return error.UnsupportedSourceTableGrid;
        const parts = try @import("../body/paragraph_children.zig").collect(tree, cell.header);
        const text = if (parts.text_node) |node| tree.nodes[node].record.framing.payload else &.{};
        if (text.len != 0 and !std.mem.eql(u8, text, &.{ 13, 0 })) return error.NonemptyCoveredSourceTableCell;
        const start = tree.nodes[cell.group.header_node].record.framing.offset;
        const end = if (cell.group.end == tree.nodes.len) source.len else tree.nodes[cell.group.end].record.framing.offset;
        removals[removed] = .{ .start = start, .end = end };
        removed += 1;
        removed_bytes += end - start;
    }
    // The inventory proves exact, non-overlapping grid coverage. A span entering
    // the selection from outside would leave at least one selected anchor absent.
    if (first_index == null or removed != removals.len) return error.UnsupportedSourceTableGrid;
    const out = try a.alloc(u8, source.len - removed_bytes);
    errdefer a.free(out);
    var input_cursor: usize = 0;
    var output_cursor: usize = 0;
    for (removals) |removal| {
        const retained = source[input_cursor..removal.start];
        @memcpy(out[output_cursor..][0..retained.len], retained);
        output_cursor += retained.len;
        input_cursor = removal.end;
    }
    @memcpy(out[output_cursor..], source[input_cursor..]);

    const table_record = before.marker.record.framing;
    const count_offset = table_record.offset + table_record.raw.len - table_record.payload.len + 18;
    for (selection.row..@as(usize, last_row) + 1) |row| {
        const row_at = count_offset + row * 2;
        const removed_in_row = column_span - @as(u16, @intFromBool(row == selection.row));
        std.mem.writeInt(u16, out[row_at..][0..2], table.rows.get(row).?.size - removed_in_row, .little);
    }
    const list_record = tree.nodes[before.cells[first_index.?].group.header_node].record.framing;
    const list_prefix: usize = if (request.layout == .observed8) 8 else 6;
    const cell_at = list_record.offset + list_record.raw.len - list_record.payload.len + list_prefix;
    const width = x[@as(usize, selection.last_column) + 1] - x[selection.first_column];
    const height = y[@as(usize, last_row) + 1] - y[selection.row];
    std.mem.writeInt(u16, out[cell_at + 4 ..][0..2], column_span, .little);
    std.mem.writeInt(u16, out[cell_at + 6 ..][0..2], row_span, .little);
    std.mem.writeInt(u32, out[cell_at + 8 ..][0..4], width, .little);

    std.mem.writeInt(u32, out[cell_at + 12 ..][0..4], height, .little);

    const after = try plain_grid.inspect(scratch, out, version, request, limits);
    if (after.cells.len != before.cells.len - removed) return error.OutputValidationFailed;
    const merged = after.cells[first_index.?].value;
    if (merged.row != selection.row or
        merged.column != selection.first_column or merged.column_span != column_span or merged.row_span != row_span or
        merged.width != width or merged.height != height) return error.OutputValidationFailed;
    return out;
}
