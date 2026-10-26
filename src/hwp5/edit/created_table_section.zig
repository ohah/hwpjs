//! Serialize pending table semantics over current model text and immutable source.
const std = @import("std");
const model = @import("../../model/document.zig");
const values = @import("created_table_values.zig");
const records = @import("created_table_records.zig");
const Version = @import("../version.zig").Version;
const Tree = @import("../body/tree.zig").Tree;
const Patch = struct { start: usize, end: usize, bytes: []const u8, order: usize, depth: u10 = 0 };

pub fn write(a: std.mem.Allocator, source: []const u8, section: model.Section, tables: *const values.Values, version: Version, resources: records.Resources, limits: records.Limits) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const base = try @import("structure_section_writer.zig").writeWithDeletions(scratch, source, section, version, resources.paragraphs.char_shapes, limits.max_bytes, true);
    if (tables.entries.len == 0) return a.dupe(u8, base);
    const original = try @import("source_tree.zig").parse(scratch, base, version, .{});
    const links = try @import("../body/control_links.zig").Links.build(scratch, original);
    var projected = try @import("../model_projection.zig").fromDecodedSections(scratch, version, &.{base});
    const current = &projected.sections[0];
    if (current.paragraphs.len != section.paragraphs.len) return error.SourceBindingMismatch;
    const positions = try scratch.alloc(usize, tables.entries.len);
    const order = try scratch.alloc(usize, tables.entries.len);
    for (tables.entries, 0..) |entry, index| {
        positions[index] = try @import("created_table_anchor.zig").resolve(scratch, &section, entry.anchor);
        order[index] = index;
    }
    const Context = struct {
        entries: []const values.Entry,
        positions: []const usize,
        fn less(ctx: @This(), l: usize, r: usize) bool {
            if (ctx.positions[l] != ctx.positions[r]) return ctx.positions[l] < ctx.positions[r];
            if (ctx.entries[l].anchor.unit != ctx.entries[r].anchor.unit) return ctx.entries[l].anchor.unit < ctx.entries[r].anchor.unit;
            return l < r;
        }
    };
    std.mem.sort(usize, order, Context{ .entries = tables.entries, .positions = positions }, Context.less);
    // Descending insertion retains original coordinates and stable same-point order.
    var index = order.len;
    while (index > 0) {
        index -= 1;
        const entry_index = order[index];
        const p = &current.paragraphs[positions[entry_index]];
        const parts = try @import("../body/paragraph_children.zig").collect(original, try p.originalNode());
        p.* = try @import("created_table_host_draft.zig").prepare(scratch, p.*, tables.entries[entry_index].anchor.unit, parts.metadata.ranges, resources.paragraphs.char_shapes, limits.max_bytes);
    }
    const text = try @import("text_section_writer.zig").write(scratch, base, current.*, version, limits.max_bytes);
    const rendered = try @import("source_tree.zig").parse(scratch, text, version, .{});
    const headers = try scratch.alloc(usize, current.paragraphs.len);
    var count: usize = 0;
    for (rendered.nodes, 0..) |node, ni| if (node.record.value == .header) {
        if (count >= headers.len) return error.SourceBindingMismatch;
        headers[count] = ni;
        count += 1;
    };
    if (count != headers.len) return error.SourceBindingMismatch;
    var patches: std.ArrayList(Patch) = .empty;
    var previous_paragraph: ?usize = null;
    for (order) |entry_index| {
        const entry = tables.entries[entry_index];
        const pi = positions[entry_index];
        const host_node = headers[pi];
        const host = rendered.nodes[host_node];
        if (previous_paragraph != pi) {
            const record = host.record.framing;
            const offset = record.offset + record.raw.len - record.payload.len + 4;
            const mask = try scratch.dupe(u8, record.payload[4..8]);
            std.mem.writeInt(u32, mask[0..4], std.mem.readInt(u32, mask[0..4], .little) | (1 << 11), .little);
            try patches.append(scratch, .{ .start = offset, .end = offset + 4, .bytes = mask, .order = patches.items.len });
            previous_paragraph = pi;
        }
        const base_host = try current.paragraphs[pi].originalNode();
        var ordinal: usize = 0;
        var next_control: ?usize = null;
        for (links.items) |link| {
            if (link.paragraph_node != base_host) continue;
            if (link.start_unit >= entry.anchor.unit) {
                next_control = ordinal;
                break;
            }
            ordinal += 1;
        }
        var at = if (host.subtree_end < rendered.nodes.len) rendered.nodes[host.subtree_end].record.framing.offset else text.len;
        if (next_control) |target| {
            var child = host_node + 1;
            var seen: usize = 0;
            var found = false;
            while (child < host.subtree_end) {
                const node = rendered.nodes[child];
                if (node.record.value == .control_header) {
                    if (seen == target) {
                        at = node.record.framing.offset;
                        found = true;
                        break;
                    }
                    seen += 1;
                }
                child = node.subtree_end;
            }
            if (!found) return error.SourceBindingMismatch;
        }
        const level = std.math.add(u10, host.record.framing.level, 1) catch return error.LimitExceeded;
        const fragment = try records.write(scratch, &entry.value.table, version, entry.value.options, resources, level, limits);
        try patches.append(scratch, .{ .start = at, .end = at, .bytes = fragment, .order = patches.items.len, .depth = level });
    }
    std.mem.sort(Patch, patches.items, {}, struct {
        fn less(_: void, l: Patch, r: Patch) bool {
            if (l.start != r.start) return l.start < r.start;
            if (l.depth != r.depth) return l.depth > r.depth;
            return l.order < r.order;
        }
    }.less);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var cursor: usize = 0;
    for (patches.items) |patch| {
        if (patch.start < cursor or patch.end < patch.start or patch.end > text.len) return error.SourceBindingMismatch;
        try append(a, &out, text[cursor..patch.start], limits.max_bytes);
        try append(a, &out, patch.bytes, limits.max_bytes);
        cursor = patch.end;
    }
    try append(a, &out, text[cursor..], limits.max_bytes);
    const verified = try @import("source_tree.zig").parse(scratch, out.items, version, .{});
    _ = try @import("../body/control_links.zig").Links.build(scratch, verified);
    _ = try @import("../body/paragraphs.zig").inspect(verified, resources.paragraphs);
    return out.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
