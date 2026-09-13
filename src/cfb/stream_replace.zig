const std = @import("std");
const File = @import("reader.zig").File;
const writer = @import("writer.zig");

pub const Options = struct {
    limits: @import("types.zig").Options = .{},
    max_output_bytes: usize = 256 * 1024 * 1024,
};

pub const Replacement = struct {
    path: []const u8,
    content: []const u8,
};

/// Canonically rebuilds an already opened CFB after replacing one exact stream.
/// Selection, compact node mapping and output version are owned here so HWP
/// envelope/container adapters do not duplicate them.
pub fn rebuildExact(a: std.mem.Allocator, file: *const File, path: []const u8, replacement: []const u8, options: Options) ![]u8 {
    return rebuildManyExact(a, file, &.{.{ .path = path, .content = replacement }}, options);
}

/// Validates every exact target before creating nodes, then performs one
/// canonical writer call. Two paths resolving to the same stream are rejected.
pub fn rebuildManyExact(a: std.mem.Allocator, file: *const File, replacements: []const Replacement, options: Options) ![]u8 {
    if (replacements.len == 0) return error.EmptyReplacementSet;
    const node_indices = try a.alloc(usize, replacements.len);
    defer a.free(node_indices);
    const selected = try a.alloc(bool, file.entries.len);
    defer a.free(selected);
    @memset(selected, false);
    for (replacements, node_indices) |replacement, *node_index| {
        const entry_index = try file.findExact(replacement.path) orelse return error.StreamNotFound;
        if (file.entries[entry_index].kind != 2) return error.NotAStream;
        if (selected[entry_index]) return error.DuplicateStreamReplacement;
        selected[entry_index] = true;
        node_index.* = try file.nodeIndex(entry_index);
    }
    const nodes = try file.toNodes(a);
    defer a.free(nodes);
    for (replacements, node_indices) |replacement, node_index| nodes[node_index].content = replacement.content;
    var limits = options.limits;
    limits.max_input_bytes = @min(limits.max_input_bytes, options.max_output_bytes);
    return writer.write(a, nodes, .{ .version = file.header.major, .limits = limits });
}
