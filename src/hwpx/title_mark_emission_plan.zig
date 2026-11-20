//! Detached current-title placement, not text editing or metadata admission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Segment = @import("paragraph_text_positions.zig").Segment;
const namespace = @import("title_marker_namespace.zig");
pub const Plan = struct {
    bodies: []?[]u8,
    removals: []usize,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        for (self.bodies) |body| if (body) |bytes| a.free(bytes);
        a.free(self.bodies);
        a.free(self.removals);
        self.* = undefined;
    }
};
fn sourceEnd(tree: *const Tree, paragraph: *const Paragraph, segment: Segment) !usize {
    if (segment.kind == .text) {
        if (segment.index >= paragraph.sites.items.len) return error.InvalidTextSites;
        return paragraph.sites.items[segment.index].end;
    }
    if (segment.index >= tree.elements.len) return error.SourceBindingMismatch;
    return tree.elements[segment.index].end;
}
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, limit: usize) !Plan {
    const titles = paragraph.title_positions orelse return error.MissingTitlePositions;
    const bodies = try a.alloc(?[]u8, paragraph.sites.items.len);
    @memset(bodies, null);
    errdefer {
        for (bodies) |body| if (body) |bytes| a.free(bytes);
        a.free(bodies);
    }
    var markers: std.ArrayList(namespace.Marker) = .empty;
    defer {
        namespace.release(a, markers.items);
        markers.deinit(a);
    }
    if (titles.len == 0) return .{ .bodies = bodies, .removals = try a.alloc(usize, 0) };
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(segments);
    var natural_index: usize = 0;
    var natural_unit: usize = 0;
    var destination: usize = 0;
    var previous_source: ?usize = null;
    var previous_unit: usize = 0;
    var moved = false;
    for (titles) |title| {
        if (!@import("title_mark_axis.zig").retained(tree, title.element_index)) return error.SourceBindingMismatch;
        const marker = tree.elements[title.element_index];
        const text = marker.parent.?;
        const run = tree.elements[text].parent.?;
        if (tree.elements[run].parent != paragraph.template_element or
            (if (previous_source) |before| marker.start_tag.start <= before else false) or title.unit < previous_unit)
            return error.SourceBindingMismatch;
        previous_source = marker.start_tag.start;
        previous_unit = title.unit;
        while (natural_index < segments.len and try sourceEnd(tree, paragraph, segments[natural_index]) <= marker.start_tag.start) : (natural_index += 1)
            natural_unit = segments[natural_index].end_unit;
        if (natural_unit != title.unit) moved = true;
        while (destination < segments.len and (segments[destination].kind != .text or
            segments[destination].end_unit < title.unit)) : (destination += 1)
        {}
        if (destination == segments.len or segments[destination].start_unit > title.unit) return error.InvalidTextPosition;
        const segment = segments[destination];
        try markers.append(a, .{ .element = title.element_index, .site = segment.index, .unit = std.math.cast(u32, title.unit - segment.start_unit) orelse return error.LimitExceeded });
    }
    // Relocate the complete ordered cohort when any marker moves. Keeping only
    // moved markers can reverse equal-position markers across a site boundary.
    if (!moved) return .{ .bodies = bodies, .removals = try a.alloc(usize, 0) };
    try namespace.prepare(a, tree, paragraph.template_element, &paragraph.sites, markers.items, limit);
    const groups = try a.alloc(std.ArrayList(@import("title_mark_site_content.zig").Marker), bodies.len);
    for (groups) |*group| group.* = .empty;
    defer {
        for (groups) |*group| group.deinit(a);
        a.free(groups);
    }
    const removals = try a.alloc(usize, markers.items.len);
    errdefer a.free(removals);
    for (markers.items, removals) |marker, *removed| {
        try groups[marker.site].append(a, .{ .unit = marker.unit, .xml = marker.bytes });
        removed.* = marker.element;
    }
    var total: usize = 0;
    for (groups, 0..) |group, site| if (group.items.len != 0) {
        const body = try @import("title_mark_site_content.zig").write(a, paragraph.sites.items[site].text, group.items, limit -| total);
        bodies[site] = body;
        total = std.math.add(usize, total, body.len) catch return error.LimitExceeded;
        if (total > limit) return error.LimitExceeded;
    };
    return .{ .bodies = bodies, .removals = removals };
}
