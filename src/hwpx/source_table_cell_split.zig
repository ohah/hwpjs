//! SOURCE cell subdivision. All preparation is owned by a request-local arena.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");
const builtin = @import("builtin");
pub const Work = if (builtin.is_test) struct {
    pub var source_cells: usize = 0;
    pub var axis_links: usize = 0;
    pub var emitted_cells: usize = 0;
    pub var output_slots: usize = 0;
} else struct {};
pub const Mode = enum(u32) { each = 0, merge_then_split = 1 };
pub const Options = struct {
    rectangle: grid.Rectangle,
    selected_cells: u32,
    rows: u32,
    columns: u32,
    mode: Mode,
    equalize_rows: bool,

    pub fn validate(self: Options, rows: u32, columns: u32, limit: usize) !void {
        const rect = self.rectangle;
        if (rows == 0 or columns == 0 or @as(u64, rows) * columns > limit) return error.LimitExceeded;
        if (rect.top >= rect.bottom or rect.left >= rect.right or rect.bottom > rows or rect.right > columns or
            self.selected_cells == 0 or self.selected_cells > limit or self.rows == 0 or self.rows > 63 or
            self.columns == 0 or self.columns > 63 or (self.rows == 1 and self.columns == 1) or
            (self.mode == .merge_then_split and self.selected_cells < 2))
            return error.InvalidSourceTableSplit;
        _ = try self.addedParagraphs(limit);
    }
    pub fn addedParagraphs(self: Options, limit: usize) !usize {
        const per_cell = @as(u64, self.rows) * self.columns - 1;
        const count = per_cell * (if (self.mode == .each) @as(u64, self.selected_cells) else 1);
        if (count > limit) return error.LimitExceeded;
        return @intCast(count);
    }
};
pub const Request = struct {
    target: grid.Target,
    expected_rows: u32,
    expected_columns: u32,
    options: Options,
    fresh_paragraph_ids: []const u32,
    max_bytes: usize = 16 * 1024 * 1024,
    max_cells: usize = 4096,
};

const Link = struct { node: u32, delta: i64 };
fn axis(a: std.mem.Allocator, cells: []const grid.Cell, count: u32, extent: u32, horizontal: bool) ![]u32 {
    if (extent == 0) return error.UnsupportedSourceTableGeometry;
    const links = try a.alloc(std.ArrayList(Link), @as(usize, count) + 1);
    @memset(links, .empty);
    try connect(a, links, 0, count, extent);
    for (cells) |cell| {
        const start = if (horizontal) cell.column else cell.row;
        const span = if (horizontal) cell.column_span else cell.row_span;
        try connect(a, links, start, start + span, if (horizontal) cell.width else cell.height);
    }
    const positions = try a.alloc(?i64, links.len);
    @memset(positions, null);
    positions[0] = 0;
    const queue = try a.alloc(u32, links.len);
    var read: usize = 0;
    var written: usize = 1;
    queue[0] = 0;
    while (read < written) : (read += 1) {
        const from = queue[read];
        for (links[from].items) |link| {
            const value = positions[from].? + link.delta;
            if (value < 0 or value > extent) return error.UnsupportedSourceTableGeometry;
            if (positions[link.node]) |previous| {
                if (previous != value) return error.UnsupportedSourceTableGeometry;
            } else {
                positions[link.node] = value;
                queue[written] = link.node;
                written += 1;
            }
        }
    }
    const result = try a.alloc(u32, links.len);
    var previous: usize = 0;
    result[0] = 0;
    for (1..links.len) |i| {
        if (positions[i]) |end| {
            const start: u32 = @intCast(positions[previous].?);
            if (end <= start or end - start < i - previous) return error.UnsupportedSourceTableGeometry;
            for (previous + 1..i + 1) |j|
                result[j] = start + @as(u32, @intCast((@as(u64, @intCast(end - start)) * (j - previous)) / (i - previous)));
            previous = i;
        } else if (links[i].items.len != 0) return error.UnsupportedSourceTableSplitGeometry;
    }
    return result;
}
fn connect(a: std.mem.Allocator, links: []std.ArrayList(Link), start: u32, end: u32, value: u32) !void {
    if (start >= end or end >= links.len) return error.InvalidSourceTableGrid;
    if (builtin.is_test) Work.axis_links += 2;
    try links[start].append(a, .{ .node = end, .delta = value });
    try links[end].append(a, .{ .node = start, .delta = -@as(i64, value) });
}
fn divisions(a: std.mem.Allocator, edges: []const u32, start: u32, end: u32, parts: u32, preserve: bool) ![]const u32 {
    if (parts == 1) return a.dupe(u32, &.{ edges[start], edges[end] });
    if (preserve and end - start > 1) {
        if (end - start != parts) return error.UnsupportedSourceTableSplitHeights;
        return edges[start .. end + 1];
    }
    const width = edges[end] - edges[start];
    if (width < parts) return error.UnsupportedSourceTableSplitGeometry;
    const values = try a.alloc(u32, @as(usize, parts) + 1);
    for (values, 0..) |*value, i| value.* = edges[start] + @as(u32, @intCast(@as(u64, width) * i / parts));
    return values;
}
const Pieces = struct { cell: grid.Cell, x: []const u32, y: []const u32, content: []const u8 };
const EdgeIndex = struct {
    values: []u32,
    index: std.AutoHashMapUnmanaged(u32, u32),
};
// Four bounded counting passes keep coordinate union ordering linear.
fn sortCoordinates(a: std.mem.Allocator, values: []u32) !void {
    const scratch = try a.alloc(u32, values.len);
    var from = values;
    var to = scratch;
    for ([_]u5{ 0, 8, 16, 24 }) |shift| {
        var offsets: [256]usize = @splat(0);
        for (from) |value| offsets[(value >> shift) & 255] += 1;
        var start: usize = 0;
        for (&offsets) |*offset| {
            const count = offset.*;
            offset.* = start;
            start += count;
        }
        for (from) |value| {
            const bucket = (value >> shift) & 255;
            to[offsets[bucket]] = value;
            offsets[bucket] += 1;
        }
        std.mem.swap([]u32, &from, &to);
    }
}
fn edgeIndex(a: std.mem.Allocator, original: []const u32, pieces: []const Pieces, horizontal: bool) !EdgeIndex {
    var unique: std.AutoHashMapUnmanaged(u32, u32) = .empty;
    for (original) |v| try unique.put(a, v, 0);
    for (pieces) |piece| for (if (horizontal) piece.x else piece.y) |v| try unique.put(a, v, 0);
    const values = try a.alloc(u32, unique.count());
    var keys = unique.keyIterator();
    for (values) |*value| value.* = keys.next().?.*;
    try sortCoordinates(a, values);
    for (values, 0..) |value, i| unique.getPtr(value).?.* = @intCast(i);
    return .{ .values = values, .index = unique };
}
fn listContents(tree: *const Tree, cell: grid.Cell) ![]const u8 {
    const node = tree.elements[cell.list];
    const end = node.end_tag orelse return error.UnsupportedSourceTableStructure;
    return tree.source[node.start_tag.end..end.start];
}
fn emptyParagraph(a: std.mem.Allocator, tree: *const Tree, cell: grid.Cell, id: u32, limit: usize) ![]u8 {
    const p = tree.elements[cell.paragraph];
    const run = p.first_child orelse return error.UnsupportedSourceTableStructure;
    const r = tree.elements[run];
    const paragraph_opening = try @import("xml_unsigned_attributes_write.zig").write(a, tree, cell.paragraph, &.{"id"}, .{id}, limit);
    const run_tag = tree.source[r.start_tag.start..r.start_tag.end];
    var input = try @import("../xml/input.zig").Input.init(run_tag, .utf8, .{ .max_bytes = run_tag.len, .max_characters = run_tag.len });
    const parsed = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = run_tag.len });
    const name = parsed.name.raw;
    if (!std.mem.endsWith(u8, name, "run")) return error.UnsupportedSourceTableStructure;
    const prefix = name[0 .. name.len - 3];
    const p_end = p.end_tag orelse return error.UnsupportedSourceTableStructure;
    const run_opening = if (r.end_tag != null) run_tag else try std.fmt.allocPrint(a, "{s}>", .{run_tag[0 .. run_tag.len - 2]});
    return std.fmt.allocPrint(a, "{s}{s}<{s}t/></{s}>{s}", .{ paragraph_opening, run_opening, prefix, name, tree.source[p_end.start..p_end.end] });
}
fn render(a: std.mem.Allocator, tree: *const Tree, cell: grid.Cell, row: u32, column: u32, end_row: u32, end_column: u32, width: u32, height: u32, body: ?[]const u8, limit: usize) ![]u8 {
    var changes: std.ArrayList(writer.Change) = .empty;
    if (row != cell.row or column != cell.column)
        try grid.patch(a, tree, &changes, cell.addr, &.{ "rowAddr", "colAddr" }, .{ row, column }, limit);
    if (end_row - row != cell.row_span or end_column - column != cell.column_span)
        try grid.patch(a, tree, &changes, cell.span, &.{ "rowSpan", "colSpan" }, .{ end_row - row, end_column - column }, limit);
    if (width != cell.width or height != cell.height)
        try grid.patch(a, tree, &changes, cell.size, &.{ "width", "height" }, .{ width, height }, limit);
    if (body) |contents| {
        const node = tree.elements[cell.list];
        try changes.append(a, .{ .start = node.start_tag.end, .end = node.end_tag.?.start, .text = "", .serialized_xml = contents });
    }
    return grid.fragment(a, tree, cell.node, changes.items, limit, false);
}
const Output = struct {
    a: std.mem.Allocator,
    cells: []?[]const u8,
    columns: usize,
    bytes: usize = 0,
    count: usize = 0,
    limit: usize,
    fn put(self: *Output, row: u32, col: u32, bytes: []const u8) !void {
        const slot = @as(usize, row) * self.columns + col;
        if (self.cells[slot] != null) return error.InvalidSourceTableSplitResult;
        if (bytes.len > self.limit -| self.bytes) return error.LimitExceeded;
        self.bytes += bytes.len;
        self.count += 1;
        if (builtin.is_test) Work.emitted_cells += 1;
        self.cells[slot] = bytes;
    }
    fn appendRow(self: *const Output, out: *std.ArrayList(u8), row: usize) !void {
        for (self.cells[row * self.columns ..][0..self.columns]) |value|
            if (value) |bytes| try out.appendSlice(self.a, bytes);
    }
};
pub fn prepare(allocator: std.mem.Allocator, source: []const u8, request: Request) ![]u8 {
    if (builtin.is_test) {
        Work.source_cells = 0;
        Work.axis_links = 0;
        Work.emitted_cells = 0;
        Work.output_slots = 0;
    }
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const settings = request.options;
    try settings.validate(request.expected_rows, request.expected_columns, request.max_cells);
    const added = try settings.addedParagraphs(request.max_cells);
    if (request.fresh_paragraph_ids.len != added) return error.InvalidTableParagraphIds;
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{ .max_xml_bytes = request.max_bytes });
    try @import("field_free_section.zig").validate(a, &tree, request.max_bytes);
    if (tree.xml_report.processing_instructions != 0) return error.UnsupportedSourceTableStructure;
    const table = try grid.select(&tree, request.target);
    if (tree.elements[table].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const original = try grid.inspectForSplit(a, &tree, table, request.expected_rows, request.expected_columns, request.max_cells);
    if (builtin.is_test) Work.source_cells = original.cells.len;
    var ids: std.AutoHashMapUnmanaged(u32, void) = .empty;
    for (tree.elements, 0..) |_, i| if (fields.childIs(&tree, i, "p")) {
        const id = (try fields.optionalUnsigned(a, &tree, i, "id", 4096)) orelse return error.InvalidTableParagraphIds;
        if ((try ids.getOrPut(a, id)).found_existing) return error.InvalidTableParagraphIds;
    };
    for (request.fresh_paragraph_ids) |id| {
        if (id == 0 or (try ids.getOrPut(a, id)).found_existing) return error.InvalidTableParagraphIds;
    }
    const x = try axis(a, original.cells, request.expected_columns, original.width, true);
    const y = try axis(a, original.cells, request.expected_rows, original.height, false);
    const selected = try a.alloc(bool, original.cells.len);
    @memset(selected, false);
    const rect = settings.rectangle;
    var anchor: ?usize = null;
    var count: usize = 0;
    var merged: std.ArrayList(u8) = .empty;
    for (original.cells, 0..) |cell, i| {
        const bottom = cell.row + cell.row_span;
        const right = cell.column + cell.column_span;
        if (cell.row >= rect.bottom or cell.column >= rect.right or bottom <= rect.top or right <= rect.left) continue;
        if (cell.row < rect.top or cell.column < rect.left or bottom > rect.bottom or right > rect.right)
            return error.PartialSourceTableSplitCell;
        selected[i] = true;
        count += 1;
        if (anchor == null) anchor = i;
        if (settings.mode == .merge_then_split) {
            const contents = try listContents(&tree, cell);
            if (contents.len > request.max_bytes -| merged.items.len) return error.LimitExceeded;
            try merged.appendSlice(a, contents);
        }
    }
    if (anchor == null or count != settings.selected_cells) return error.StaleSourceTableSplitSelection;
    var groups: std.ArrayList(Pieces) = .empty;
    for (original.cells, 0..) |cell, i| {
        if (!selected[i] or (settings.mode == .merge_then_split and i != anchor.?)) continue;
        const r = if (settings.mode == .each) grid.Rectangle{ .top = cell.row, .left = cell.column, .bottom = cell.row + cell.row_span, .right = cell.column + cell.column_span } else rect;
        try groups.append(a, .{
            .cell = cell,
            .x = try divisions(a, x, r.left, r.right, settings.columns, false),
            .y = try divisions(a, y, r.top, r.bottom, settings.rows, !settings.equalize_rows),
            .content = if (settings.mode == .each) try listContents(&tree, cell) else merged.items,
        });
    }
    const nx = try edgeIndex(a, x, groups.items, true);
    const ny = try edgeIndex(a, y, groups.items, false);
    const rows = ny.values.len - 1;
    const columns = nx.values.len - 1;
    if (@as(u64, rows) * columns > request.max_cells) return error.LimitExceeded;
    if (builtin.is_test) Work.output_slots = rows * columns;
    const slots = try a.alloc(?[]const u8, rows * columns);
    @memset(slots, null);
    var output: Output = .{ .a = a, .cells = slots, .columns = columns, .limit = request.max_bytes };
    for (original.cells, selected) |cell, is_selected| {
        if (is_selected) continue;
        const row = ny.index.get(y[cell.row]).?;
        const col = nx.index.get(x[cell.column]).?;
        try output.put(row, col, try render(a, &tree, cell, row, col, ny.index.get(y[cell.row + cell.row_span]).?, nx.index.get(x[cell.column + cell.column_span]).?, cell.width, cell.height, null, request.max_bytes));
    }
    var fresh: usize = 0;
    for (groups.items) |group| for (0..settings.rows) |r| {
        for (0..settings.columns) |c| {
            const content = if (r == 0 and c == 0) group.content else contents: {
                const blank = try emptyParagraph(a, &tree, group.cell, request.fresh_paragraph_ids[fresh], request.max_bytes);
                fresh += 1;
                break :contents blank;
            };
            const row = ny.index.get(group.y[r]).?;
            const col = nx.index.get(group.x[c]).?;
            try output.put(row, col, try render(a, &tree, group.cell, row, col, ny.index.get(group.y[r + 1]).?, nx.index.get(group.x[c + 1]).?, group.x[c + 1] - group.x[c], group.y[r + 1] - group.y[r], content, request.max_bytes));
        }
    };
    if (fresh != added) return error.InvalidSourceTableSplitResult;
    var changes: std.ArrayList(writer.Change) = .empty;
    try grid.patch(a, &tree, &changes, table, &.{ "rowCnt", "colCnt" }, .{ @intCast(rows), @intCast(columns) }, request.max_bytes);
    for (original.rows, 0..) |row, r| {
        const start_row = ny.index.get(y[r]).?;
        const end_row = ny.index.get(y[r + 1]).?;
        var row_changes: std.ArrayList(writer.Change) = .empty;
        const row_node = tree.elements[row];
        var cursor = row_node.first_child;
        var inserted = false;
        while (cursor) |cell| : (cursor = tree.elements[cell].next_sibling) {
            const node = tree.elements[cell];
            var bytes: std.ArrayList(u8) = .empty;
            if (!inserted) try output.appendRow(&bytes, start_row);
            inserted = true;
            try row_changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = bytes.items });
        }
        if (!inserted) {
            var bytes: std.ArrayList(u8) = .empty;
            try output.appendRow(&bytes, start_row);
            const at = row_node.end_tag.?.start;
            if (bytes.items.len != 0) try row_changes.append(a, .{ .start = at, .end = at, .text = "", .serialized_xml = bytes.items });
        }
        var rendered: std.ArrayList(u8) = .empty;
        try rendered.appendSlice(a, try grid.fragment(a, &tree, row, row_changes.items, request.max_bytes, true));
        for (start_row + 1..end_row) |new_row| {
            try rendered.appendSlice(a, tree.source[row_node.start_tag.start..row_node.start_tag.end]);
            try output.appendRow(&rendered, new_row);
            try rendered.appendSlice(a, tree.source[row_node.end_tag.?.start..row_node.end_tag.?.end]);
        }
        try changes.append(a, .{ .start = row_node.start_tag.start, .end = row_node.end, .text = "", .serialized_xml = rendered.items });
    }
    const result = try writer.write(a, source, changes.items, request.max_bytes);
    var checked = try @import("section_tree.zig").parse(a, result, 0, 0, .{ .max_xml_bytes = request.max_bytes });
    try grid.validateSpanGrid(a, &checked, table, @intCast(rows), @intCast(columns), output.count, request.max_cells);
    return allocator.dupe(u8, result);
}
