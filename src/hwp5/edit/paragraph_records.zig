//! Generated paragraph records. Owner ordering/counts belong to structure writer.
const std = @import("std");
const model = @import("../../model/document.zig");
const framing = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Version = @import("../version.zig").Version;
const writer = @import("../record_writer.zig");

/// last_in_owner must come from validated logical topology, not count high bit.
/// Failure never appends a partial paragraph to the caller's output.
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), template: framing.Record, template_node: u32, p: model.Paragraph, version: Version, char_count: usize, last_in_owner: bool, limit: usize) !void {
    if (p.source_node != null or p.header_template != template_node or template.tag != 66) return error.SourceBindingMismatch;
    if (p.instance_id == 0) return error.InvalidParagraphInstanceId;
    const parsed = try Header.parse(template.payload, version);
    if (parsed.extra.len != 0 or (parsed.merge_tracking orelse 0) != 0) return error.UnsupportedParagraphExtension;
    if (p.field_attributes != null or p.formula_results != null or p.deferred_direct_records != 0) return error.UnsupportedStructuralControl;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    if (template.level == std.math.maxInt(u10) or p.character_runs.len > 65535 or out.items.len > limit) return error.LimitExceeded;
    const remaining = limit - out.items.len;
    const text = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(text);
    try @import("plain_text_content.zig").validatePlain(text);
    try @import("character_runs.zig").validate(p.character_runs, text, char_count);
    const units = std.math.cast(u32, text.len / 2) orelse return error.LimitExceeded;
    if (units > 0x7fffffff) return error.LimitExceeded;
    const header = try a.dupe(u8, template.payload);
    defer a.free(header);
    Header.writeTextCounts(header, units, @intCast(p.character_runs.len), 0);
    std.mem.writeInt(u32, header[0..4], units | (if (last_in_owner) @as(u32, 0x80000000) else 0), .little);
    std.mem.writeInt(u16, header[Header.para_shape_id_offset..][0..2], p.para_shape_id, .little);
    header[Header.style_id_offset] = p.style_id;
    header[Header.break_flags_offset] = 0; // New continuation does not duplicate section/page breaks.
    std.mem.writeInt(u32, header[Header.instance_id_offset..][0..4], p.instance_id, .little);
    const runs = try a.alloc(u8, p.character_runs.len * 8);
    defer a.free(runs);
    for (p.character_runs, 0..) |run, i| {
        std.mem.writeInt(u32, runs[i * 8 ..][0..4], run.start_unit, .little);
        std.mem.writeInt(u32, runs[i * 8 + 4 ..][0..4], run.char_shape_id, .little);
    }
    var draft: std.ArrayList(u8) = .empty;
    defer draft.deinit(a);
    try writer.append(a, &draft, 66, template.level, header, remaining);
    try writer.append(a, &draft, 67, template.level + 1, text, remaining);
    try writer.append(a, &draft, 68, template.level + 1, runs, remaining);
    try out.appendSlice(a, draft.items);
}
