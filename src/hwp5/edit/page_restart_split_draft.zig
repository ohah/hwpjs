//! Owned restart split draft; family records own CTRL_HEADER relocation on save.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const Draft = @import("paragraph_split.zig").Draft;

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, at: u32, id: u32, char_count: usize) !Draft {
    if (id == 0 or id == p.instance_id) return error.InvalidParagraphInstanceId;
    const plan = try @import("page_restart_split_plan.zig").read(a, source, version, p, at, char_count);
    const bytes = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(bytes);
    try @import("character_runs.zig").validate(p.character_runs, bytes, char_count);
    const left_bytes = try a.alloc(u8, @as(usize, at) * 2 + 2);
    defer a.free(left_bytes);
    @memcpy(left_bytes[0 .. left_bytes.len - 2], bytes[0 .. @as(usize, at) * 2]);
    left_bytes[left_bytes.len - 2 ..][0..2].* = .{ 13, 0 };
    var left = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer left.deinit(a);
    var right = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer right.deinit(a);
    const replace = @import("split_text_projection.zig").replace;
    try replace(a, &left, left_bytes, at, @intCast(bytes.len / 2 - 1));
    try replace(a, &right, bytes[@as(usize, at) * 2 ..], 0, at);
    left.deferred_direct_records = if (plan.destination == .left) 1 else 0;
    right.source_node = null;
    right.header_template = plan.template_node;
    right.instance_id = id;
    right.break_before = null;
    right.deferred_direct_records = if (plan.destination == .right) 1 else 0;
    left.restart_control_source = if (plan.destination == .left) p.restart_control_source else null;
    right.restart_control_source = if (plan.destination == .right) p.restart_control_source else null;
    return .{ .left = left, .right = right };
}
