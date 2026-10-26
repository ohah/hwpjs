//! Read-only logical paragraph order from native values and immutable topology.
//! References are scoped to the originating Session/section/current revision.
const std = @import("std");
const model = @import("../../model/document.zig");
const anchors = @import("created_table_anchor.zig");
const Values = @import("created_table_values.zig").Values;
pub const Source = struct { section: usize, host: anchors.Host };
pub const Reference = union(enum) { source: Source, created_cell: @import("created_cell_text.zig").Point };
const Insertion = struct { before: usize, depth: u10, unit: u32, table: usize };

pub fn build(a: std.mem.Allocator, raw: []const u8, section: *const model.Section, tables: *const Values, version: @import("../version.zig").Version, section_index: usize, limit: usize) ![]Reference {
    try version.requireSupported();
    var count = section.paragraphs.len;
    if (count > limit) return error.LimitExceeded;
    for (tables.entries) |entry| {
        const table = entry.value.table;
        const cells = std.math.mul(usize, table.plan.rows, table.plan.columns) catch return error.LimitExceeded;
        if (cells != table.cells.len or cells == 0) return error.InvalidCreatedTableCells;
        count = std.math.add(usize, count, cells) catch return error.LimitExceeded;
        if (count > limit) return error.LimitExceeded;
    }
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var insertions: std.ArrayList(Insertion) = .empty;
    if (tables.entries.len != 0) {
        const tree = try @import("source_tree.zig").parse(scratch, raw, version, .{});
        if (tree.nodes.len != section.source_record_count) return error.SourceBindingMismatch;
        const links = try @import("../body/control_links.zig").Links.build(scratch, tree);
        for (tables.entries, 0..) |entry, ti| {
            const pi = try anchors.resolve(scratch, section, entry.anchor);
            const p = section.paragraphs[pi];
            var before = pi + 1;
            var depth: u10 = 0;
            if (p.source_node) |node| {
                if (node >= tree.nodes.len or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
                depth = tree.nodes[node].record.framing.level;
                const bytes = try @import("plain_text_content.zig").editableTextBytes(scratch, p);
                var tokens = (try @import("../body/text.zig").Text.parse(bytes)).tokens();
                var target: ?usize = null;
                for (links.items) |link| {
                    if (link.paragraph_node != node) continue;
                    const token = while (try tokens.next()) |next| {
                        if (next.value == .control and next.value.control.kind == .extended) break next;
                    } else return error.SourceBindingMismatch;
                    const control = token.value.control;
                    if (control.code != link.code) return error.SourceBindingMismatch;
                    const header = tree.nodes[link.control_node].record.value.control_header;
                    _ = try @import("../body/control_identity.zig").resolve(std.mem.readInt(u32, control.data[0..4], .little), header.id, control.code, header.properties);
                    if (target == null and token.start_unit >= entry.anchor.unit) target = link.control_node;
                }
                while (try tokens.next()) |token| if (token.value == .control and token.value.control.kind == .extended) return error.SourceBindingMismatch;
                const end = tree.nodes[node].subtree_end;
                for (section.paragraphs[pi + 1 ..], pi + 1..) |following, fi| {
                    const origin = following.source_node orelse following.header_template orelse return error.SourceBindingMismatch;
                    if (origin <= node or origin >= end) continue;
                    before = fi + 1;
                    if (target) |control| if (origin >= control) {
                        before = fi;
                        break;
                    };
                }
            } else {
                if (p.deferred_direct_records != 0) return error.UnsupportedCreatedTableHostProjection;
                const template = p.header_template orelse return error.SourceBindingMismatch;
                if (template >= tree.nodes.len) return error.SourceBindingMismatch;
                depth = tree.nodes[template].record.framing.level;
            }
            try insertions.append(scratch, .{ .before = before, .depth = depth, .unit = entry.anchor.unit, .table = ti });
        }
    }
    std.mem.sort(Insertion, insertions.items, {}, struct {
        fn less(_: void, l: Insertion, r: Insertion) bool {
            if (l.before != r.before) return l.before < r.before;
            if (l.depth != r.depth) return l.depth > r.depth;
            if (l.unit != r.unit) return l.unit < r.unit;
            return l.table < r.table;
        }
    }.less);
    const out = try a.alloc(Reference, count);
    errdefer a.free(out);
    var cursor: usize = 0;
    var insertion: usize = 0;
    for (0..section.paragraphs.len + 1) |pi| {
        while (insertion < insertions.items.len and insertions.items[insertion].before == pi) : (insertion += 1) {
            const table = tables.entries[insertions.items[insertion].table].value.table;
            for (table.cells, 0..) |_, ci| {
                out[cursor] = .{ .created_cell = .{ .section = section_index, .table = table.identity, .row = @intCast(ci / table.plan.columns), .column = @intCast(ci % table.plan.columns) } };
                cursor += 1;
            }
        }
        if (pi < section.paragraphs.len) {
            out[cursor] = .{ .source = .{ .section = section_index, .host = try anchors.identity(section.paragraphs[pi]) } };
            cursor += 1;
        }
    }
    if (cursor != count or insertion != insertions.items.len) return error.SourceBindingMismatch;
    return out;
}
