//! Field-disjoint original body and table-cell paragraphs; no memo anchor relocation.
const std = @import("std");
const Version = @import("../version.zig").Version;

pub fn nodes(a: std.mem.Allocator, source: []const u8, version: Version) ![]u32 {
    if (!try @import("memo_source_retention.zig").hasLists(source)) return a.alloc(u32, 0);
    try @import("source_policy.zig").validateMemoTransaction(a, source, version);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer document.deinit(a);
    const flows = try @import("paragraph_flow_snapshot.zig").read(a, source, version, document.sections[0]);
    defer a.free(flows);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, source, version, document.sections[0]);
    defer a.free(spans);
    var result: std.ArrayList(u32) = .empty;
    errdefer result.deinit(a);
    for (document.sections[0].paragraphs, 0..) |paragraph, index| {
        const root_body = paragraph.parent_node == null and flows[index].top_level and flows[index].host == .body;
        const cell_body = paragraph.parent_node != null and !flows[index].top_level and flows[index].host == .table_cell;
        if (!root_body and !cell_body) continue;
        var overlaps = false;
        for (spans) |span| overlaps = overlaps or index >= span.begin.paragraph and index <= span.end.paragraph;
        if (!overlaps) try result.append(a, try paragraph.originalNode());
    }
    return result.toOwnedSlice(a);
}

pub fn target(a: std.mem.Allocator, source: []const u8, version: Version, node: u32) !bool {
    const eligible = try nodes(a, source, version);
    defer a.free(eligible);
    return std.mem.indexOfScalar(u32, eligible, node) != null;
}
