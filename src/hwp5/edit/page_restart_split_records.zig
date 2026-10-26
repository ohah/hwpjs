//! Restart paragraph records; family topology and session commit are external.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const Header = @import("../body/paragraph_header.zig").Header;
const Record = @import("../record.zig").Record;
const writer = @import("../record_writer.zig");

pub fn appendPair(a: std.mem.Allocator, out: *std.ArrayList(u8), source: []const u8, version: Version, original: model.Paragraph, draft: @import("paragraph_split.zig").Draft, at: u32, last_right: bool, char_count: usize, limit: usize) !void {
    if (out.items.len > limit) return error.LimitExceeded;
    const plan = try @import("page_restart_split_plan.zig").read(a, source, version, original, at, char_count);
    if (draft.left.source_node != original.source_node or draft.left.header_template != null or draft.left.instance_id != original.instance_id or draft.right.source_node != null or draft.right.header_template != original.source_node or draft.right.instance_id == 0 or draft.right.instance_id == original.instance_id or draft.right.break_before != null or draft.left.parent_node != original.parent_node or draft.right.parent_node != original.parent_node or draft.left.deferred_direct_records != @as(usize, if (plan.destination == .left) 1 else 0) or draft.right.deferred_direct_records != @as(usize, if (plan.destination == .right) 1 else 0)) return error.SourceBindingMismatch;
    const text = try @import("plain_text_content.zig").textBytes(a, original);
    defer a.free(text);
    const left = try @import("plain_text_content.zig").textBytes(a, draft.left);
    defer a.free(left);
    const right = try @import("plain_text_content.zig").textBytes(a, draft.right);
    defer a.free(right);
    const cut = @as(usize, at) * 2;
    if (left.len != cut + 2 or !std.mem.eql(u8, left[0..cut], text[0..cut]) or !std.mem.eql(u8, left[cut..], &.{ 13, 0 }) or !std.mem.eql(u8, right, text[cut..])) return error.SourceBindingMismatch;
    var tree = try @import("source_tree.zig").parse(a, source, version, .{});
    defer tree.deinit(a);
    for (tree.nodes) |node| if (node.record.value == .header and node.record.value.header.instance_id == draft.right.instance_id)
        return error.InvalidParagraphInstanceId;
    const header = tree.nodes[plan.paragraph_node].record.framing;
    const control = tree.nodes[plan.control_node].record.framing;
    if (header.level == std.math.maxInt(u10) or control.level != header.level + 1) return error.SourceBindingMismatch;
    var staged: std.ArrayList(u8) = .empty;
    defer staged.deinit(a);
    const budget = limit - out.items.len;
    try appendParagraph(a, &staged, header, control, draft.left, left, false, false, plan.destination == .left, char_count, budget);
    try appendParagraph(a, &staged, header, control, draft.right, right, true, last_right, plan.destination == .right, char_count, budget);
    try out.appendSlice(a, staged.items);
}

/// Caller validates the source binding, current family and single control owner.
pub fn appendParagraph(a: std.mem.Allocator, out: *std.ArrayList(u8), template: Record, control: Record, p: model.Paragraph, text: []const u8, generated: bool, last: bool, has_restart: bool, char_count: usize, limit: usize) !void {
    if (p.field_attributes != null or p.formula_results != null or p.range_tags == null or p.range_tags.?.len != 0) return error.UnsupportedStructuralControl;
    // Flattened bytes alone cannot establish current token identity: the mask
    // writer consumes kind/encoding/positions from the current model as well.
    try @import("token_ownership.zig").validate(p, text);
    if (p.character_runs.len > 65535 or text.len / 2 > 0x7fffffff) return error.LimitExceeded;
    try @import("character_runs.zig").validate(p.character_runs, text, char_count);
    const header = try a.dupe(u8, template.payload);
    defer a.free(header);
    Header.writeTextCounts(header, @intCast(text.len / 2), @intCast(p.character_runs.len), 0);
    std.mem.writeInt(u32, header[Header.character_count_offset..][0..4], @as(u32, @intCast(text.len / 2)) | (if (last) @as(u32, 0x80000000) else 0), .little);
    std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], p.instance_id, .little);
    std.mem.writeInt(u16, header[Header.para_shape_id_offset..][0..2], p.para_shape_id, .little);
    header[Header.style_id_offset] = p.style_id;
    header[Header.break_flags_offset] = try @import("paragraph_breaks.zig").current(generated, template.payload[Header.break_flags_offset], p.break_before);
    try @import("line_break_mask.zig").write(header, p.tokens);
    const field = header[Header.control_mask_offset..][0..4];
    const mask = std.mem.readInt(u32, field, .little);
    std.mem.writeInt(u32, field, (mask & ~@as(u32, 1 << 21)) | (if (has_restart) @as(u32, 1 << 21) else 0), .little);
    if (generated) try writer.append(a, out, 66, template.level, header, limit) else {
        try appendRaw(a, out, template.raw[0 .. template.raw.len - template.payload.len], limit);
        try appendRaw(a, out, header, limit);
    }
    try writer.append(a, out, 67, template.level + 1, text, limit);
    const runs = try @import("character_run_payload.zig").encode(a, p.character_runs);
    defer a.free(runs);
    try writer.append(a, out, 68, template.level + 1, runs, limit);
    if (has_restart) try appendRaw(a, out, control.raw, limit);
}

fn appendRaw(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (out.items.len > limit or bytes.len > limit - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
