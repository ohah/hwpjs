//! Merge current run output, retaining left paragraph settings and run styles.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn write(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    try @import("paragraph_merge_policy.zig").validate(a, tree, left, right);
    const model = @import("paragraph_joined_values.zig");
    var pieces = [_]model.Piece{
        .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .generated_id = left.generated_id, .first_site = 0, .site_count = left.sites.items.len },
        .{ .template_element = right.template_element, .source_ordinal = right.source_ordinal, .generated_id = right.generated_id, .first_site = left.sites.items.len, .site_count = right.sites.items.len },
    };
    const count = std.math.add(usize, left.sites.items.len, right.sites.items.len) catch return error.LimitExceeded;
    const rows = try a.alloc(@import("text_sites.zig").Site, count);
    defer a.free(rows);
    @memcpy(rows[0..left.sites.items.len], left.sites.items);
    @memcpy(rows[left.sites.items.len..], right.sites.items);
    // This view borrows strings; the writer never mutates or retains it.
    const borrowed: model.Joined = .{ .pieces = &pieces, .sites = .{ .items = rows } };
    return @import("paragraph_joined_xml.zig").write(a, tree, &borrowed, options, limit);
}
