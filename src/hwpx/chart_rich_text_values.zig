//! DrawingML run text is XML Schema string, not chart ST_Xstring.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const chart_uri = @import("chart_namespace.zig").uri;
const drawing_uri = "http://schemas.openxmlformats.org/drawingml/2006/main";
pub const default_max_value_bytes = 1024 * 1024;
pub const Options = struct { max_values: usize = 100_000, max_value_bytes: usize = default_max_value_bytes, max_total_bytes: usize = 64 * 1024 * 1024 };
pub const Value = struct { owner_node: usize, text_node: usize, rich_node: usize, paragraph_node: usize, run_node: usize, value_node: usize, text: []u8, owner_role: @import("chart_rich_text_owner.zig").Role = .unclassified, plain_text_complete: bool = false };
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
        for (self.items) |value| a.free(value.text);
        a.free(self.items);
        self.* = undefined;
    }
    pub fn validateSource(self: *const Values, tree: *const Tree) !void {
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
        if (tree.part_kind != .chart or !std.mem.eql(u8, &hash, &self.source_sha256)) return error.SourceBindingMismatch;
    }
};

pub fn sameOwner(left: Value, right: Value) bool {
    return left.plain_text_complete == right.plain_text_complete and left.owner_role == right.owner_role and left.owner_node == right.owner_node and left.text_node == right.text_node and
        left.rich_node == right.rich_node and left.paragraph_node == right.paragraph_node and
        left.run_node == right.run_node and left.value_node == right.value_node;
}

pub fn collect(a: std.mem.Allocator, tree: *const Tree, options: Options) !Values {
    if (tree.part_kind != .chart) return error.InvalidChartRoot;
    var values: std.ArrayList(Value) = .empty;
    defer values.deinit(a);
    errdefer for (values.items) |value| a.free(value.text);
    var texts: std.ArrayList(std.ArrayList(u8)) = .empty;
    defer {
        for (texts.items) |*text| text.deinit(a);
        texts.deinit(a);
    }
    var leaves: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer leaves.deinit(a);
    var runs: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer runs.deinit(a);
    var rich_complete: std.AutoHashMapUnmanaged(usize, bool) = .empty;
    defer rich_complete.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (!element.is(drawing_uri, "t")) continue;
        const run = element.parent orelse continue;
        if (!tree.elements[run].is(drawing_uri, "r")) continue;
        const paragraph = tree.elements[run].parent orelse continue;
        if (!tree.elements[paragraph].is(drawing_uri, "p")) continue;
        const rich = tree.elements[paragraph].parent orelse continue;
        if (!tree.elements[rich].is(chart_uri, "rich")) continue;
        const tx = tree.elements[rich].parent orelse continue;
        if (!tree.elements[tx].is(chart_uri, "tx")) continue;
        const owner = tree.elements[tx].parent orelse continue;
        if (!tree.elements[owner].is(chart_uri, "title") and !tree.elements[owner].is(chart_uri, "dLbl")) continue;
        var sibling = tree.elements[tx].first_child;
        var rich_count: usize = 0;
        while (sibling) |index| {
            const candidate = tree.elements[index];
            if (candidate.is(chart_uri, "rich")) rich_count += 1;
            if (candidate.is(chart_uri, "strRef") or candidate.is(chart_uri, "v")) return error.AmbiguousChartRichText;
            sibling = candidate.next_sibling;
        }
        if (rich_count != 1) return error.AmbiguousChartRichText;
        if (element.first_child != null) return error.InvalidChartRichText;
        const unique = try runs.getOrPut(a, run);
        if (unique.found_existing) return error.AmbiguousChartRichText;
        if (values.items.len == options.max_values) return error.LimitExceeded;
        try leaves.put(a, node, values.items.len);
        try texts.append(a, .empty);
        const complete = try rich_complete.getOrPut(a, rich);
        if (!complete.found_existing) complete.value_ptr.* = @import("chart_rich_text_plain.zig").complete(tree, rich);
        try values.append(a, .{ .owner_node = owner, .text_node = tx, .rich_node = rich, .paragraph_node = paragraph, .run_node = run, .value_node = node, .text = &.{}, .owner_role = @import("chart_rich_text_owner.zig").classify(tree, owner), .plain_text_complete = complete.value_ptr.* });
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
    var content: Content = .{ .allocator = a, .leaves = &leaves, .texts = texts.items, .options = options };
    try tree.visitContent(a, .{ .context = &content, .on_content = Content.onContent });
    for (values.items, texts.items) |*value, text| value.text = try a.dupe(u8, text.items);
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
    return .{ .items = try values.toOwnedSlice(a), .source_sha256 = hash };
}
