//! Own one current section after scalar surgery. History owns publication.
const std = @import("std");
const model = @import("../../model/document.zig");
const wire = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
pub fn project(a: std.mem.Allocator, raw: []u8, version: @import("../version.zig").Version, original_record_count: usize, style_count: usize) !model.Section {
    var projected = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer projected.deinit(a);
    if (projected.sections.len != 1) return error.SourceBindingMismatch;
    const offsets = try a.alloc(usize, projected.sections[0].paragraphs.len);
    errdefer a.free(offsets);
    var it = wire.Iterator.init(raw, .{});
    var count: usize = 0;
    var node: usize = 0;
    while (try it.next()) |record| : (node += 1) {
        if (record.tag != 66) continue;
        if (count >= offsets.len) return error.SourceBindingMismatch;
        const header = try Header.parse(record.payload, version);
        if (header.style_id >= style_count or @as(usize, projected.sections[0].paragraphs[count].source_node orelse return error.SourceBindingMismatch) != node) return error.SourceBindingMismatch;
        offsets[count] = record.offset + record.raw.len - record.payload.len + Header.style_id_offset;
        count += 1;
    }
    if (count != offsets.len) return error.SourceBindingMismatch;
    var result = projected.sections[0];
    // Transfer this one section out of the temporary document.
    projected.sections[0] = .{ .paragraphs = try a.alloc(model.Paragraph, 0), .source_record_count = 0 };
    result.rebased_source = .{ .bytes = raw, .style_offsets = offsets, .original_record_count = original_record_count };
    return result;
}
