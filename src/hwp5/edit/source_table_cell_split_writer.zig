//! Immutable source-table subdivision, sharing the ordinary paragraph eligibility
//! and serializers with source_table_grid. Scratch state never outlives prepare.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const geom = @import("source_table_cell_split_geometry.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const framing = @import("../record_writer.zig");
const Header = body.Header;
fn recordEnd(tree: Tree, index: usize, length: usize) usize {
    return if (index == tree.nodes.len) length else tree.nodes[index].record.framing.offset;
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
pub fn prepare(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, request: grid.Request, limits: grid.Limits) ![]u8 {
    if (source.len > limits.max_bytes) return error.LimitExceeded;
    if (request.command != null or request.split == null) return error.InvalidSourceTableGridOperation;
    const division = request.split.?;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var tree = try @import("source_tree.zig").parse(scratch, source, version, .{ .max_records = limits.max_records });
    defer tree.deinit(scratch);
    if (request.table_node >= tree.nodes.len or tree.nodes[request.table_node].record.value != .table) return error.InvalidSourceTableGridTarget;
    const marker = tree.nodes[request.table_node];
    const table = marker.record.value.table;
    if (table.row_count != request.expected_rows or table.column_count != request.expected_columns) return error.SourceBindingMismatch;
    const requested = try @import("source_table_cell_split.zig").create(table.row_count, table.column_count, division, limits.max_cells);
    if (table.extra.len != 0 or table.cell_spacing != 0 or (table.zones != null and table.zones.?.count() != 0)) return error.UnsupportedSourceTableGrid;
    if (marker.subtree_end != request.table_node + 1) return error.UnsupportedSourceTableGrid;
    const owner = marker.parent orelse return error.InvalidSourceTableGridTarget;
    const control = tree.nodes[owner];
    if (control.record.value != .control_header or control.record.value.control_header.id != @import("../body/control_rules.zig").table_id) return error.InvalidSourceTableGridTarget;
    const host = control.parent orelse return error.InvalidSourceTableGridTarget;
    if (tree.nodes[host].parent != null) return error.UnsupportedSourceTableGrid;
    const common = try body.object_common.parseControl(control.record.value.control_header);
    if (!body.object_common.hasAbsoluteDimensions(common.flags) or common.width == 0 or common.height == 0 or common.sizeProtected()) return error.UnsupportedSourceTableGrid;
    var groups = try @import("../body/list_groups.zig").Groups.build(scratch, tree);
    defer groups.deinit(scratch);
    const slots = @as(usize, table.row_count) * table.column_count;
    const cells = try scratch.alloc(grid.Cell, slots);
    const metadata = try scratch.alloc(body.Cell, slots);
    const covered = try scratch.alloc(bool, slots);
    @memset(covered, false);
    const row_cells = try scratch.alloc(usize, table.row_count);
    @memset(row_cells, 0);
    var found: usize = 0;
    var previous: ?usize = null;
    var selected: ?usize = null;
    for (groups.items) |group| {
        if (group.parent_node != owner) continue;
        geom.observe("source_cells", 1);
        if (found >= cells.len or group.header_node < request.table_node or group.paragraph_count == 0 or group.intervening_records != 0) return error.UnsupportedSourceTableGrid;
        const list = tree.nodes[group.header_node].record.value.list_header;
        if (list.signedCount() <= 0) return error.UnsupportedSourceTableGrid;
        const view = try list.view(request.layout);
        if (body.CellAttributes.fromList(view).isProtected()) return error.UnsupportedSourceTableGrid;
        const cell = try body.Cell.parse(view.extra);
        if (cell.extra.len != 0 or cell.width == 0 or cell.height == 0) return error.UnsupportedSourceTableGrid;
        if (cell.row_span == 0 or cell.column_span == 0 or cell.row >= table.row_count or cell.column >= table.column_count or
            cell.row_span > table.row_count - cell.row or cell.column_span > table.column_count - cell.column) return error.InvalidSourceTableGrid;
        const index = @as(usize, cell.row) * table.column_count + cell.column;
        if (previous) |prior| if (index <= prior) return error.InvalidSourceTableGrid;
        previous = index;
        for (cell.row..@as(usize, cell.row) + cell.row_span) |row| for (cell.column..@as(usize, cell.column) + cell.column_span) |column| {
            const slot = row * table.column_count + column;
            if (covered[slot]) return error.InvalidSourceTableGrid;
            covered[slot] = true;
            geom.observe("old_slots", 1);
        };
        row_cells[cell.row] += 1;
        var paragraph = group.begin;
        var first_runs: ?usize = null;
        var last_header = paragraph;
        while (paragraph < group.end) {
            const runs = try grid.validateParagraph(tree, paragraph, group.end);
            if (first_runs == null) first_runs = runs;
            last_header = paragraph;
            paragraph = tree.nodes[paragraph].subtree_end;
        }
        cells[found] = .{ .group = group, .header = group.begin, .last_header = last_header, .runs = first_runs orelse return error.UnsupportedSourceTableGrid, .value = cell };
        metadata[found] = cell;
        if (cell.row == division.row and cell.column == division.column) selected = found;
        found += 1;
    }
    for (covered) |present| if (!present) return error.InvalidSourceTableGrid;
    for (row_cells, 0..) |count, row| if (count != table.rows.get(row).?.size) return error.InvalidSourceTableGrid;
    var child = owner + 1;
    var cursor: usize = 0;
    while (child < control.subtree_end) {
        if (child == request.table_node) {
            child = marker.subtree_end;
            continue;
        }
        if (cursor >= found or cells[cursor].group.header_node != child) return error.UnsupportedSourceTableGrid;
        child = cells[cursor].group.end;
        cursor += 1;
    }
    if (cursor != found) return error.InvalidSourceTableGrid;
    const plan = try geom.create(scratch, metadata[0..found], table.row_count, table.column_count, common.width, common.height, selected orelse return error.InvalidSourceTableCellSplitTarget, division, limits.max_cells);
    if (request.new_paragraph_ids.len != requested.inserted_count) return error.InvalidTableParagraphIds;
    var ids: std.AutoHashMap(u32, void) = .init(scratch);
    for (tree.nodes) |node| {
        geom.observe("id_records", 1);
        if (node.record.value == .header) try ids.put(node.record.value.header.instance_id, {});
    }
    for (request.new_paragraph_ids) |id| if (id == 0 or (try ids.getOrPut(id)).found_existing) return error.InvalidTableParagraphIds;
    var out: std.ArrayList(u8) = .empty;
    try append(scratch, &out, source[0..marker.record.framing.offset], limits.max_bytes);
    var payload: std.ArrayList(u8) = .empty;
    try payload.appendSlice(scratch, marker.record.framing.payload[0..18]);
    std.mem.writeInt(u16, payload.items[4..6], @intCast(plan.rows), .little);
    std.mem.writeInt(u16, payload.items[6..8], @intCast(plan.columns), .little);
    for (plan.row_cells) |count| {
        var bytes: [2]u8 = undefined;
        std.mem.writeInt(u16, &bytes, count, .little);
        try payload.appendSlice(scratch, &bytes);
    }
    try payload.appendSlice(scratch, marker.record.framing.payload[18 + @as(usize, table.row_count) * 2 ..]);
    try framing.append(scratch, &out, 77, marker.record.framing.level, payload.items, limits.max_bytes);
    var fresh: usize = 0;
    for (plan.starts) |entry| {
        const cell = entry orelse continue;
        geom.observe("emitted_cells", 1);
        const template = cells[cell.template];
        const list = tree.nodes[template.group.header_node].record.framing;
        const bytes = try scratch.dupe(u8, list.payload);
        const base: usize = if (request.layout == .spec6) 6 else 8;
        std.mem.writeInt(u16, bytes[base..][0..2], @intCast(cell.column), .little);
        std.mem.writeInt(u16, bytes[base + 2 ..][0..2], @intCast(cell.row), .little);
        std.mem.writeInt(u16, bytes[base + 4 ..][0..2], @intCast(cell.column_span), .little);
        std.mem.writeInt(u16, bytes[base + 6 ..][0..2], @intCast(cell.row_span), .little);
        std.mem.writeInt(u32, bytes[base + 8 ..][0..4], cell.width, .little);
        std.mem.writeInt(u32, bytes[base + 12 ..][0..4], cell.height, .little);
        if (cell.blank) {
            const count = try @import("paragraph_list_count.zig").read(tree, template.group.header_node);
            var encoded: [4]u8 = undefined;
            const rewritten = try count.encode(&encoded, 0, count.value - 1);
            @memcpy(bytes[0..rewritten.len], rewritten);
        }
        try framing.append(scratch, &out, 72, list.level, bytes, limits.max_bytes);
        if (!cell.blank) {
            try append(scratch, &out, source[tree.nodes[template.header].record.framing.offset..recordEnd(tree, template.group.end, source.len)], limits.max_bytes);
        } else {
            const original = tree.nodes[template.header].record.framing;
            const header = try scratch.dupe(u8, original.payload);
            std.mem.writeInt(u32, header[Header.character_count_offset..][0..4], tree.nodes[template.last_header].record.value.header.chars_raw, .little);
            Header.writeTextCounts(header, 1, 1, 0);
            std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], request.new_paragraph_ids[fresh], .little);
            fresh += 1;
            try framing.append(scratch, &out, 66, original.level, header, limits.max_bytes);
            try framing.append(scratch, &out, 67, original.level + 1, &.{ 13, 0 }, limits.max_bytes);
            try framing.append(scratch, &out, 68, original.level + 1, tree.nodes[template.runs].record.framing.payload[0..8], limits.max_bytes);
        }
    }
    if (fresh != request.new_paragraph_ids.len) return error.InvalidTableParagraphIds;
    try append(scratch, &out, source[recordEnd(tree, control.subtree_end, source.len)..], limits.max_bytes);
    var verified = try @import("source_tree.zig").parse(scratch, out.items, version, .{ .max_records = limits.max_records });
    defer verified.deinit(scratch);
    var verified_groups = try @import("../body/list_groups.zig").Groups.build(scratch, verified);
    defer verified_groups.deinit(scratch);
    return a.dupe(u8, out.items);
}
