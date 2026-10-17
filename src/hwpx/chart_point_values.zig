//! Owned decoded values bound to immutable source nodes; not a series/layout model.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const cache = @import("chart_cache.zig");
const kinds = @import("chart_cache_kind.zig");
const uri = @import("chart_namespace.zig").uri;

pub const Point = struct {
    cache_node: usize,
    level_node: ?usize,
    point_node: usize,
    value_node: usize,
    index: u32,
    kind: kinds.Kind,
    value: []u8,
};
pub const Values = struct {
    points: []Point,
    source_sha256: [32]u8,
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        const points = try a.dupe(Point, self.points);
        errdefer a.free(points);
        var initialized: usize = 0;
        errdefer for (points[0..initialized]) |point| a.free(point.value);
        for (points) |*point| {
            point.value = try a.dupe(u8, point.value);
            initialized += 1;
        }
        return .{ .points = points, .source_sha256 = self.source_sha256 };
    }
    pub fn validateSource(self: *const Values, tree: *const Tree) !void {
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
        if (tree.part_kind != .chart or !std.mem.eql(u8, &hash, &self.source_sha256)) return error.SourceBindingMismatch;
    }
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.points) |point| a.free(point.value);
        a.free(self.points);
        self.* = undefined;
    }
};

pub fn collect(a: std.mem.Allocator, tree: *const Tree, options: cache.Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var report: cache.Report = .{};
    var scanner: cache.Scanner = .{ .allocator = a, .options = options, .report = &report };
    defer scanner.deinit();
    const Validator = struct {
        fn tag(raw: *anyopaque, value: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, depth: usize) anyerror!void {
            const s: *cache.Scanner = @ptrCast(@alignCast(raw));
            try s.onTag(value, scope, depth);
        }
        fn text(raw: *anyopaque, value: @import("../xml/root.zig").text_content.View, depth: usize) anyerror!void {
            const s: *cache.Scanner = @ptrCast(@alignCast(raw));
            try s.onContent(value, depth);
        }
    };
    _ = try @import("document_xml.zig").visitBytes(a, tree.source, tree.source.len, .{}, .{ .context = &scanner, .on_tag = Validator.tag, .on_content = Validator.text });
    if (report.issues() != 0) return error.InvalidChartCache;
    var points: std.ArrayList(Point) = .empty;
    defer points.deinit(a);
    errdefer for (points.items) |point| a.free(point.value);
    var by_leaf: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer by_leaf.deinit(a);
    var texts: std.ArrayList(std.ArrayList(u8)) = .empty;
    defer {
        for (texts.items) |*text| text.deinit(a);
        texts.deinit(a);
    }
    for (tree.elements, 0..) |element, leaf| {
        if (!element.is(uri, "v")) continue;
        const point_node = element.parent orelse continue;
        if (!tree.elements[point_node].is(uri, "pt")) continue;
        const parent = tree.elements[point_node].parent orelse continue;
        const level_node: ?usize = if (tree.elements[parent].is(uri, "lvl")) parent else null;
        const cache_node = if (level_node != null) tree.elements[parent].parent orelse continue else parent;
        const kind = kinds.classify(tree.elements[cache_node].name) orelse continue;
        if ((kind == .multilevel_cache) != (level_node != null)) continue;
        if (points.items.len == options.max_points) return error.LimitExceeded;
        const raw = try tree.attributeValue(a, point_node, "", "idx") orelse return error.InvalidChartPointIndex;
        const index_text = try raw.toUtf8(a, options.max_attribute_bytes);
        defer a.free(index_text);
        const index = try cache.unsigned(index_text, error.InvalidChartPointIndex);
        try texts.append(a, .empty);
        try by_leaf.put(a, leaf, points.items.len);
        try points.append(a, .{ .cache_node = cache_node, .level_node = level_node, .point_node = point_node, .value_node = leaf, .index = index, .kind = kind, .value = &.{} });
    }
    const Content = struct {
        allocator: std.mem.Allocator,
        map: *const std.AutoHashMapUnmanaged(usize, usize),
        texts: []std.ArrayList(u8),
        options: cache.Options,
        total: usize = 0,
        fn onText(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const ordinal = self.map.get(event.parent_index) orelse return;
            const text = &self.texts[ordinal];
            const remaining = @min(self.options.max_value_bytes -| text.items.len, self.options.max_total_value_bytes -| self.total);
            const decoded = try event.value.toUtf8(self.allocator, remaining);
            defer self.allocator.free(decoded);
            if (decoded.len > remaining) return error.LimitExceeded;
            try text.appendSlice(self.allocator, decoded);
            self.total += decoded.len;
        }
    };
    var content: Content = .{ .allocator = a, .map = &by_leaf, .texts = texts.items, .options = options };
    try tree.visitContent(a, .{ .context = &content, .on_content = Content.onText });
    for (points.items, texts.items) |*point, text| {
        var decoded = try @import("xstring.zig").decode(a, text.items, options.max_value_bytes);
        defer decoded.deinit(a);
        point.value = try a.dupe(u8, decoded.text orelse return error.InvalidChartCache);
    }
    if (points.items.len != report.points) return error.InvalidChartCache;
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
    return .{ .points = try points.toOwnedSlice(a), .source_sha256 = hash };
}
