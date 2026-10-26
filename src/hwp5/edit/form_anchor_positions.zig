//! Current form positions reuse observed source links and owned-token mapping.
const std = @import("std");
const Paragraph = @import("../../model/document.zig").Paragraph;
pub const Anchor = struct { control_node: usize, object_node: usize, paragraph: usize, source_unit: usize, current_unit: u32 };

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, paragraphs: []const Paragraph) ![]Anchor {
    var tree = try @import("source_tree.zig").parse(a, bytes, version, .{});
    defer tree.deinit(a);
    var report = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer report.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    const result = try a.alloc(Anchor, report.links.len);
    errdefer a.free(result);
    for (report.links, report.forms.forms, result, 0..) |link, form, *row, index| {
        const paragraph = owners.get(@intCast(link.paragraph_node)) orelse return error.MissingCurrentFormOwner;
        row.* = .{ .control_node = form.control_node, .object_node = form.object_node, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = try @import("current_control_anchor.zig").position(report.links, index, paragraphs[paragraph]) };
    }
    return result;
}
