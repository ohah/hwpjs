//! Direct c:ser/c:tx/c:v values are not cache points and have no synthetic idx.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const uri = @import("chart_namespace.zig").uri;
pub const default_max_value_bytes = 1024 * 1024;
pub const Options = struct { max_values: usize = 100_000, max_value_bytes: usize = default_max_value_bytes, max_total_bytes: usize = 64 * 1024 * 1024 };
pub const Value = struct { series_node: usize, text_node: usize, value_node: usize, text: []u8 };
pub const Values = struct {
    items: []Value,
    source_sha256: [32]u8,
    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        const items = try a.dupe(Value, self.items);
        errdefer a.free(items);
        var initialized: usize = 0;
        errdefer for (items[0..initialized]) |item| a.free(item.text);
        for (items) |*item| {
            item.text = try a.dupe(u8, item.text);
            initialized += 1;
        }
        return .{ .items = items, .source_sha256 = self.source_sha256 };
    }
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.items) |item| a.free(item.text);
        a.free(self.items);
        self.* = undefined;
    }
    pub fn validateSource(self: *const Values, tree: *const Tree) !void {
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
        if (tree.part_kind != .chart or !std.mem.eql(u8, &hash, &self.source_sha256)) return error.SourceBindingMismatch;
    }
};

pub fn collect(a: std.mem.Allocator, tree: *const Tree, options: Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var values: std.ArrayList(Value) = .empty;
    defer values.deinit(a);
    errdefer for (values.items) |value| a.free(value.text);
    var raw: std.ArrayList(std.ArrayList(u8)) = .empty;
    defer {
        for (raw.items) |*text| text.deinit(a);
        raw.deinit(a);
    }
    var leaves: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer leaves.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "tx")) continue;
        const series = element.parent orelse continue;
        if (!tree.elements[series].is(uri, "ser")) continue;
        var selected: ?usize = null;
        var alternatives: usize = 0;
        var child = element.first_child;
        while (child) |index| {
            const candidate = tree.elements[index];
            if (candidate.is(uri, "v")) {
                if (selected != null) return error.AmbiguousChartSeriesText;
                if (candidate.first_child != null) return error.InvalidChartSeriesText;
                selected = index;
            } else if (candidate.is(uri, "strRef") or candidate.is(uri, "rich")) alternatives += 1;
            child = candidate.next_sibling;
        }
        const leaf = selected orelse continue;
        if (alternatives != 0) return error.AmbiguousChartSeriesText;
        if (values.items.len == options.max_values) return error.LimitExceeded;
        try leaves.put(a, leaf, values.items.len);
        try raw.append(a, .empty);
        try values.append(a, .{ .series_node = series, .text_node = node, .value_node = leaf, .text = &.{} });
    }
    const Content = struct {
        allocator: std.mem.Allocator,
        leaves: *const std.AutoHashMapUnmanaged(usize, usize),
        texts: []std.ArrayList(u8),
        options: Options,
        total: usize = 0,
        fn onContent(context: *anyopaque, event: Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(context));
            const ordinal = self.leaves.get(event.parent_index) orelse return;
            const text = &self.texts[ordinal];
            const limit = @min(self.options.max_value_bytes -| text.items.len, self.options.max_total_bytes -| self.total);
            const decoded = try event.value.toUtf8(self.allocator, limit);
            defer self.allocator.free(decoded);
            if (decoded.len > limit) return error.LimitExceeded;
            try text.appendSlice(self.allocator, decoded);
            self.total += decoded.len;
        }
    };
    var content: Content = .{ .allocator = a, .leaves = &leaves, .texts = raw.items, .options = options };
    try tree.visitContent(a, .{ .context = &content, .on_content = Content.onContent });
    for (values.items, raw.items) |*value, text| {
        var decoded = try @import("xstring.zig").decode(a, text.items, options.max_value_bytes);
        defer decoded.deinit(a);
        value.text = try a.dupe(u8, decoded.text orelse return error.InvalidChartSeriesText);
    }
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
    return .{ .items = try values.toOwnedSlice(a), .source_sha256 = hash };
}
