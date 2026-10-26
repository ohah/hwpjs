//! Shared field protection/invalidation for source-addressed inline leaf edits.
const std = @import("std");
const Dirty = @import("text_sites_save.zig").FieldDirty;
pub fn note(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, section: usize, source: *const @import("source_field_analysis.zig").Source, leaf: usize, unsupported: anyerror, output: *std.ArrayList(Dirty)) !void {
    if (leaf >= tree.elements.len) return error.SourceBindingMismatch;
    const element = tree.elements[leaf];
    for (source.report.markers) |marker| {
        if (marker.section_ordinal != section or marker.kind != .begin or marker.matched_marker_index != null) continue;
        const envelope = try @import("field_source_scope.zig").forBegin(tree, marker.element_index);
        if (envelope.contains(element.start_tag.start)) return error.ProtectedFieldRange;
    }
    for (source.fields) |field| {
        if (field.section != section or field.content_end <= element.start_tag.start or element.end <= field.content_start) continue;
        if (element.start_tag.start < field.content_start or element.end > field.content_end) return unsupported;
        const marker = source.report.markers[field.begin_marker];
        if (!@import("field_text_kind.zig").supported(marker.begin.?.type_raw orelse "")) return unsupported;
        var found = false;
        for (output.items) |*value| if (value.element_index == marker.element_index) {
            value.dirty = true;
            found = true;
            break;
        };
        if (!found) try output.append(a, .{ .element_index = marker.element_index, .dirty = true });
    }
}
