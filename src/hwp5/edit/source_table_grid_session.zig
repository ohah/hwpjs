//! Prepare a current HWP5 section and its source basis; history owns publication.
//! Temporary CFB validation is never retained in native history.
const std = @import("std");
const model = @import("../../model/document.zig");
const Source = @import("../text_source.zig").Source;
const wire = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Version = @import("../version.zig").Version;
pub const Edit = struct {
    section: usize,
    table_node: usize,
    expected_rows: u32,
    expected_columns: u32,
    command: @import("../../model/table_grid_edit_plan.zig").Command,
    layout: @import("../body/list_header.zig").Layout,
};
const TableSite = struct { ordinal: usize, total: usize };
fn tableSite(raw: []const u8, selected: usize) !TableSite {
    var it = wire.Iterator.init(raw, .{});
    var node: usize = 0;
    var count: usize = 0;
    var ordinal: ?usize = null;
    while (try it.next()) |record| : (node += 1) {
        if (record.tag != 77) continue;
        if (node == selected) ordinal = count;
        count += 1;
    }
    return .{ .ordinal = ordinal orelse return error.InvalidSourceTableTarget, .total = count };
}
fn materializedSite(raw: []const u8, site: TableSite) !usize {
    var it = wire.Iterator.init(raw, .{});
    var node: usize = 0;
    var count: usize = 0;
    var target: ?usize = null;
    while (try it.next()) |record| : (node += 1) {
        if (record.tag != 77) continue;
        if (count == site.ordinal) target = node;
        count += 1;
    }
    if (count != site.total) return error.SourceBindingMismatch;
    return target orelse error.InvalidSourceTableTarget;
}

/// Saved bytes contain the CURRENT section text and resource intents. Source
/// record ordinals can move during serialization, so resolve the preserved TABLE
/// order instead of reusing the old node index. Generated objects are excluded
/// by the session before preparation.
pub fn prepare(a: std.mem.Allocator, current_file: []const u8, active_source: []const u8, version: Version, edit: Edit, original_record_count: usize, style_count: usize) !model.Section {
    const site = try tableSite(active_source, edit.table_node);
    var current = try Source.open(a, current_file);
    defer current.deinit();
    const serialized = try current.decodeSection(a, edit.section);
    defer a.free(serialized);
    const target = try materializedSite(serialized, site);
    const changed_file = try @import("source_table_grid_file.zig").transform(a, current_file, .{
        .section = edit.section,
        .table_node = target,
        .expected_rows = edit.expected_rows,
        .expected_columns = edit.expected_columns,
        .command = edit.command,
        .layout = edit.layout,
    }, .{});
    defer a.free(changed_file);
    var changed = try Source.open(a, changed_file);
    defer changed.deinit();
    const raw = try changed.decodeSection(a, edit.section);
    errdefer a.free(raw);
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
