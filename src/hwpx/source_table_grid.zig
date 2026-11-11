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
const Cell = struct { node: usize, addr: usize, span: usize, size: usize, list: usize, paragraph: usize, blank_spans: []const tree_mod.Span, width: u32, height: u32 };
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
    return inspectAttributes(a, t, node, names, false);
}
fn rejectLocalNamespaces(a: std.mem.Allocator, t: *const Tree, node: usize) !void {
    return inspectAttributes(a, t, node, null, true);
}
fn inspectAttributes(a: std.mem.Allocator, t: *const Tree, node: usize, names: ?[]const []const u8, forbid_namespace: bool) !void {
    const e = t.elements[node];
    const raw = t.source[e.start_tag.start..e.start_tag.end];
    var input = try @import("../xml/input.zig").Input.init(raw, .utf8, .{ .max_bytes = raw.len, .max_characters = raw.len });
    const tag = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = raw.len });
    for (tag.attributes) |attr| {
        const name = attr.name.raw;
        if (std.mem.eql(u8, name, "xmlns") or std.mem.startsWith(u8, name, "xmlns:")) {
            if (forbid_namespace) return error.UnsupportedSourceTableAttributes;
            continue;
        }
        for (names orelse continue) |known| {
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
// Each paragraph is checked once through direct sibling links. Only the first
// paragraph contributes t-body blanks; later paragraphs contribute whole spans.
fn inspectParagraph(a: std.mem.Allocator, t: *const Tree, p: usize, blanks: ?*std.ArrayList(tree_mod.Span), merging: bool) !void {
    try attributes(a, t, p, &.{ "id", "paraPrIDRef", "styleIDRef", "pageBreak", "columnBreak", "merged" });
    try zero(a, t, p, &.{ "pageBreak", "columnBreak", "merged" });
    try allowed(t, p, &.{"run"});
    // Direct plain runs only. Empty runs are valid formatting shells,
    // including those preserved by an earlier blank-cell insertion.
    if (t.elements[p].first_child == null) return error.UnsupportedSourceTableStructure;
    var runs = t.elements[p].first_child;
    while (runs) |run| : (runs = t.elements[run].next_sibling) {
        try attributes(a, t, run, &.{"charPrIDRef"});
        try allowed(t, run, &.{"t"});
        var next_text = t.elements[run].first_child;
        while (next_text) |text| : (next_text = t.elements[text].next_sibling) {
            try attributes(a, t, text, &.{});
            if (merging) {
                try allowed(t, text, &.{ "tab", "fwSpace", "nbSpace", "lineBreak", "hypen" });
                var control = t.elements[text].first_child;
                while (control) |i| : (control = t.elements[i].next_sibling) {
                    try attributes(a, t, i, if (fields.childIs(t, i, "tab")) &.{ "width", "leader", "type" } else &.{});
                    try allowed(t, i, &.{});
                }
            } else try allowed(t, text, &.{});
            const e = t.elements[text];
            if (blanks) |spans| {
                if (e.end_tag) |end| try spans.append(a, .{ .start = e.start_tag.end, .end = end.start });
            }
        }
    }
}
const Paragraphs = struct { first: usize, blanks: []const tree_mod.Span };
fn inspectParagraphs(a: std.mem.Allocator, t: *const Tree, sub: usize, merging: bool) !Paragraphs {
    const first = t.elements[sub].first_child orelse return error.UnsupportedSourceTableStructure;
    var blanks: std.ArrayList(tree_mod.Span) = .empty;
    var cursor: ?usize = first;
    while (cursor) |p| : (cursor = t.elements[p].next_sibling) {
        try inspectParagraph(a, t, p, if (!merging and p == first) &blanks else null, merging);
        if (!merging and p != first) {
            const e = t.elements[p];
            try blanks.append(a, .{ .start = e.start_tag.start, .end = e.end });
        }
    }
    return .{ .first = first, .blanks = blanks.items };
}
fn inspect(a: std.mem.Allocator, t: *const Tree, table: usize, rows: u32, cols: u32, limit: usize, merging: bool) !Grid {
    if (rows == 0 or cols == 0 or @as(u64, rows) * cols > limit) return error.LimitExceeded;
    if (try number(a, t, table, "rowCnt") != rows or try number(a, t, table, "colCnt") != cols) return error.StaleSourceTableGrid;
    if (merging) {
        const run = t.elements[table].parent orelse return error.UnsupportedSourceTableStructure;
        const paragraph = t.elements[run].parent orelse return error.UnsupportedSourceTableStructure;
        if (!fields.childIs(t, run, "run") or !fields.childIs(t, paragraph, "p") or t.elements[paragraph].parent != 0)
            return error.UnsupportedSourceTableStructure;
    }
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
        if (merging) try rejectLocalNamespaces(a, t, row);
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
            if (merging) {
                try rejectLocalNamespaces(a, t, cell);
                try rejectLocalNamespaces(a, t, sub);
            }
            const paragraphs = try inspectParagraphs(a, t, sub, merging);
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
            cells[r * cols + c] = .{ .node = cell, .addr = addr, .span = span, .size = sz, .list = sub, .paragraph = paragraphs.first, .blank_spans = paragraphs.blanks, .width = w, .height = h };
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
    }
    // Only two shell attributes need constant-size sorting. First-p t bodies
    // and later-p subtrees were collected once in source order.
    std.mem.sort(writer.Change, changes.items, {}, less);
    if (fresh != null) {
        var ordered: std.ArrayList(writer.Change) = .empty;
        var attribute: usize = 0;
        for (cell.blank_spans) |span| {
            while (attribute < changes.items.len and changes.items[attribute].start < span.start) : (attribute += 1)
                try ordered.append(a, changes.items[attribute]);
            try ordered.append(a, .{ .start = span.start, .end = span.end, .text = "", .serialized_xml = "" });
        }
        try ordered.appendSlice(a, changes.items[attribute..]);
        return fragment(a, t, cell.node, ordered.items, limit, true);
    }
    return fragment(a, t, cell.node, changes.items, limit, true);
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
    const g = try inspect(a, &t, table, rows, cols, request.max_cells, false);
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
    _ = try inspect(a, &check, table, nr, nc, request.max_cells, false);
    return allocator.dupe(u8, result);
}

/// Zero-based half-open rectangle, covering at least two complete physical cells.
pub const Rectangle = struct {
    top: u32,
    left: u32,
    bottom: u32,
    right: u32,

    pub fn validate(self: Rectangle, rows: u32, columns: u32, limit: usize) !void {
        if (@as(u64, rows) * columns > limit) return error.LimitExceeded;
        if (self.top >= self.bottom or self.left >= self.right or self.bottom > rows or self.right > columns or
            (@as(u64, self.bottom - self.top) * (self.right - self.left)) < 2)
            return error.InvalidSourceTableMergeRectangle;
    }
};

pub const MergeRequest = struct {
    target: Target,
    expected_rows: u32,
    expected_columns: u32,
    rectangle: Rectangle,
    max_bytes: usize = 16 * 1024 * 1024,
    max_cells: usize = 4096,
};

pub fn prepareMerge(allocator: std.mem.Allocator, source: []const u8, request: MergeRequest) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const rows = request.expected_rows;
    const cols = request.expected_columns;
    const rect = request.rectangle;
    try rect.validate(rows, cols, request.max_cells);
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{ .max_xml_bytes = request.max_bytes });
    if (tree.xml_report.processing_instructions != 0) return error.UnsupportedSourceTableStructure;
    const table = try select(&tree, request.target);
    try @import("field_free_section.zig").validate(a, &tree, request.max_bytes);
    if (tree.elements[table].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const grid = try inspect(a, &tree, table, rows, cols, request.max_cells, true);
    var ids: std.AutoHashMapUnmanaged(u32, void) = .empty;
    for (tree.elements, 0..) |_, index| {
        if (!fields.childIs(&tree, index, "p")) continue;
        const id = try number(a, &tree, index, "id");
        if ((try ids.getOrPut(a, id)).found_existing) return error.InvalidTableParagraphIds;
    }
    const anchor = grid.cells[@as(usize, rect.top) * cols + rect.left];
    var width: u32 = 0;
    var height: u32 = 0;
    for (rect.left..rect.right) |column| width += grid.cells[column].width;
    for (rect.top..rect.bottom) |row| height += grid.cells[row * cols].height;

    var content: std.ArrayList(u8) = .empty;
    var changes: std.ArrayList(writer.Change) = .empty;
    for (rect.top..rect.bottom) |row| {
        for (rect.left..rect.right) |column| {
            const donor = grid.cells[row * cols + column];
            if (donor.node == anchor.node) continue;
            const list = tree.elements[donor.list];
            const end = list.end_tag orelse return error.UnsupportedSourceTableStructure;
            const bytes = source[list.start_tag.end..end.start];
            if (bytes.len > request.max_bytes -| content.items.len) return error.LimitExceeded;
            try content.appendSlice(a, bytes);
            const node = tree.elements[donor.node];
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = "" });
        }
    }
    var anchor_changes: std.ArrayList(writer.Change) = .empty;
    const append_at = (tree.elements[anchor.list].end_tag orelse return error.UnsupportedSourceTableStructure).start;
    try anchor_changes.append(a, .{ .start = append_at, .end = append_at, .text = "", .serialized_xml = content.items });
    try patch(a, &tree, &anchor_changes, anchor.span, &.{ "rowSpan", "colSpan" }, .{ rect.bottom - rect.top, rect.right - rect.left }, request.max_bytes);
    try patch(a, &tree, &anchor_changes, anchor.size, &.{ "width", "height" }, .{ width, height }, request.max_bytes);
    const anchor_xml = try fragment(a, &tree, anchor.node, anchor_changes.items, request.max_bytes, false);
    const anchor_node = tree.elements[anchor.node];
    var ordered: std.ArrayList(writer.Change) = .empty;
    try ordered.append(a, .{ .start = anchor_node.start_tag.start, .end = anchor_node.end, .text = "", .serialized_xml = anchor_xml });
    try ordered.appendSlice(a, changes.items);
    const result = try writer.write(a, source, ordered.items, request.max_bytes);
    var checked = try @import("section_tree.zig").parse(a, result, 0, 0, .{ .max_xml_bytes = request.max_bytes });
    const report = try @import("table_geometry.zig").inspectElement(a, &checked, table, .{ .max_grid_slots = request.max_cells });
    const removed = @as(usize, rect.bottom - rect.top) * (rect.right - rect.left) - 1;
    if (report.rows != rows or report.cells != grid.cells.len - removed or report.uncovered_slots != 0 or
        report.overlaps != 0 or report.outside_grid != 0 or report.row_count_mismatch != 0 or
        report.row_address_mismatch != 0) return error.InvalidSourceTableMergeResult;
    return allocator.dupe(u8, result);
}
