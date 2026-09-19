const binary = @import("../../binary/reader.zig");
const geometry = @import("emf_plus_geometry.zig");
const path = @import("emf_plus_path.zig");
const sized_path = @import("emf_plus_sized_path.zig");
const values = @import("emf_plus_region_values.zig");

pub const storage_depth: usize = 256;

pub const Options = struct {
    max_depth: usize = storage_depth,
    path_options: path.Options = .{},
    max_path_bytes: usize = 64 * 1024 * 1024,
};

pub const Data = union(enum) {
    children,
    rect: geometry.RectF,
    path: path.Path,
    empty,
    infinite,
};

pub const Node = struct {
    index: u32,
    depth: usize,
    node_type: values.NodeType,
    data: Data,
};

pub const Iterator = struct {
    reader: binary.Reader,
    options: Options,
    expected_nodes: u32,
    emitted: u32 = 0,
    depth: usize = 0,
    children_remaining: [storage_depth]u2 = .{0} ** storage_depth,
    complete: bool = false,

    pub fn next(self: *Iterator) !?Node {
        if (self.emitted == self.expected_nodes) return null;
        if (self.complete) return error.InvalidEmfPlusRegionNodeCount;
        if (self.options.max_depth == 0 or self.options.max_depth > storage_depth)
            return error.InvalidEmfPlusRegionDepthLimit;

        var next_reader = self.reader;
        const node_type = try values.NodeType.parse(try next_reader.readInt(u32));
        const data: Data = switch (node_type) {
            .and_, .or_, .xor, .exclude, .complement => .children,
            .rect => .{ .rect = try geometry.readRectF(&next_reader) },
            .path => .{ .path = try sized_path.read(&next_reader, self.options.path_options, self.options.max_path_bytes) },
            .empty => .empty,
            .infinite => .infinite,
        };
        if (node_type.hasChildren() and self.depth + 1 >= self.options.max_depth)
            return error.EmfPlusRegionDepthLimitExceeded;
        const result: Node = .{
            .index = self.emitted,
            .depth = self.depth,
            .node_type = node_type,
            .data = data,
        };

        self.reader = next_reader;
        self.emitted += 1;
        if (node_type.hasChildren()) {
            self.children_remaining[self.depth] = 2;
            self.depth += 1;
        } else {
            self.finishLeaf();
        }
        return result;
    }

    fn finishLeaf(self: *Iterator) void {
        if (self.depth == 0) {
            self.complete = true;
            return;
        }
        while (self.depth != 0) {
            const parent = self.depth - 1;
            self.children_remaining[parent] -= 1;
            if (self.children_remaining[parent] != 0) return;
            self.depth = parent;
        }
        self.complete = true;
    }
};

test "EMF+ Region node iterator leaves state unchanged on depth failure" {
    const std = @import("std");
    const bytes = [_]u8{ 1, 0, 0, 0 };
    var iterator: Iterator = .{
        .reader = .{ .bytes = &bytes },
        .options = .{ .max_depth = 1 },
        .expected_nodes = 3,
    };
    const before = iterator;
    try std.testing.expectError(error.EmfPlusRegionDepthLimitExceeded, iterator.next());
    try std.testing.expectEqual(before.reader.offset, iterator.reader.offset);
    try std.testing.expectEqual(before.emitted, iterator.emitted);
    try std.testing.expectEqual(before.depth, iterator.depth);
    try std.testing.expectEqual(before.complete, iterator.complete);
}
