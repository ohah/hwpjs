//! Derive exact public scanner locations, not another ordinal implementation.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const scanner = @import("section_text.zig");
const sites_module = @import("text_sites.zig");

pub fn build(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, options: sites_module.Options) ![]scanner.Location {
    var counters: scanner.Report = .{};
    return buildWithCounters(a, tree, sites, options, &counters);
}

/// Use one report in spine order to match the public document-wide ordinals.
/// Report changes commit only after all bindings and allocations succeed.
pub fn buildWithCounters(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, options: sites_module.Options, counters: *scanner.Report) ![]scanner.Location {
    if (tree.part_kind != .section) return error.InvalidPartKind;
    const locations = try a.alloc(?scanner.Location, tree.elements.len);
    defer a.free(locations);
    @memset(locations, null);
    const Context = struct {
        tree: *const tree_module.Tree,
        locations: []?scanner.Location,
        fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const start: scanner.BoundaryEvent = switch (value) {
                .text_start => |item| .{ .location = item.location, .tag = item.tag, .scope = item.scope },
                .run_start => |item| item,
                else => return,
            };
            const base = @intFromPtr(self.tree.source.ptr);
            const pointer = @intFromPtr(start.tag.raw.ptr);
            if (pointer < base or pointer - base > self.tree.source.len) return error.InvalidSourceSpan;
            const at = pointer - base;
            var low: usize = 0;
            var high = self.tree.elements.len;
            while (low < high) {
                const mid = low + (high - low) / 2;
                if (self.tree.elements[mid].start_tag.start < at) low = mid + 1 else high = mid;
            }
            if (low == self.tree.elements.len or self.tree.elements[low].start_tag.start != at or self.locations[low] != null) return error.SourceBindingMismatch;
            self.locations[low] = start.location;
        }
    };
    var context: Context = .{ .tree = tree, .locations = locations };
    var report = counters.*;
    try scanner.scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidPartOrdinal, tree.item_index, .{ .branch_policy = options.branch_policy, .max_attribute_bytes = options.max_attribute_bytes, .max_text_bytes = options.max_text_bytes }, &report, .{ .context = &context, .on_event = Context.event });
    const output = try a.alloc(scanner.Location, sites.items.len);
    errdefer a.free(output);
    for (sites.items, output) |site, *location| {
        if (site.element_index >= locations.len) return error.InvalidTextSites;
        location.* = locations[site.element_index] orelse return error.SourceBindingMismatch;
    }
    counters.* = report;
    return output;
}
