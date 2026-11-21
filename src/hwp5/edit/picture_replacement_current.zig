//! Fixed-size reference patch; checkpoint owns this source and the COW ledger.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Request = struct {
    owner: @import("../../model/picture_replacement.zig").Owner,
    image: []const u8,
    ticket: @import("../../model/history_mutation_epoch.zig").Ticket,
};
pub fn validateOwner(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, current: model.Section, picture: usize) !void {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const root = try @import("picture_size_protection.zig").rootOwner(tree, picture);
    const anchors = try @import("drawing_anchor_positions.zig").read(a, raw, version, current.paragraphs);
    defer a.free(anchors);
    var selected: ?@import("drawing_anchor_positions.zig").Anchor = null;
    for (anchors) |anchor| if (anchor.control_node == root) {
        if (selected != null) return error.AmbiguousPictureResourceTarget;
        selected = anchor;
    };
    const host = selected orelse return error.UnsupportedPictureReplacementHost;
    const end = try std.math.add(u32, host.current_unit, 8);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, raw, version, current);
    defer a.free(spans);
    for (spans) |span| {
        const before_end = span.begin.paragraph < host.paragraph or (span.begin.paragraph == host.paragraph and span.begin.unit < end);
        const after_start = span.end.paragraph > host.paragraph or (span.end.paragraph == host.paragraph and span.end.unit > host.current_unit);
        if (before_end and after_start) return error.PictureReplacementReadOnly;
    }
    // Table70 bit20 protects size, not image data. This operation never changes
    // geometry; do not invent a general HWP5 lock bit from opaque component flags.
}
pub fn ordinal(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, picture: usize) !u16 {
    const sites = try @import("picture_sources.zig").read(a, raw, version, .base73);
    defer a.free(sites);
    var result: ?u16 = null;
    for (sites) |site| if (site.picture_node == picture) {
        if (result != null) return error.AmbiguousPictureResourceTarget;
        result = site.bin_data_id;
    };
    return result orelse error.InvalidPictureResourceTarget;
}
pub fn patch(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, picture: usize, expected: u16, replacement: u16) ![]u8 {
    if (expected == 0 or replacement == 0 or try ordinal(a, raw, version, picture) != expected) return error.StalePictureReplacementOwner;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (picture >= tree.nodes.len) return error.InvalidPictureResourceTarget;
    _ = try @import("picture_size_protection.zig").rootOwner(tree, picture);
    const record = tree.nodes[picture].record.framing;
    if (record.tag != 85 or record.payload.len < 73) return error.InvalidPictureResourceTarget;
    const offset = record.offset + record.raw.len - record.payload.len + 71;
    const next = try a.dupe(u8, raw);
    std.mem.writeInt(u16, next[offset..][0..2], replacement, .little);
    return next;
}
pub fn section(a: std.mem.Allocator, current: model.Section, raw: []const u8, styles: []const usize, version: @import("../version.zig").Version, picture: usize, expected: u16, replacement: u16) !model.Section {
    const bytes = try patch(a, raw, version, picture, expected, replacement);
    errdefer a.free(bytes);
    const offsets = try a.dupe(usize, styles);
    errdefer a.free(offsets);
    var result = try @import("../../model/clone.zig").section(a, current);
    const original_count = if (result.rebased_source) |basis| basis.original_record_count else result.source_record_count;
    if (result.rebased_source) |*basis| basis.deinit(a);
    result.rebased_source = .{ .bytes = bytes, .style_offsets = offsets, .original_record_count = original_count };
    return result;
}
