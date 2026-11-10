//! Original XML candidate only. No session, ABI, history or ZIP publication.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const Tree = tree_mod.Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
const unsigned = @import("xml_unsigned_attributes_write.zig");
const plans = @import("../model/table_grid_edit_plan.zig");
pub const Command = plans.Command;
pub const Target = union(enum) { element: usize, span: tree_mod.Span };
pub const Request = struct {
    target: Target,
    expected_rows: u32,
    expected_columns: u32,
    command: Command,
    /// Caller must inventory ALL document parts. We additionally check this section.
    fresh_paragraph_ids: []const u32 = &.{},
    max_bytes: usize = 16 * 1024 * 1024,
    max_cells: usize = 4096,
};
const Cell = struct { node: usize, addr: usize, size: usize, paragraph: usize, text: usize, width: u32, height: u32 };
const Grid = struct { rows: []usize, cells: []Cell, size: usize, width: u32, height: u32 };
fn number(a: std.mem.Allocator, t: *const Tree, node: usize, name: []const u8) !u32 {
    return try fields.optionalUnsigned(a, t, node, name, 4096) orelse error.InvalidSourceTableGrid;
}
fn child(t: *const Tree, node: usize, name: []const u8) !usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    return fields.uniqueChild(t, node, name, &missing, &duplicate) orelse error.UnsupportedSourceTableStructure;
}
fn childOptional(t: *const Tree, node: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const found = fields.uniqueChild(t, node, name, &missing, &duplicate);
    if (duplicate != 0) return error.UnsupportedSourceTableStructure;
    return found;
}
fn allowed(t: *const Tree, node: usize, names: []const []const u8) !void {
    var cursor = t.elements[node].first_child;
    while (cursor) |i| : (cursor = t.elements[i].next_sibling) {
        for (names) |name| {
            if (fields.childIs(t, i, name)) break;
        } else return error.UnsupportedSourceTableStructure;
    }
}
// Cloned shells may contain identities/references we cannot safely duplicate.
// Namespace declarations are lexical bindings and can be retained unchanged.
fn attributes(a: std.mem.Allocator, t: *const Tree, node: usize, names: []const []const u8) !void {
    const e = t.elements[node];
    const raw = t.source[e.start_tag.start..e.start_tag.end];
    var input = try @import("../xml/input.zig").Input.init(raw, .utf8, .{ .max_bytes = raw.len, .max_characters = raw.len });
    const tag = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = raw.len });
    for (tag.attributes) |attr| {
        const name = attr.name.raw;
        if (std.mem.eql(u8, name, "xmlns") or std.mem.startsWith(u8, name, "xmlns:")) continue;
        for (names) |known| {
            if (std.mem.eql(u8, name, known)) break;
        } else return error.UnsupportedSourceTableAttributes;
    }
}
fn emptyId(a: std.mem.Allocator, t: *const Tree, node: usize) !void {
    if (try t.attributeValue(a, node, "", "id")) |v| {
        const id = try v.toUtf8(a, 4096);
        if (id.len != 0) return error.UnsupportedSourceTableStructure;
    }
}
fn zero(a: std.mem.Allocator, t: *const Tree, node: usize, names: []const []const u8) !void {
    for (names) |name| if (try t.attributeValue(a, node, "", name)) |v| {
        if (try fields.unsigned(a, v, 4096) != 0) return error.ProtectedSourceTable;
    };
}
fn select(t: *const Tree, target: Target) !usize {
    switch (target) {
        .element => |i| if (i < t.elements.len and fields.childIs(t, i, "tbl")) {
            return i;
        },
        .span => |s| for (t.elements, 0..) |e, i| {
            if (e.start_tag.start == s.start and e.end == s.end and fields.childIs(t, i, "tbl")) return i;
        },
    }
    return error.InvalidSourceTableTarget;
}
const ContentCheck = struct {
    a: std.mem.Allocator,
    tree: *const Tree,
    table: usize,
    limit: usize,
    fn onContent(raw: *anyopaque, event: Tree.ContentEvent) !void {
        const self: *ContentCheck = @ptrCast(@alignCast(raw));
        const e = self.tree.elements[event.parent_index];
        const root = self.tree.elements[self.table];
        if (e.start_tag.start < root.start_tag.start or e.end > root.end or fields.childIs(self.tree, event.parent_index, "t")) return;
        const decoded = try event.value.toUtf8(self.a, self.limit);
        for (decoded) |c| if (c != ' ' and c != '\t' and c != '\r' and c != '\n') return error.UnsupportedSourceTableStructure;
    }
};
fn inspect(a: std.mem.Allocator, t: *const Tree, table: usize, rows: u32, cols: u32, limit: usize) !Grid {
    if (rows == 0 or cols == 0 or @as(u64, rows) * cols > limit) return error.LimitExceeded;
    if (try number(a, t, table, "rowCnt") != rows or try number(a, t, table, "colCnt") != cols) return error.StaleSourceTableGrid;
    var ancestor: ?usize = table;
    while (ancestor) |i| : (ancestor = t.elements[i].parent) {
        const e = t.elements[i];
        if (i != table and fields.childIs(t, i, "tbl")) return error.UnsupportedSourceTableStructure;
        if (e.name.local.equals("switch", false) or e.name.local.equals("case", false) or e.name.local.equals("default", false)) return error.UnsupportedSourceTableStructure;
        try zero(a, t, i, &.{ "lock", "protect" });
    }
    var content = ContentCheck{ .a = a, .tree = t, .table = table, .limit = t.source.len };
    try t.visitContent(a, .{ .context = &content, .on_content = ContentCheck.onContent });
    // Preserve opaque table attributes but reject unhandled geometry/children.
    try zero(a, t, table, &.{"cellSpacing"});
    try allowed(t, table, &.{ "sz", "pos", "outMargin", "inMargin", "tr" });
    var direct = t.elements[table].first_child;
    while (direct) |i| : (direct = t.elements[i].next_sibling) {
        if (!fields.childIs(t, i, "tr")) try allowed(t, i, &.{});
    }
    const size = try child(t, table, "sz");
    try zero(a, t, size, &.{"protect"});
    for ([_][]const u8{ "widthRelTo", "heightRelTo" }) |name| {
        const raw = try t.attributeValue(a, size, "", name) orelse return error.UnsupportedSourceTableGeometry;
        const value = try raw.toUtf8(a, 4096);
        if (!std.mem.eql(u8, value, "ABSOLUTE")) return error.UnsupportedSourceTableGeometry;
    }
    const rs = try a.alloc(usize, rows);
    const cells = try a.alloc(Cell, @as(usize, rows) * cols);
    var r: usize = 0;
    var cursor = t.elements[table].first_child;
    while (cursor) |row| : (cursor = t.elements[row].next_sibling) {
        if (!fields.childIs(t, row, "tr")) continue;
        if (r == rows or t.elements[row].end_tag == null) return error.InvalidSourceTableGrid;
        rs[r] = row;
        try attributes(a, t, row, &.{});
        try allowed(t, row, &.{"tc"});
        var c: usize = 0;
        var next = t.elements[row].first_child;
        while (next) |cell| : (next = t.elements[cell].next_sibling) {
            if (c == cols) return error.InvalidSourceTableGrid;
            try attributes(a, t, cell, &.{ "name", "header", "hasMargin", "protect", "editable", "dirty", "borderFillIDRef" });
            try zero(a, t, cell, &.{"protect"});
            if (try t.attributeValue(a, cell, "", "name")) |v| {
                const name = try v.toUtf8(a, 4096);
                if (name.len != 0) return error.UnsupportedSourceTableStructure;
            }
            try allowed(t, cell, &.{ "subList", "cellAddr", "cellSpan", "cellSz", "cellMargin" });
            const addr = try child(t, cell, "cellAddr");
            const span = try child(t, cell, "cellSpan");
            const sz = try child(t, cell, "cellSz");
            const sub = try child(t, cell, "subList");
            try zero(a, t, sub, &.{ "linkListIDRef", "linkListNextIDRef", "hasTextRef", "hasNumRef", "textWidth", "textHeight" });
            try allowed(t, sub, &.{"p"});
            try attributes(a, t, sub, &.{ "id", "textDirection", "lineWrap", "vertAlign", "linkListIDRef", "linkListNextIDRef", "textWidth", "textHeight", "hasTextRef", "hasNumRef" });
            try emptyId(a, t, sub);
            const p = try child(t, sub, "p");
            try attributes(a, t, p, &.{ "id", "paraPrIDRef", "styleIDRef", "pageBreak", "columnBreak", "merged" });
            try zero(a, t, p, &.{ "pageBreak", "columnBreak", "merged" });
            try allowed(t, p, &.{"run"});
            const run = try child(t, p, "run");
            try attributes(a, t, run, &.{"charPrIDRef"});
            try allowed(t, run, &.{"t"});
            const text = try child(t, run, "t");
            try attributes(a, t, text, &.{});
            try allowed(t, text, &.{});
            inline for (.{ .{ addr, &.{ "rowAddr", "colAddr" } }, .{ span, &.{ "rowSpan", "colSpan" } }, .{ sz, &.{ "width", "height" } } }) |item| {
                try attributes(a, t, item[0], item[1]);
                try allowed(t, item[0], &.{});
            }
            const margin = try childOptional(t, cell, "cellMargin");
            if (margin) |m| {
                try attributes(a, t, m, &.{ "left", "right", "top", "bottom" });
                try allowed(t, m, &.{});
            }
            if (try number(a, t, span, "colSpan") != 1 or try number(a, t, span, "rowSpan") != 1) return error.MergedSourceTable;
            if (try number(a, t, addr, "rowAddr") != r or try number(a, t, addr, "colAddr") != c) return error.InvalidSourceTableGrid;
            const w = try number(a, t, sz, "width");
            const h = try number(a, t, sz, "height");
            if (w == 0 or h == 0 or (r > 0 and w != cells[c].width) or (c > 0 and h != cells[r * cols].height)) return error.UnsupportedSourceTableGeometry;
            cells[r * cols + c] = .{ .node = cell, .addr = addr, .size = sz, .paragraph = p, .text = text, .width = w, .height = h };
            c += 1;
        }
        if (c != cols) return error.InvalidSourceTableGrid;
        r += 1;
    }
    if (r != rows) return error.InvalidSourceTableGrid;
    var width: u32 = 0;
    var height: u32 = 0;
    for (cells[0..cols]) |c| width = std.math.add(u32, width, c.width) catch return error.UnsupportedSourceTableGeometry;
    for (0..rows) |i| height = std.math.add(u32, height, cells[i * cols].height) catch return error.UnsupportedSourceTableGeometry;
    if (try number(a, t, size, "width") != width or try number(a, t, size, "height") != height) return error.UnsupportedSourceTableGeometry;
    return .{ .rows = rs, .cells = cells, .size = size, .width = width, .height = height };
}
fn patch(a: std.mem.Allocator, t: *const Tree, changes: *std.ArrayList(writer.Change), node: usize, comptime names: []const []const u8, values: [names.len]u32, limit: usize) !void {
    const s = t.elements[node].start_tag;
    try changes.append(a, .{ .start = s.start, .end = s.end, .text = "", .serialized_xml = try unsigned.write(a, t, node, names, values, limit) });
}
fn less(_: void, l: writer.Change, r: writer.Change) bool {
    return l.start < r.start;
}
fn fragment(a: std.mem.Allocator, t: *const Tree, node: usize, changes: []writer.Change, limit: usize, ordered: bool) ![]u8 {
    const e = t.elements[node];
    for (changes) |*c| {
        c.start -= e.start_tag.start;
        c.end -= e.start_tag.start;
    }
    if (!ordered) std.mem.sort(writer.Change, changes, {}, less);
    return writer.write(a, t.sourceOf(node), changes, limit);
}
fn cellXml(a: std.mem.Allocator, t: *const Tree, cell: Cell, r: u32, c: u32, fresh: ?u32, limit: usize) ![]u8 {
    var changes: std.ArrayList(writer.Change) = .empty;
    try patch(a, t, &changes, cell.addr, &.{ "rowAddr", "colAddr" }, .{ r, c }, limit);
    if (fresh) |id| {
        try patch(a, t, &changes, cell.paragraph, &.{"id"}, .{id}, limit);
        const text = t.elements[cell.text];
        if (text.end_tag) |end| try changes.append(a, .{ .start = text.start_tag.end, .end = end.start, .text = "", .serialized_xml = "" });
    }
    return fragment(a, t, cell.node, changes.items, limit, false);
}
/// Source borrowed; caller owns successful bytes. Arena isolates all preparation
/// allocations; validation completes before the final owned copy is returned.
pub fn prepare(allocator: std.mem.Allocator, source: []const u8, request: Request) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var t = try @import("section_tree.zig").parse(a, source, 0, 0, .{ .max_xml_bytes = request.max_bytes });
    const table = try select(&t, request.target);
    try @import("field_free_section.zig").validate(a, &t, request.max_bytes);
    const rows = request.expected_rows;
    const cols = request.expected_columns;
    if (t.elements[table].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const g = try inspect(a, &t, table, rows, cols, request.max_cells);
    const row_edit = switch (request.command) {
        .insert_row, .delete_row => true,
        else => false,
    };
    const insertion = switch (request.command) {
        .insert_row, .insert_column => true,
        else => false,
    };
    const index = switch (request.command) {
        inline else => |v| v,
    };
    const dimension = if (row_edit) rows else cols;
    if (index > dimension or (!insertion and index == dimension)) return error.InvalidSourceTableCommand;
    if (!insertion and dimension == 1) return error.LastSourceTableDimension;
    const plan = try plans.create(rows, cols, request.command, request.max_cells);
    const nr = plan.rows;
    const nc = plan.columns;
    if (request.fresh_paragraph_ids.len != plan.inserted_count) return error.InvalidTableParagraphIds;
    var ids: std.AutoHashMap(u32, void) = .init(a);
    for (t.elements, 0..) |_, i| if (fields.childIs(&t, i, "p")) {
        const id = try number(a, &t, i, "id");
        if ((try ids.getOrPut(id)).found_existing) return error.InvalidTableParagraphIds;
    };
    for (request.fresh_paragraph_ids) |id| if (id == 0 or (try ids.getOrPut(id)).found_existing) {
        return error.InvalidTableParagraphIds;
    };
    const neighbor = if (insertion) index - @intFromBool(index != 0) else index;
    const delta = if (row_edit) g.cells[@as(usize, neighbor) * cols].height else g.cells[neighbor].width;
    const total = if (row_edit) g.height else g.width;
    const changed = if (insertion) std.math.add(u32, total, delta) catch return error.UnsupportedSourceTableGeometry else total - delta;
    var changes: std.ArrayList(writer.Change) = .empty;
    try patch(a, &t, &changes, table, &.{ "rowCnt", "colCnt" }, .{ nr, nc }, request.max_bytes);
    try patch(a, &t, &changes, g.size, &.{ "width", "height" }, .{ if (row_edit) g.width else changed, if (row_edit) changed else g.height }, request.max_bytes);
    var fresh_index: usize = 0;
    var output_rows: std.ArrayList([]u8) = .empty;
    for (0..nr) |r| {
        const sr = (try plan.templateIndex(@intCast(r), 0)) / cols;
        const row = g.rows[sr];
        var row_changes: std.ArrayList(writer.Change) = .empty;
        var cell_bytes: std.ArrayList(u8) = .empty;
        for (0..nc) |c| {
            const new_cell = (try plan.sourceIndex(@intCast(r), @intCast(c))) == null;
            const source_cell = try plan.templateIndex(@intCast(r), @intCast(c));
            const id: ?u32 = if (new_cell) request.fresh_paragraph_ids[fresh_index] else null;
            if (new_cell) fresh_index += 1;
            const bytes = try cellXml(a, &t, g.cells[source_cell], @intCast(r), @intCast(c), id, request.max_bytes);
            try cell_bytes.appendSlice(a, bytes);
        }
        // Replace each original cell separately: row whitespace/comments survive.
        // Inserted/deleted columns use the first cell slot as an ordered carrier.
        for (0..cols) |c| {
            const e = t.elements[g.cells[sr * cols + c].node];
            try row_changes.append(a, .{ .start = e.start_tag.start, .end = e.end, .text = "", .serialized_xml = if (c == 0) cell_bytes.items else "" });
        }
        try output_rows.append(a, try fragment(a, &t, row, row_changes.items, request.max_bytes, true));
    }
    // Preserve gaps between original rows by binding each destination to its
    // source row; an inserted row is carried alongside the nearest source row.
    var destination: usize = 0;
    for (g.rows, 0..) |row, r| {
        var bytes: std.ArrayList(u8) = .empty;
        // Source row mapping is monotone. Each output row is consumed once.
        while (destination < output_rows.items.len) {
            const sr = (try plan.templateIndex(@intCast(destination), 0)) / cols;
            if (sr < r) return error.InvalidSourceTableGrid;
            if (sr != r) break;
            try bytes.appendSlice(a, output_rows.items[destination]);
            destination += 1;
        }
        const e = t.elements[row];
        try changes.append(a, .{ .start = e.start_tag.start, .end = e.end, .text = "", .serialized_xml = bytes.items });
    }
    if (destination != output_rows.items.len) return error.InvalidSourceTableGrid;
    // Only two attribute replacements need sorting. Merge them into the
    // already source-ordered row spans instead of sorting all rows/cells.
    std.mem.sort(writer.Change, changes.items[0..2], {}, less);
    var ordered: std.ArrayList(writer.Change) = .empty;
    var attribute: usize = 0;
    for (changes.items[2..]) |row| {
        while (attribute < 2 and changes.items[attribute].start < row.start) : (attribute += 1)
            try ordered.append(a, changes.items[attribute]);
        try ordered.append(a, row);
    }
    while (attribute < 2) : (attribute += 1) try ordered.append(a, changes.items[attribute]);
    const result = try writer.write(a, source, ordered.items, request.max_bytes);
    var check = try @import("section_tree.zig").parse(a, result, 0, 0, .{ .max_xml_bytes = request.max_bytes });
    _ = try inspect(a, &check, table, nr, nc, request.max_cells);
    return allocator.dupe(u8, result);
}
