//! Split-only structural adapter over the existing selected paragraph writer.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const Patch = struct { start: usize, end: usize, bytes: []const u8, order: usize };

pub fn write(a: std.mem.Allocator, source: []const u8, section: model.Section, version: Version, char_count: usize, limit: usize) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const original_tree = try Tree.parseTextPreview(scratch, source, version, .{});
    const plan = try @import("structure_plan.zig").build(scratch, original_tree, section, version);
    var originals: std.ArrayList(model.Paragraph) = .empty;
    for (section.paragraphs) |p| if (p.source_node != null) {
        try originals.append(scratch, p);
    };
    const normalized = try @import("text_section_writer.zig").write(scratch, source, .{ .paragraphs = originals.items, .source_record_count = section.source_record_count }, version, limit);
    const rendered = try Tree.parseTextPreview(scratch, normalized, version, .{});
    const mapping = try scratch.alloc(?usize, original_tree.nodes.len);
    @memset(mapping, null);
    var paragraph: usize = 0;
    var list_cursor: usize = 0;
    for (rendered.nodes, 0..) |node, index| {
        if (node.record.value == .header) {
            if (paragraph >= originals.items.len) return error.SourceBindingMismatch;
            mapping[try originals.items[paragraph].originalNode()] = index;
            paragraph += 1;
        } else if (node.record.framing.tag == @intFromEnum(body.Tag.list_header)) {
            while (list_cursor < original_tree.nodes.len and original_tree.nodes[list_cursor].record.framing.tag != @intFromEnum(body.Tag.list_header)) list_cursor += 1;
            if (list_cursor >= original_tree.nodes.len) return error.SourceBindingMismatch;
            mapping[list_cursor] = index;
            list_cursor += 1;
        }
    }
    if (paragraph != originals.items.len) return error.SourceBindingMismatch;
    var patches: std.ArrayList(Patch) = .empty;
    var previous_template: ?u32 = null;
    for (plan.insertions) |insertion| {
        const template = original_tree.nodes[insertion.template_node].record.framing;
        const rendered_node = mapping[insertion.template_node] orelse return error.SourceBindingMismatch;
        const end = rendered.nodes[rendered_node].subtree_end;
        const at = if (end < rendered.nodes.len) rendered.nodes[end].record.framing.offset else normalized.len;
        var records: std.ArrayList(u8) = .empty;
        try @import("paragraph_records.zig").append(scratch, &records, template, insertion.template_node, section.paragraphs[insertion.paragraph], version, char_count, insertion.last_in_owner, limit);
        try patches.append(scratch, .{ .start = at, .end = at, .bytes = records.items, .order = patches.items.len });
        if (previous_template != insertion.template_node) {
            const record = rendered.nodes[rendered_node].record.framing;
            const count_at = record.offset + record.raw.len - record.payload.len;
            const bytes = try scratch.dupe(u8, record.payload[0..4]);
            std.mem.writeInt(u32, bytes[0..4], std.mem.readInt(u32, bytes[0..4], .little) & 0x7fffffff, .little);
            try patches.append(scratch, .{ .start = count_at, .end = count_at + 4, .bytes = bytes, .order = patches.items.len });
        }
        previous_template = insertion.template_node;
    }
    for (plan.list_additions, 0..) |add, source_node| {
        if (add == 0) continue;
        const index = mapping[source_node] orelse return error.SourceBindingMismatch;
        const record = rendered.nodes[index].record.framing;
        const at = record.offset + record.raw.len - record.payload.len;
        const bytes = try scratch.alloc(u8, 2);
        const count = std.math.add(u16, std.mem.readInt(u16, record.payload[0..2], .little), add) catch return error.LimitExceeded;
        std.mem.writeInt(u16, bytes[0..2], count, .little);
        try patches.append(scratch, .{ .start = at, .end = at + 2, .bytes = bytes, .order = patches.items.len });
    }
    std.mem.sort(Patch, patches.items, {}, struct {
        fn less(_: void, left: Patch, right: Patch) bool {
            return left.start < right.start or (left.start == right.start and left.order < right.order);
        }
    }.less);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var cursor: usize = 0;
    for (patches.items) |patch| {
        if (patch.start < cursor or patch.end < patch.start or patch.end > normalized.len) return error.SourceBindingMismatch;
        try appendBounded(a, &out, normalized[cursor..patch.start], limit);
        try appendBounded(a, &out, patch.bytes, limit);
        cursor = patch.end;
    }
    try appendBounded(a, &out, normalized[cursor..], limit);
    return out.toOwnedSlice(a);
}
fn appendBounded(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
