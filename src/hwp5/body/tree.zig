const std = @import("std");
const body = @import("reader.zig");
const framing = @import("../record.zig");
const Version = @import("../version.zig").Version;
pub const Node = struct {
    record: body.Record,
    parent: ?usize,
    /// Exclusive index, allowing O(1) skipping of an entire subtree.
    subtree_end: usize,
};
/// Owns nodes only. Record payloads continue to borrow the caller's input.
pub const Tree = struct {
    nodes: []Node,
    pub fn deinit(self: *Tree, a: std.mem.Allocator) void {
        a.free(self.nodes);
        self.* = undefined;
    }
    /// Whole Section stream, whose roots must have level zero. No tag inference.
    pub fn parse(a: std.mem.Allocator, bytes: []const u8, version: Version, options: framing.Options) !Tree {
        var it = try body.Iterator.init(bytes, version, options);
        var nodes: std.ArrayList(Node) = .empty;
        errdefer nodes.deinit(a);
        var stack: [1024]usize = undefined;
        var depth: usize = 0;
        while (try it.next()) |record| {
            const level: usize = record.framing.level;
            if (level > depth) return error.InvalidRecordHierarchy;
            while (depth > level) {
                depth -= 1;
                nodes.items[stack[depth]].subtree_end = nodes.items.len;
            }
            const index = nodes.items.len;
            try nodes.append(a, .{ .record = record, .parent = if (level == 0) null else stack[level - 1], .subtree_end = 0 });
            stack[level] = index;
            depth = level + 1;
        }
        while (depth > 0) {
            depth -= 1;
            nodes.items[stack[depth]].subtree_end = nodes.items.len;
        }
        return .{ .nodes = try nodes.toOwnedSlice(a) };
    }
};
