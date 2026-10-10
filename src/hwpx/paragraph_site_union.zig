//! Align current plain-site owners without serializing XML or discarding text.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const text = @import("text_sites.zig");
const derived = @import("continuation_empty_run.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Pair = struct {
    left: text.Sites,
    right: text.Sites,
    pub fn deinit(self: *Pair, a: std.mem.Allocator) void {
        self.left.deinit(a);
        self.right.deinit(a);
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, owner: usize, left: *const text.Sites, right: *const text.Sites, limit: usize) !Pair {
    if (owner >= tree.elements.len or !tree.elements[owner].is(uri, "p")) return error.SourceBindingMismatch;
    var original = try text.collect(a, tree, .{});
    defer original.deinit(a);
    var expanded: ?text.Sites = null;
    defer if (expanded) |*sites| sites.deinit(a);
    for ([_]*const text.Sites{ left, right }) |current| {
        for (current.items, 0..) |site, index| {
            if (index != 0 and site.start <= current.items[index - 1].start) return error.SourceBindingMismatch;
            for (current.items[0..index]) |prior| if (sameKey(prior, site)) return error.SourceBindingMismatch;
            const before = find(original.items, site);
            if (before) |binding| {
                if (!owns(tree, owner, site.element_index) or !sameBinding(binding, site)) return error.SourceBindingMismatch;
            } else if (!derived.valid(tree, owner, site)) {
                if (expanded == null) expanded = try text.collect(a, tree, .{ .materialize_tab_boundaries = true });
                const boundary = find(expanded.?.items, site) orelse return error.SourceBindingMismatch;
                if (!owns(tree, owner, site.element_index) or boundary.start != boundary.end or boundary.text.len != 0 or boundary.missing_text or boundary.empty_element or boundary.anchor_boundary or !sameBinding(boundary, site)) return error.SourceBindingMismatch;
            }
        }
        for (original.items) |site| {
            if (owns(tree, owner, site.element_index) and find(current.items, site) == null) return error.SourceBindingMismatch;
        }
    }
    var union_sites: std.ArrayList(text.Site) = .empty;
    defer union_sites.deinit(a);
    for ([_]*const text.Sites{ left, right }) |current| for (current.items) |site| {
        if (find(union_sites.items, site)) |before| {
            if (!sameBinding(before, site)) return error.SourceBindingMismatch;
        } else {
            if (union_sites.items.len >= limit / @sizeOf(text.Site)) return error.LimitExceeded;
            try union_sites.append(a, site);
        }
    };
    std.mem.sort(text.Site, union_sites.items, {}, struct {
        fn less(_: void, one: text.Site, two: text.Site) bool {
            return one.start < two.start;
        }
    }.less);
    var bytes: usize = 0;
    var one = try side(a, union_sites.items, left.items, limit, &bytes);
    errdefer one.deinit(a);
    const two = try side(a, union_sites.items, right.items, limit, &bytes);
    return .{ .left = one, .right = two };
}

fn side(a: std.mem.Allocator, bindings: []const text.Site, values: []const text.Site, limit: usize, bytes: *usize) !text.Sites {
    const rows_bytes = std.math.mul(usize, bindings.len, @sizeOf(text.Site)) catch return error.LimitExceeded;
    if (rows_bytes > limit -| bytes.*) return error.LimitExceeded;
    bytes.* += rows_bytes;
    const rows = try a.alloc(text.Site, bindings.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |site| a.free(site.text);
        a.free(rows);
    }
    for (bindings, rows) |binding, *row| {
        const value = if (find(values, binding)) |site| site.text else "";
        if (value.len > limit -| bytes.*) return error.LimitExceeded;
        bytes.* += value.len;
        row.* = binding;
        row.text = try a.dupe(u8, value);
        initialized += 1;
    }
    return .{ .items = rows };
}

fn owns(tree: *const Tree, owner: usize, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const node = tree.elements[index];
    const run = if (node.is(uri, "run")) index else if (node.is(uri, "t")) node.parent orelse return false else return false;
    return tree.elements[run].is(uri, "run") and tree.elements[run].parent == owner;
}

fn sameKey(one: text.Site, two: text.Site) bool {
    return one.element_index == two.element_index and one.start == two.start;
}
fn sameBinding(one: text.Site, two: text.Site) bool {
    return sameKey(one, two) and one.end == two.end and one.empty_element == two.empty_element and one.missing_text == two.missing_text and one.anchor_boundary == two.anchor_boundary;
}
fn find(sites: []const text.Site, wanted: text.Site) ?text.Site {
    for (sites) |site| if (sameKey(site, wanted)) return site;
    return null;
}

test "site union accepts verified title boundaries without accepting forged or missing bindings" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:titleMark/>AB</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var normal = try text.collect(a, &tree, .{});
    defer normal.deinit(a);
    var boundaries = try text.collect(a, &tree, .{ .materialize_tab_boundaries = true });
    defer boundaries.deinit(a);
    try std.testing.expectEqual(normal.items.len + 1, boundaries.items.len);
    try std.testing.expectEqual(boundaries.items[0].start, boundaries.items[0].end);
    var pair = try prepare(a, &tree, 1, &boundaries, &boundaries, 10000);
    defer pair.deinit(a);
    try std.testing.expectEqual(boundaries.items.len, pair.left.items.len);
    boundaries.items[0].end += 1;
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &tree, 1, &boundaries, &boundaries, 10000));
    boundaries.items[0].end -= 1;
    const missing: text.Sites = .{ .items = boundaries.items[0..1] };
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &tree, 1, &missing, &boundaries, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const Tree, sites: *const text.Sites) !void {
            var output = try prepare(allocator, t, 1, sites, sites, 10000);
            defer output.deinit(allocator);
        }
    }.run, .{ &tree, &boundaries });
    try std.testing.expectEqualStrings(source, tree.source);
}
