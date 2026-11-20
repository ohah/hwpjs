//! Two scoped source-order visits for marker provenance and destination context.
//! Reuses the XML namespace/tag parser; no global or cross-request namespace cache.
const std = @import("std");
const xml = @import("../xml/root.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Dependency = struct { name: @import("../xml/text.zig").View, prefix: []const u8, attribute: bool, uri: []u8 };
pub const Marker = struct {
    element: usize,
    site: usize,
    unit: u32,
    dependencies: []Dependency = &.{},
    bytes: []const u8 = "",
    owned_bytes: ?[]u8 = null,
    next_target: ?usize = null,
};
pub fn release(a: std.mem.Allocator, markers: []Marker) void {
    for (markers) |marker| {
        for (marker.dependencies) |dependency| a.free(dependency.uri);
        a.free(marker.dependencies);
        if (marker.owned_bytes) |bytes| a.free(bytes);
    }
}
fn walk(a: std.mem.Allocator, tree: *const Tree, owner: usize, context: anytype) !void {
    var ancestors: std.ArrayList(usize) = .empty;
    defer ancestors.deinit(a);
    var current = owner;
    while (true) {
        if (current >= tree.elements.len or ancestors.items.len >= tree.elements.len) return error.SourceBindingMismatch;
        try ancestors.append(a, current);
        const parent = tree.elements[current].parent orelse break;
        if (parent >= current) return error.SourceBindingMismatch;
        current = parent;
    }
    var scope: xml.namespaces.State = .{};
    defer scope.deinit(a);
    var remaining = ancestors.items.len;
    while (remaining != 0) {
        remaining -= 1;
        var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, ancestors.items[remaining]);
        defer tag.deinit(a);
        _ = try scope.enter(a, tag, .{});
    }
    const Frame = struct { element: usize, marker: usize };
    var frames: std.ArrayList(Frame) = .empty;
    defer frames.deinit(a);
    var iterator = try @import("paragraph_owned_elements.zig").Iterator.init(tree, owner);
    while (try iterator.next()) |index| {
        const parent = tree.elements[index].parent orelse return error.SourceBindingMismatch;
        while (frames.items.len != 0 and frames.items[frames.items.len - 1].element != parent) {
            const frame = frames.pop().?;
            scope.leave(a, frame.marker);
        }
        if (frames.items.len == 0 and parent != owner) return error.SourceBindingMismatch;
        var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, index);
        defer tag.deinit(a);
        const marker = try scope.enter(a, tag, .{});
        try context.note(index, tag, &scope);
        try frames.append(a, .{ .element = index, .marker = marker });
    }
}
fn declaration(name: @import("../xml/text.zig").View) !?[]const u8 {
    const qname = try xml.qname.parse(name);
    if (qname.prefix) |prefix| {
        if (prefix.equals("xmlns", false)) return qname.local.raw;
    } else if (qname.local.equals("xmlns", false)) return "";
    return null;
}
fn dependencies(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State) ![]Dependency {
    var declared: std.StringHashMapUnmanaged(void) = .empty;
    defer declared.deinit(a);
    for (tag.attributes) |attribute| if (try declaration(attribute.name)) |prefix| try declared.put(a, prefix, {});
    var seen: std.StringHashMapUnmanaged(void) = .empty;
    defer seen.deinit(a);
    var output: std.ArrayList(Dependency) = .empty;
    errdefer {
        for (output.items) |item| a.free(item.uri);
        output.deinit(a);
    }
    var index: usize = 0;
    while (index <= tag.attributes.len) : (index += 1) {
        const attribute = index != 0;
        const name = if (attribute) tag.attributes[index - 1].name else tag.name;
        if (attribute and (try declaration(name)) != null) continue;
        const qname = try xml.qname.parse(name);
        if (attribute and qname.prefix == null) continue;
        const prefix = if (qname.prefix) |value| value.raw else "";
        if (std.mem.eql(u8, prefix, "xml") or declared.contains(prefix) or seen.contains(prefix)) continue;
        const expanded = if (attribute) try scope.expandAttribute(name) else try scope.expandElement(name);
        const uri = try a.dupe(u8, expanded.uri);
        output.append(a, .{ .name = name, .prefix = prefix, .attribute = attribute, .uri = uri }) catch |err| {
            a.free(uri);
            return err;
        };
        try seen.put(a, prefix, {});
    }
    return output.toOwnedSlice(a);
}
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, owner: usize, sites: *const @import("text_sites.zig").Sites, markers: []Marker, limit: usize) !void {
    var sources: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer sources.deinit(a);
    for (markers, 0..) |marker, index| {
        if ((try sources.getOrPut(a, marker.element)).found_existing) return error.SourceBindingMismatch;
        sources.getPtr(marker.element).?.* = index;
    }
    const Capture = struct {
        a: std.mem.Allocator,
        markers: []Marker,
        sources: *const std.AutoHashMapUnmanaged(usize, usize),
        fn note(self: *@This(), index: usize, tag: xml.tags.Tag, scope: *const xml.namespaces.State) !void {
            const selected = self.sources.get(index) orelse return;
            self.markers[selected].dependencies = try dependencies(self.a, tag, scope);
        }
    };
    var capture: Capture = .{ .a = a, .markers = markers, .sources = &sources };
    try walk(a, tree, owner, &capture);
    var targets: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer targets.deinit(a);
    for (markers, 0..) |*marker, index| {
        if (marker.site >= sites.items.len) return error.InvalidTextSites;
        const element = sites.items[marker.site].element_index;
        marker.next_target = targets.get(element);
        try targets.put(a, element, index);
    }
    const Destination = struct {
        a: std.mem.Allocator,
        tree: *const Tree,
        markers: []Marker,
        targets: *const std.AutoHashMapUnmanaged(usize, usize),
        limit: usize,
        fn note(self: *@This(), index: usize, _: xml.tags.Tag, scope: *const xml.namespaces.State) !void {
            var next = self.targets.get(index);
            while (next) |selected| {
                const marker = &self.markers[selected];
                const raw = self.tree.sourceOf(marker.element);
                if (raw.len > self.limit) return error.LimitExceeded;
                var additions: std.ArrayList(u8) = .empty;
                defer additions.deinit(self.a);
                for (marker.dependencies) |dependency| {
                    const actual: ?xml.namespaces.ExpandedName = (if (dependency.attribute) scope.expandAttribute(dependency.name) else scope.expandElement(dependency.name)) catch |err| switch (err) {
                        error.UnboundXmlPrefix => null,
                        else => return err,
                    };
                    if (actual) |name| if (std.mem.eql(u8, name.uri, dependency.uri)) continue;
                    try additions.appendSlice(self.a, " xmlns");
                    if (dependency.prefix.len != 0) {
                        try additions.append(self.a, ':');
                        try additions.appendSlice(self.a, dependency.prefix);
                    }
                    try additions.appendSlice(self.a, "=\"");
                    const encoded = try @import("../xml/attribute_writer.zig").encode(self.a, dependency.uri, self.limit -| additions.items.len);
                    defer self.a.free(encoded);
                    try additions.appendSlice(self.a, encoded);
                    try additions.append(self.a, '"');
                    if (additions.items.len > self.limit) return error.LimitExceeded;
                }
                if (additions.items.len == 0) marker.bytes = raw else {
                    var original = try @import("xml_part_attributes.zig").parseStartTag(self.a, self.tree, marker.element);
                    defer original.deinit(self.a);
                    const opening = self.tree.elements[marker.element].start_tag;
                    const at = opening.end - opening.start - @as(usize, if (original.kind == .empty) 2 else 1);
                    if (raw.len > self.limit or additions.items.len > self.limit - raw.len) return error.LimitExceeded;
                    const result = try std.mem.concat(self.a, u8, &.{ raw[0..at], additions.items, raw[at..] });
                    marker.owned_bytes = result;
                    marker.bytes = result;
                }
                next = marker.next_target;
            }
        }
    };
    var destination: Destination = .{ .a = a, .tree = tree, .markers = markers, .targets = &targets, .limit = limit };
    try walk(a, tree, owner, &destination);
    for (markers) |marker| if (marker.bytes.len == 0) return error.SourceBindingMismatch;
}
