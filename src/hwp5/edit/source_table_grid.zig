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
    command: ?mapping.Command = null,
    split: ?@import("source_table_cell_split.zig").Request = null,
    /// Explicit schema selection. Never inferred from record length/version.
    layout: body.list_header.Layout,
    new_paragraph_ids: []const u32 = &.{},
};
pub const Limits = struct { max_bytes: usize = 64 * 1024 * 1024, max_records: usize = 1_000_000, max_cells: usize = 100_000 };
pub const Cell = struct { group: @import("../body/list_groups.zig").Group, header: usize, last_header: usize, runs: usize, value: body.Cell };
const CaptionGroup = struct { header: usize, end: usize };

/// Source is immutable on all failures. Returned bytes are allocator-owned.
pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, request: Request, limits: Limits) ![]u8 {
    if (request.split != null) return @import("source_table_cell_split_writer.zig").prepare(a, source, version, request, limits);
    const command = request.command orelse return error.InvalidSourceTableGridOperation;
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
    const plan = try mapping.create(table.row_count, table.column_count, command, limits.max_cells);
    if (plan.rows > 65535 or plan.columns > 65535) return error.LimitExceeded;
    if (table.extra.len != 0 or (table.zones != null and table.zones.?.count() != 0)) return error.UnsupportedSourceTableGrid;
    const owner = marker.parent orelse return error.InvalidSourceTableGridTarget;
    const control = tree.nodes[owner];
    if (control.record.value != .control_header or control.record.value.control_header.id != @import("../body/control_rules.zig").table_id) return error.InvalidSourceTableGridTarget;
    const host = control.parent orelse return error.InvalidSourceTableGridTarget;
    const common = try body.object_common.parseControl(control.record.value.control_header);
    if (!body.object_common.hasAbsoluteDimensions(common.flags) or common.width == 0 or common.height == 0) return error.UnsupportedSourceTableGrid;
    var groups = try @import("../body/list_groups.zig").Groups.build(scratch, tree);
    defer groups.deinit(scratch);
    var lists: @import("../body/table_list_index.zig").Index = .{ .tree = tree };
    defer lists.deinit(scratch);
    var caption: ?CaptionGroup = null;
    const old_count = @as(usize, table.row_count) * table.column_count;
    const cells_buffer = try scratch.alloc(Cell, old_count);
    const present = try scratch.alloc(bool, old_count);
    @memset(present, false);
    var found: usize = 0;
    for (groups.items) |group| {
        if (group.parent_node != owner) continue;
        const role = try lists.get(scratch, owner, group.header_node);
        if (role.table_node != request.table_node) return error.UnsupportedSourceTableGrid;
        if (role.kind == .caption) {
            if (caption != null) return error.UnsupportedSourceTableGrid;
            caption = try validateCaptionGroup(tree, group, request.table_node, request.layout);
            continue;
        }
        if (group.header_node < request.table_node or group.paragraph_count == 0 or group.intervening_records != 0) return error.UnsupportedSourceTableGrid;
        const list = tree.nodes[group.header_node].record.value.list_header;
        // The source-grid writer supports only positive official INT16 counts.
        // The shared parser/Groups retain their wider raw preservation policy.
        if (list.signedCount() <= 0) return error.UnsupportedSourceTableGrid;
        const view = try list.view(request.layout);
        // Refuse the whole edit before cloning templates or deleting any cell.
        if (body.CellAttributes.fromList(view).isProtected()) return error.UnsupportedSourceTableGrid;
        const cell = try body.Cell.parse(view.extra);
        if (cell.extra.len != 0 or cell.row_span == 0 or cell.column_span == 0 or cell.row >= table.row_count or cell.column >= table.column_count) return error.UnsupportedSourceTableGrid;
        if (cell.width == 0 or cell.height == 0) return error.UnsupportedSourceTableGrid;
        const index = @as(usize, cell.row) * table.column_count + cell.column;
        if (found != 0) {
            const previous = cells_buffer[found - 1].value;
            if (index <= @as(usize, previous.row) * table.column_count + previous.column) return error.UnsupportedSourceTableGrid;
        }
        if (present[index]) return error.InvalidSourceTableGrid;
        present[index] = true;
        var paragraph = group.begin;
        var first_runs: ?usize = null;
        var last_header = paragraph;
        while (paragraph < group.end) {
            const runs = try validateParagraph(tree, paragraph, group.end);
            if (first_runs == null) first_runs = runs;
            last_header = paragraph;
            paragraph = tree.nodes[paragraph].subtree_end;
        }
        cells_buffer[found] = .{ .group = group, .header = group.begin, .last_header = last_header, .runs = first_runs orelse return error.UnsupportedSourceTableGrid, .value = cell };
        found += 1;
    }
    const cells = cells_buffer[0..found];
    if (common.hasCaption() != (caption != null)) return error.UnsupportedSourceTableGrid;
    try validateAncestors(tree, groups.items, host, request.layout);
    const spans = @import("../../model/source_table_span_grid.zig");
    const input = try scratch.alloc(spans.Cell, cells.len);
    for (cells, 0..) |c, i| input[i] = .{ .row = c.value.row, .column = c.value.column, .row_span = c.value.row_span, .column_span = c.value.column_span, .width = c.value.width, .height = c.value.height };
    const shape = spans.prepare(scratch, table.row_count, table.column_count, input, common.width, common.height, command, limits.max_cells) catch |err| return switch (err) {
        error.InvalidSourceSpanGrid, error.UnsupportedSourceSpanGeometry, error.ConflictingSourceTableTracks => error.UnsupportedSourceTableGrid,
        else => err,
    };
    if (table.cell_spacing != 0) return error.UnsupportedSourceTableGrid;
    var row_cursor: usize = 0;
    for (0..table.rows.count()) |r| {
        var count: usize = 0;
        while (row_cursor < cells.len and cells[row_cursor].value.row == r) : (row_cursor += 1) count += 1;
        if (table.rows.get(r).?.size != count) return error.UnsupportedSourceTableGrid;
    }
    if (row_cursor != cells.len) return error.UnsupportedSourceTableGrid;
    // Every direct sibling belongs to the proven caption, TABLE or cell groups.
    var child = owner + 1;
    var cell_cursor: usize = 0;
    while (child < control.subtree_end) {
        if (caption) |owned| if (child == owned.header) {
            child = owned.end;
            continue;
        };
        if (child == request.table_node) {
            child = tree.nodes[child].subtree_end;
            continue;
        }
        if (cell_cursor >= cells.len or cells[cell_cursor].group.header_node != child) return error.UnsupportedSourceTableGrid;
        child = cells[cell_cursor].group.end;
        cell_cursor += 1;
    }
    if (cell_cursor != cells.len) return error.InvalidSourceTableGrid;
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
    std.mem.writeInt(u32, ctrl[4 + common.size_offset ..][0..4], shape.width, .little);
    std.mem.writeInt(u32, ctrl[8 + common.size_offset ..][0..4], shape.height, .little);
    try framing.append(scratch, &out, 71, control.record.framing.level, ctrl, limits.max_bytes);
    // The typed caption lives before TABLE even when its displayed side is BOTTOM.
    // Preserve its complete source span and physical sibling order, not its text alone.
    try append(scratch, &out, source[recordEnd(tree, owner + 1, source.len)..marker.record.framing.offset], limits.max_bytes);
    var payload: std.ArrayList(u8) = .empty;
    defer payload.deinit(scratch);
    try payload.appendSlice(scratch, marker.record.framing.payload[0..18]);
    std.mem.writeInt(u16, payload.items[4..6], @intCast(plan.rows), .little);
    std.mem.writeInt(u16, payload.items[6..8], @intCast(plan.columns), .little);
    var row_bytes: [2]u8 = undefined;
    var output_cursor: usize = 0;
    for (0..shape.rows) |r| {
        var count: u16 = 0;
        while (output_cursor < shape.cells.len and shape.cells[output_cursor].cell.row == r) : (output_cursor += 1) count += 1;
        std.mem.writeInt(u16, &row_bytes, count, .little);
        try payload.appendSlice(scratch, &row_bytes);
    }
    try payload.appendSlice(scratch, marker.record.framing.payload[18 + @as(usize, table.row_count) * 2 ..]);
    try framing.append(scratch, &out, 77, marker.record.framing.level, payload.items, limits.max_bytes);
    var fresh: usize = 0;
    for (shape.cells) |output| {
        const value = output.cell;
        const prior: ?usize = if (output.fresh) null else output.source;
        const template = cells[output.source];
        const list_record = tree.nodes[template.group.header_node].record.framing;
        const list_bytes = try scratch.dupe(u8, list_record.payload);
        const base: usize = if (request.layout == .spec6) 6 else 8;
        std.mem.writeInt(u16, list_bytes[base..][0..2], @intCast(value.column), .little);
        std.mem.writeInt(u16, list_bytes[base + 2 ..][0..2], @intCast(value.row), .little);
        std.mem.writeInt(u16, list_bytes[base + 4 ..][0..2], @intCast(value.column_span), .little);
        std.mem.writeInt(u16, list_bytes[base + 6 ..][0..2], @intCast(value.row_span), .little);
        std.mem.writeInt(u32, list_bytes[base + 8 ..][0..4], value.width, .little);
        std.mem.writeInt(u32, list_bytes[base + 12 ..][0..4], value.height, .little);
        if (prior == null) {
            const count = try @import("paragraph_list_count.zig").read(tree, template.group.header_node);
            var encoded: [4]u8 = undefined;
            const bytes = try count.encode(&encoded, 0, count.value - 1);
            @memcpy(list_bytes[0..bytes.len], bytes);
        }
        try framing.append(scratch, &out, 72, list_record.level, list_bytes, limits.max_bytes);
        if (prior != null) {
            const start = tree.nodes[template.header].record.framing.offset;
            const end = recordEnd(tree, template.group.end, source.len);
            try append(scratch, &out, source[start..end], limits.max_bytes);
        } else {
            const header_record = tree.nodes[template.header].record.framing;
            const header = try scratch.dupe(u8, header_record.payload);
            // Keep first-paragraph formatting; inherit only the opaque count high
            // bit from the final template header. This is a template policy,
            // not a new interpretation of that bit in the official specification.
            const last = tree.nodes[template.last_header].record.value.header;
            std.mem.writeInt(u32, header[Header.character_count_offset..][0..4], last.chars_raw, .little);
            Header.writeTextCounts(header, 1, 1, 0);
            std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], request.new_paragraph_ids[fresh], .little);
            fresh += 1;
            try framing.append(scratch, &out, 66, header_record.level, header, limits.max_bytes);
            try framing.append(scratch, &out, 67, header_record.level + 1, &.{ 13, 0 }, limits.max_bytes);
            try framing.append(scratch, &out, 68, header_record.level + 1, tree.nodes[template.runs].record.framing.payload[0..8], limits.max_bytes);
        }
    }
    try append(scratch, &out, source[recordEnd(tree, control.subtree_end, source.len)..], limits.max_bytes);
    var verified = try @import("source_tree.zig").parse(scratch, out.items, version, .{ .max_records = limits.max_records });
    defer verified.deinit(scratch);
    var verified_groups = try @import("../body/list_groups.zig").Groups.build(scratch, verified);
    defer verified_groups.deinit(scratch);
    return a.dupe(u8, out.items);
}
fn validateCaptionGroup(tree: Tree, group: @import("../body/list_groups.zig").Group, table: usize, layout: body.list_header.Layout) !CaptionGroup {
    const list = tree.nodes[group.header_node].record.value.list_header;
    if (group.memo != null or list.signedCount() <= 0 or group.paragraph_count == 0 or group.header_node >= table or group.begin >= table or group.intervening_records != 1) return error.UnsupportedSourceTableGrid;
    const view = try list.view(layout);
    if ((view.unknown orelse 0) != 0 or (view.attributes & ~@as(u32, 0x7f)) != 0 or view.direction() > 2 or view.wrapping() > 2 or view.alignment() > 2) return error.UnsupportedSourceTableGrid;
    const value = try body.Caption.parse(view.extra);
    if (value.extra.len != 0 or (value.flags & ~@as(u32, 7)) != 0) return error.UnsupportedSourceTableGrid;
    var paragraph = group.begin;
    var count: usize = 0;
    while (paragraph < table) {
        _ = try validateParagraph(tree, paragraph, table);
        paragraph = tree.nodes[paragraph].subtree_end;
        count += 1;
    }
    if (paragraph != table or count != group.paragraph_count) return error.UnsupportedSourceTableGrid;
    return .{ .header = group.header_node, .end = table };
}
fn validateAncestors(tree: Tree, groups: []const @import("../body/list_groups.zig").Group, selected: usize, layout: body.list_header.Layout) !void {
    var host = selected;
    var depth: usize = 0;
    while (tree.nodes[host].parent) |owner| {
        depth += 1;
        if (depth > 64) return error.LimitExceeded;
        const control = tree.nodes[owner];
        if (control.record.value != .control_header or control.record.value.control_header.id != @import("../body/control_rules.zig").table_id) return error.UnsupportedSourceTableGrid;
        var found: ?usize = null;
        for (groups) |group| if (group.parent_node == owner and host >= group.begin and host < group.end) {
            if (found != null) return error.UnsupportedSourceTableGrid;
            found = group.header_node;
        };
        const list = tree.nodes[found orelse return error.UnsupportedSourceTableGrid].record.value.list_header;
        if (list.signedCount() <= 0) return error.UnsupportedSourceTableGrid;
        const view = try list.view(layout);
        if (body.CellAttributes.fromList(view).isProtected()) return error.UnsupportedSourceTableGrid;
        const cell = try body.Cell.parse(view.extra);
        if (cell.extra.len != 0 or cell.row_span == 0 or cell.column_span == 0) return error.UnsupportedSourceTableGrid;
        host = control.parent orelse return error.UnsupportedSourceTableGrid;
        if (tree.nodes[host].record.value != .header) return error.UnsupportedSourceTableGrid;
    }
}

fn recordEnd(tree: Tree, index: usize, length: usize) usize {
    return if (index == tree.nodes.len) length else tree.nodes[index].record.framing.offset;
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}

/// Validate every direct paragraph once, including paragraphs later discarded.
/// Only leaf plain-text/style records belong to this deliberately narrow editor.
pub fn validateParagraph(tree: Tree, index: usize, end: usize) !usize {
    const node = tree.nodes[index];
    if (node.record.value != .header or node.subtree_end > end) return error.UnsupportedSourceTableGrid;
    const header = node.record.value.header;
    if ((header.merge_tracking orelse 0) != 0 or header.control_mask != 0 or header.break_flags != 0 or header.range_tag_count != 0 or header.line_segment_count != 0 or header.extra.len != 0) return error.UnsupportedSourceTableGrid;
    var runs: ?usize = null;
    var text: ?usize = null;
    var child = index + 1;
    while (child < node.subtree_end) : (child = tree.nodes[child].subtree_end) {
        const entry = tree.nodes[child];
        if (entry.parent != index or entry.subtree_end != child + 1) return error.UnsupportedSourceTableGrid;
        switch (entry.record.value) {
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
    const run_index = runs orelse return error.UnsupportedSourceTableGrid;
    const rows = tree.nodes[run_index].record.value.char_runs;
    if (rows.count() == 0 or header.char_shape_count != rows.count()) return error.UnsupportedSourceTableGrid;
    const text_bytes = if (text) |t| tree.nodes[t].record.framing.payload else &.{};
    // Local source-grid eligibility for the spec's zero-character paragraph.
    // Never synthesize a terminator into surviving source records, nor allow a
    // run at position 1 by treating an implicit break as a real source unit.
    if (header.characterUnits() == 0 and text_bytes.len == 0) {
        if (rows.count() != 1 or rows.get(0).?.start != 0) return error.UnsupportedSourceTableGrid;
        return run_index;
    }
    if (text == null) return error.UnsupportedSourceTableGrid;
    const plain = @import("plain_text_content.zig");
    try plain.validatePlain(text_bytes);
    if (header.characterUnits() != text_bytes.len / 2) return error.SourceBindingMismatch;
    var previous: u32 = 0;
    for (0..rows.count()) |i| {
        const run = rows.get(i).?;
        if ((i == 0 and run.start != 0) or (i > 0 and run.start <= previous)) return error.UnsupportedSourceTableGrid;
        try plain.boundary(text_bytes, run.start);
        previous = run.start;
    }
    return run_index;
}
