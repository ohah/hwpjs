const std = @import("std");
const File = @import("reader.zig").File;
const writer = @import("writer.zig");

pub const Options = struct {
    limits: @import("types.zig").Options = .{},
    max_output_bytes: usize = 256 * 1024 * 1024,
};

/// Canonically rebuilds an already opened CFB after replacing one exact stream.
/// Selection, compact node mapping and output version are owned here so HWP
/// envelope/container adapters do not duplicate them.
pub fn rebuildExact(a: std.mem.Allocator, file: *const File, path: []const u8, replacement: []const u8, options: Options) ![]u8 {
    const entry_index = try file.findExact(path) orelse return error.StreamNotFound;
    if (file.entries[entry_index].kind != 2) return error.NotAStream;
    const node_index = try file.nodeIndex(entry_index);
    const nodes = try file.toNodes(a);
    defer a.free(nodes);
    nodes[node_index].content = replacement;
    var limits = options.limits;
    limits.max_input_bytes = @min(limits.max_input_bytes, options.max_output_bytes);
    return writer.write(a, nodes, .{ .version = file.header.major, .limits = limits });
}
