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
    return buildInternal(a, tree, sites, options, counters, null);
}

/// Only for the uninterrupted open-time parseWithContent -> collectParsed chain.
/// Raw callers retain buildWithCounters and its full source validation.
pub fn buildParsedWithCounters(a: std.mem.Allocator, parsed: *const tree_module.ParsedWithContent, sites: *const sites_module.Sites, options: sites_module.Options, counters: *scanner.Report) ![]scanner.Location {
    return buildInternal(a, &parsed.tree, sites, options, counters, parsed);
}

fn buildInternal(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, options: sites_module.Options, counters: *scanner.Report, parsed: ?*const tree_module.ParsedWithContent) ![]scanner.Location {
    if (tree.part_kind != .section) return error.InvalidPartKind;
    const locations = try a.alloc(?scanner.Location, tree.elements.len);
    defer a.free(locations);
    @memset(locations, null);
    const Context = struct {
        tree: *const tree_module.Tree,
        locations: []?scanner.Location,
        next_element: usize = 0,
        fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const start: scanner.BoundaryEvent = switch (value) {
                .text_start => |item| .{ .location = item.location, .tag = item.tag, .scope = item.scope },
                .run_start => |item| item,
                else => return,
            };
            const low = try self.tree.startTagIndexForward(start.tag.raw, &self.next_element);
            try location(raw, low, start.location);
        }
        fn location(raw: *anyopaque, index: usize, value: scanner.Location) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (index >= self.locations.len or self.locations[index] != null) return error.SourceBindingMismatch;
            self.locations[index] = value;
        }
    };
    var context: Context = .{ .tree = tree, .locations = locations };
    var report = counters.*;
    const scan_options: scanner.Options = .{ .branch_policy = options.branch_policy, .max_attribute_bytes = options.max_attribute_bytes, .max_text_bytes = options.max_text_bytes };
    const reused = if (parsed) |fresh| try scanner.scanParsedLocations(a, fresh, scan_options, &report, .{ .context = &context, .on_location = Context.location }) else false;
    if (!reused) try scanner.scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidPartOrdinal, tree.item_index, scan_options, &report, .{ .context = &context, .on_event = Context.event });
    const output = try a.alloc(scanner.Location, sites.items.len);
    errdefer a.free(output);
    for (sites.items, output) |site, *location| {
        if (site.element_index >= locations.len) return error.InvalidTextSites;
        location.* = locations[site.element_index] orelse return error.SourceBindingMismatch;
    }
    counters.* = report;
    return output;
}
