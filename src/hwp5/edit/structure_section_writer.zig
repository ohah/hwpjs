//! Split-only structural adapter over the existing selected paragraph writer.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const Patch = struct { start: usize, end: usize, bytes: []const u8, order: usize };

pub fn write(a: std.mem.Allocator, source: []const u8, section: model.Section, version: Version, char_count: usize, limit: usize) ![]u8 {
    return writeWithDeletions(a, source, section, version, char_count, limit, false);
}

pub fn writeWithDeletions(a: std.mem.Allocator, source: []const u8, section: model.Section, version: Version, char_count: usize, limit: usize, allow_deletions: bool) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const original_tree = try Tree.parseTextPreview(scratch, source, version, .{});
    const plan = try @import("structure_plan.zig").buildWithDeletions(scratch, original_tree, section, version, allow_deletions);
    var originals: std.ArrayList(model.Paragraph) = .empty;
    for (section.paragraphs) |p| if (p.source_node != null) {
        try originals.append(scratch, p);
    };
    if (plan.removals.len != 0) {
        const original_model = try @import("../model_projection.zig").fromDecodedSections(scratch, version, &.{source});
        var complete: std.ArrayList(model.Paragraph) = .empty;
        var retained: usize = 0;
        for (original_model.sections[0].paragraphs) |p| {
            if (retained < originals.items.len and originals.items[retained].source_node == p.source_node) {
                try complete.append(scratch, originals.items[retained]);
                retained += 1;
            } else try complete.append(scratch, p);
        }
        if (retained != originals.items.len) return error.SourceBindingMismatch;
        originals = complete;
    }
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
        } else if (node.record.framing.tag == @backingInt(body.Tag.list_header)) {
            while (list_cursor < original_tree.nodes.len and original_tree.nodes[list_cursor].record.framing.tag != @backingInt(body.Tag.list_header)) list_cursor += 1;
            if (list_cursor >= original_tree.nodes.len) return error.SourceBindingMismatch;
            mapping[list_cursor] = index;
            list_cursor += 1;
        }
    }
    if (paragraph != originals.items.len) return error.SourceBindingMismatch;
    var patches: std.ArrayList(Patch) = .empty;
    var links = try @import("../body/control_links.zig").Links.build(scratch, original_tree);
    defer links.deinit(scratch);
    const replaced = try scratch.alloc(bool, original_tree.nodes.len);
    @memset(replaced, false);
    for (section.paragraphs) |p| {
        if (p.restart_control_source == null) continue;
        const origin = p.source_node orelse p.header_template orelse return error.MissingParagraphTemplate;
        if (replaced[origin]) continue;
        const link_index = (try @import("page_restart_source.zig").forFamily(links.items, origin, section.paragraphs)) orelse return error.SourceBindingMismatch;
        const rendered_node = mapping[origin] orelse return error.SourceBindingMismatch;
        const end = rendered.nodes[rendered_node].subtree_end;
        const at = if (end < rendered.nodes.len) rendered.nodes[end].record.framing.offset else normalized.len;
        var groups = try @import("paragraph_owner.zig").inspectGroups(scratch, original_tree, version);
        defer groups.deinit(scratch);
        const owner = try @import("paragraph_owner.zig").logicalOwner(original_tree, groups, origin);
        var last_index: usize = 0;
        for (section.paragraphs, 0..) |member, index| if ((member.source_node orelse member.header_template orelse continue) == origin) {
            last_index = index;
        };
        var last = true;
        for (section.paragraphs[last_index + 1 ..]) |following| {
            const next = following.source_node orelse following.header_template orelse return error.MissingParagraphTemplate;
            if (try @import("paragraph_owner.zig").logicalOwner(original_tree, groups, next) == owner) {
                last = false;
                break;
            }
        }
        var records: std.ArrayList(u8) = .empty;
        try @import("page_restart_family_records.zig").append(scratch, &records, original_tree, links.items, link_index, origin, section.paragraphs, last, char_count, limit);
        try patches.append(scratch, .{ .start = rendered.nodes[rendered_node].record.framing.offset, .end = at, .bytes = records.items, .order = patches.items.len });
        replaced[origin] = true;
    }
    var previous_template: ?u32 = null;
    for (plan.insertions) |insertion| {
        if (replaced[insertion.template_node]) continue;
        const template = original_tree.nodes[insertion.template_node].record.framing;
        const rendered_node = mapping[insertion.template_node] orelse return error.SourceBindingMismatch;
        const end = rendered.nodes[rendered_node].subtree_end;
        const at = if (end < rendered.nodes.len) rendered.nodes[end].record.framing.offset else normalized.len;
        var records: std.ArrayList(u8) = .empty;
        if (@import("page_restart_source.zig").find(links.items, insertion.template_node)) |link_index| {
            var last = insertion.last_in_owner;
            for (plan.insertions) |other| if (other.template_node == insertion.template_node) {
                last = other.last_in_owner;
            };
            try @import("page_restart_family_records.zig").append(scratch, &records, original_tree, links.items, link_index, insertion.template_node, section.paragraphs, last, char_count, limit);
            try patches.append(scratch, .{ .start = rendered.nodes[rendered_node].record.framing.offset, .end = at, .bytes = records.items, .order = patches.items.len });
            replaced[insertion.template_node] = true;
            continue;
        }
        try @import("paragraph_records.zig").append(scratch, &records, template, insertion.template_node, section.paragraphs[insertion.paragraph], version, char_count, insertion.last_in_owner, limit);
        try patches.append(scratch, .{ .start = at, .end = at, .bytes = records.items, .order = patches.items.len });
        if (plan.removals.len == 0 and previous_template != insertion.template_node) {
            const record = rendered.nodes[rendered_node].record.framing;
            const count_at = record.offset + record.raw.len - record.payload.len;
            const bytes = try scratch.dupe(u8, record.payload[0..4]);
            std.mem.writeInt(u32, bytes[0..4], std.mem.readInt(u32, bytes[0..4], .little) & 0x7fffffff, .little);
            try patches.append(scratch, .{ .start = count_at, .end = count_at + 4, .bytes = bytes, .order = patches.items.len });
        }
        previous_template = insertion.template_node;
    }
    for (plan.removals) |node| {
        const index = mapping[node] orelse return error.SourceBindingMismatch;
        const end = rendered.nodes[index].subtree_end;
        try patches.append(scratch, .{
            .start = rendered.nodes[index].record.framing.offset,
            .end = if (end < rendered.nodes.len) rendered.nodes[end].record.framing.offset else normalized.len,
            .bytes = &.{},
            .order = patches.items.len,
        });
    }
    if (plan.removals.len != 0) {
        const owner_api = @import("paragraph_owner.zig");
        const groups = try owner_api.inspectGroups(scratch, original_tree, version);
        const flows = try @import("../body/paragraph_flows.zig").Flows.build(scratch, original_tree, groups.items);
        const seen = try scratch.alloc(bool, original_tree.nodes.len);
        @memset(seen, false);
        var remaining = section.paragraphs.len;
        while (remaining != 0) {
            remaining -= 1;
            const p = section.paragraphs[remaining];
            const template = p.source_node orelse p.header_template orelse return error.MissingParagraphTemplate;
            const owner = try flows.get(template);
            const last = !seen[owner];
            seen[owner] = true;
            const node = p.source_node orelse continue;
            if (replaced[node]) continue;
            const record = rendered.nodes[mapping[node].?].record.framing;
            const at = record.offset + record.raw.len - record.payload.len;
            const old = std.mem.readInt(u32, record.payload[0..4], .little);
            const count = (old & 0x7fffffff) | @as(u32, if (last) 0x80000000 else 0);
            if (count == old) continue;
            const bytes = try scratch.alloc(u8, 4);
            std.mem.writeInt(u32, bytes[0..4], count, .little);
            try patches.append(scratch, .{ .start = at, .end = at + 4, .bytes = bytes, .order = patches.items.len });
        }
    }
    for (plan.list_additions, 0..) |add, source_node| {
        const remove = plan.list_removals[source_node];
        if (add == remove) continue;
        const index = mapping[source_node] orelse return error.SourceBindingMismatch;
        const record = rendered.nodes[index].record.framing;
        const at = record.offset + record.raw.len - record.payload.len;
        const count = try @import("paragraph_list_count.zig").read(original_tree, source_node);
        var encoded: [4]u8 = undefined;
        const bytes = try scratch.dupe(u8, try count.encode(&encoded, add, remove));
        try patches.append(scratch, .{ .start = at, .end = at + bytes.len, .bytes = bytes, .order = patches.items.len });
    }
    if (section.table_cell_sizes) |sizes| {
        const bindings = if (sizes.len != 0)
            try @import("table_display_bindings.zig").read(scratch, source, version, section.paragraphs)
        else
            &.{};
        for (sizes, 0..) |size, ordinal| {
            for (sizes[0..ordinal]) |earlier| if (earlier.source_list_node == size.source_list_node) return error.SourceBindingMismatch;
            var found = false;
            for (bindings) |binding| if (binding.list_node == size.source_list_node) {
                found = true;
                break;
            };
            if (!found or size.source_list_node >= mapping.len) return error.SourceBindingMismatch;
            const index = mapping[size.source_list_node] orelse return error.SourceBindingMismatch;
            const record = rendered.nodes[index].record.framing;
            const view = try (try @import("../body/list_header.zig").Header.parse(record.payload)).view(.observed8);
            const offset = record.payload.len - view.extra.len + 8;
            const payload = try @import("table_cell_size_payload.zig").write(scratch, record.payload, .observed8, .{ .width = size.width, .height = size.height }, limit);
            const at = record.offset + record.raw.len - record.payload.len + offset;
            try patches.append(scratch, .{ .start = at, .end = at + 8, .bytes = payload[offset .. offset + 8], .order = patches.items.len });
        }
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
