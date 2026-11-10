//! Private source-section candidate for regular unmerged plain tables.
//! This is not a Session command. Caller owns document-wide IDs, reflow and commit.
const std = @import("std");
const Version = @import("../version.zig").Version;
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const framing = @import("../record_writer.zig");
const mapping = @import("../../model/table_grid_edit_plan.zig");
const Header = body.Header;
pub const Request = struct {
    table_node: usize,
    expected_rows: u32,
    expected_columns: u32,
    command: mapping.Command,
    /// Explicit schema selection. Never inferred from record length/version.
    layout: body.list_header.Layout,
    new_paragraph_ids: []const u32 = &.{},
};
pub const Limits = struct { max_bytes: usize = 64 * 1024 * 1024, max_records: usize = 1_000_000, max_cells: usize = 100_000 };
const Cell = struct { group: @import("../body/list_groups.zig").Group, header: usize, runs: usize, value: body.Cell };

/// Source is immutable on all failures. Returned bytes are allocator-owned.
pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, request: Request, limits: Limits) ![]u8 {
    if (source.len > limits.max_bytes) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var tree = try @import("source_tree.zig").parse(scratch, source, version, .{ .max_records = limits.max_records });
    defer tree.deinit(scratch);
    if (request.table_node >= tree.nodes.len or tree.nodes[request.table_node].record.value != .table) return error.InvalidSourceTableGridTarget;
    const marker = tree.nodes[request.table_node];
    const table = marker.record.value.table;
    if (table.row_count != request.expected_rows or table.column_count != request.expected_columns) return error.SourceBindingMismatch;
    const plan = try mapping.create(table.row_count, table.column_count, request.command, limits.max_cells);
    if (plan.rows > 65535 or plan.columns > 65535) return error.LimitExceeded;
    if (table.extra.len != 0 or (table.zones != null and table.zones.?.count() != 0)) return error.UnsupportedSourceTableGrid;
    const owner = marker.parent orelse return error.InvalidSourceTableGridTarget;
    const control = tree.nodes[owner];
    if (control.record.value != .control_header or control.record.value.control_header.id != @import("../body/control_rules.zig").table_id) return error.InvalidSourceTableGridTarget;
    const host = control.parent orelse return error.InvalidSourceTableGridTarget;
    if (tree.nodes[host].parent != null) return error.UnsupportedSourceTableGrid;
    const common = try body.object_common.parseControl(control.record.value.control_header);
    if (!body.object_common.hasAbsoluteDimensions(common.flags) or common.width == 0 or common.height == 0) return error.UnsupportedSourceTableGrid;
    var groups = try @import("../body/list_groups.zig").Groups.build(scratch, tree);
    defer groups.deinit(scratch);
    const old_count = @as(usize, table.row_count) * table.column_count;
    const cells = try scratch.alloc(Cell, old_count);
    const present = try scratch.alloc(bool, old_count);
    @memset(present, false);
    var found: usize = 0;
    for (groups.items) |group| {
        if (group.parent_node != owner) continue;
        if (group.header_node < request.table_node or group.paragraph_count != 1 or group.intervening_records != 0) return error.UnsupportedSourceTableGrid;
        const list = tree.nodes[group.header_node].record.value.list_header;
        const view = try list.view(request.layout);
        // Refuse the whole edit before cloning templates or deleting any cell.
        if (body.CellAttributes.fromList(view).isProtected()) return error.UnsupportedSourceTableGrid;
        const cell = try body.Cell.parse(view.extra);
        if (cell.extra.len != 0 or cell.row_span != 1 or cell.column_span != 1 or cell.row >= table.row_count or cell.column >= table.column_count) return error.UnsupportedSourceTableGrid;
        if (cell.width == 0 or cell.height == 0) return error.UnsupportedSourceTableGrid;
        const index = @as(usize, cell.row) * table.column_count + cell.column;
        if (index != found) return error.UnsupportedSourceTableGrid;
        if (present[index]) return error.InvalidSourceTableGrid;
        present[index] = true;
        const header_index = group.begin;
        if (header_index >= group.end or tree.nodes[header_index].record.value != .header or tree.nodes[header_index].subtree_end != group.end) return error.UnsupportedSourceTableGrid;
        const header = tree.nodes[header_index].record.value.header;
        if ((header.merge_tracking orelse 0) != 0) return error.UnsupportedSourceTableGrid;
        if (header.control_mask != 0 or header.break_flags != 0 or header.range_tag_count != 0 or header.line_segment_count != 0 or header.extra.len != 0) return error.UnsupportedSourceTableGrid;
        var runs: ?usize = null;
        var text: ?usize = null;
        var child = header_index + 1;
        while (child < group.end) : (child = tree.nodes[child].subtree_end) {
            switch (tree.nodes[child].record.value) {
                .char_runs => {
                    if (runs != null) return error.UnsupportedSourceTableGrid;
                    runs = child;
                },
                .text => {
                    if (text != null) return error.UnsupportedSourceTableGrid;
                    text = child;
                },
                else => return error.UnsupportedSourceTableGrid,
            }
        }
        const text_bytes = tree.nodes[text orelse return error.UnsupportedSourceTableGrid].record.framing.payload;
        try @import("plain_text_content.zig").validatePlain(text_bytes);
        if (header.characterUnits() != text_bytes.len / 2) return error.SourceBindingMismatch;
        const run_index = runs orelse return error.UnsupportedSourceTableGrid;
        const run_bytes = tree.nodes[run_index].record.framing.payload;
        if (run_bytes.len < 8 or run_bytes.len % 8 != 0 or header.char_shape_count != run_bytes.len / 8 or std.mem.readInt(u32, run_bytes[0..4], .little) != 0) return error.UnsupportedSourceTableGrid;
        cells[index] = .{ .group = group, .header = header_index, .runs = run_index, .value = cell };
        found += 1;
    }
    if (found != old_count) return error.InvalidSourceTableGrid;
    var old_width: u32 = 0;
    var old_height: u32 = 0;
    for (0..table.column_count) |c| old_width = try std.math.add(u32, old_width, cells[c].value.width);
    for (0..table.row_count) |r| old_height = try std.math.add(u32, old_height, cells[r * table.column_count].value.height);
    if (old_width != common.width or old_height != common.height or table.cell_spacing != 0) return error.UnsupportedSourceTableGrid;
    for (cells, 0..) |cell, i| {
        if (cell.value.width != cells[i % table.column_count].value.width or
            cell.value.height != cells[(i / table.column_count) * table.column_count].value.height) return error.UnsupportedSourceTableGrid;
    }
    var width: u32 = 0;
    var height: u32 = 0;
    for (0..plan.columns) |c| width = try std.math.add(u32, width, cells[try plan.templateIndex(0, @intCast(c))].value.width);
    for (0..plan.rows) |r| height = try std.math.add(u32, height, cells[try plan.templateIndex(@intCast(r), 0)].value.height);

    for (0..table.rows.count()) |i| if (table.rows.get(i).?.size != table.column_count) return error.UnsupportedSourceTableGrid;
    // No caption/unknown direct siblings are silently discarded during rebuilding.
    var child = owner + 1;
    var cell_cursor: usize = 0;
    while (child < control.subtree_end) {
        if (child == request.table_node) {
            child = tree.nodes[child].subtree_end;
            continue;
        }
        if (cell_cursor >= old_count or cells[cell_cursor].group.header_node != child) return error.UnsupportedSourceTableGrid;
        child = cells[cell_cursor].group.end;
        cell_cursor += 1;
    }
    if (cell_cursor != old_count) return error.InvalidSourceTableGrid;
    if (request.new_paragraph_ids.len != plan.inserted_count) return error.InvalidTableParagraphIds;
    var ids: std.AutoHashMap(u32, void) = .init(scratch);
    defer ids.deinit();
    for (tree.nodes) |node| if (node.record.value == .header) {
        try ids.put(node.record.value.header.instance_id, {});
    };
    for (request.new_paragraph_ids) |id| {
        if (id == 0 or (try ids.getOrPut(id)).found_existing) return error.InvalidTableParagraphIds;
    }
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(scratch);
    try append(scratch, &out, source[0..control.record.framing.offset], limits.max_bytes);
    const ctrl = try scratch.dupe(u8, control.record.framing.payload);
    std.mem.writeInt(u32, ctrl[4 + common.size_offset ..][0..4], width, .little);
    std.mem.writeInt(u32, ctrl[8 + common.size_offset ..][0..4], height, .little);
    try framing.append(scratch, &out, 71, control.record.framing.level, ctrl, limits.max_bytes);
    var payload: std.ArrayList(u8) = .empty;
    defer payload.deinit(scratch);
    try payload.appendSlice(scratch, marker.record.framing.payload[0..18]);
    std.mem.writeInt(u16, payload.items[4..6], @intCast(plan.rows), .little);
    std.mem.writeInt(u16, payload.items[6..8], @intCast(plan.columns), .little);
    var row_bytes: [2]u8 = undefined;
    std.mem.writeInt(u16, &row_bytes, @intCast(plan.columns), .little);
    for (0..plan.rows) |_| try payload.appendSlice(scratch, &row_bytes);
    try payload.appendSlice(scratch, marker.record.framing.payload[18 + @as(usize, table.row_count) * 2 ..]);
    try framing.append(scratch, &out, 77, marker.record.framing.level, payload.items, limits.max_bytes);
    var fresh: usize = 0;
    for (0..plan.rows) |row| for (0..plan.columns) |column| {
        const r: u32 = @intCast(row);
        const c: u32 = @intCast(column);
        const prior = try plan.sourceIndex(r, c);
        const template = cells[try plan.templateIndex(r, c)];
        const list_record = tree.nodes[template.group.header_node].record.framing;
        const list_bytes = try scratch.dupe(u8, list_record.payload);
        const base: usize = if (request.layout == .spec6) 6 else 8;
        std.mem.writeInt(u16, list_bytes[base..][0..2], @intCast(c), .little);
        std.mem.writeInt(u16, list_bytes[base + 2 ..][0..2], @intCast(r), .little);
        try framing.append(scratch, &out, 72, list_record.level, list_bytes, limits.max_bytes);
        if (prior != null) {
            const start = tree.nodes[template.header].record.framing.offset;
            const end = recordEnd(tree, template.group.end, source.len);
            try append(scratch, &out, source[start..end], limits.max_bytes);
        } else {
            const header_record = tree.nodes[template.header].record.framing;
            const header = try scratch.dupe(u8, header_record.payload);
            Header.writeTextCounts(header, 1, 1, 0);
            std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], request.new_paragraph_ids[fresh], .little);
            fresh += 1;
            try framing.append(scratch, &out, 66, header_record.level, header, limits.max_bytes);
            try framing.append(scratch, &out, 67, header_record.level + 1, &.{ 13, 0 }, limits.max_bytes);
            try framing.append(scratch, &out, 68, header_record.level + 1, tree.nodes[template.runs].record.framing.payload[0..8], limits.max_bytes);
        }
    };
    try append(scratch, &out, source[recordEnd(tree, control.subtree_end, source.len)..], limits.max_bytes);
    var verified = try @import("source_tree.zig").parse(scratch, out.items, version, .{ .max_records = limits.max_records });
    defer verified.deinit(scratch);
    var verified_groups = try @import("../body/list_groups.zig").Groups.build(scratch, verified);
    defer verified_groups.deinit(scratch);
    return a.dupe(u8, out.items);
}
fn recordEnd(tree: Tree, index: usize, length: usize) usize {
    return if (index == tree.nodes.len) length else tree.nodes[index].record.framing.offset;
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
