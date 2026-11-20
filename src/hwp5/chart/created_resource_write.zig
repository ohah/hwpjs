//! Rebuild an exact HWP CFB with pending binary additions. No filesystem writes.
const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const writer = @import("../../cfb/writer.zig");
const replace = @import("../../cfb/stream_replace.zig");
const Entry = @import("created_resources.zig").Entry;
const Key = struct { units: [31]u16, len: usize };
fn key(name: []const u8) !Key {
    const parsed = try @import("../../cfb/name_order.zig").Name.init(name);
    var result: Key = .{ .units = @splat(0), .len = parsed.len };
    for (parsed.units[0..parsed.len], 0..) |unit, i| result.units[i] = @import("../../cfb/simple_uppercase.zig").upper(unit);
    return result;
}
pub fn rebuild(a: std.mem.Allocator, file: *const cfb.File, replacements: []const replace.Replacement, pending: []const Entry, options: replace.Options) ![]u8 {
    if (pending.len == 0) return replace.rebuildManyExact(a, file, replacements, options);
    if (pending.len > 128) return error.LimitExceeded;
    const base = try file.toNodes(a);
    defer a.free(base);
    var nodes: std.ArrayList(writer.Node) = .empty;
    defer nodes.deinit(a);
    try nodes.appendSlice(a, base);
    const selected = try a.alloc(bool, file.entries.len);
    defer a.free(selected);
    @memset(selected, false);
    for (replacements) |entry| {
        const index = try file.findExact(entry.path) orelse return error.StreamNotFound;
        if (file.entries[index].kind != 2) return error.NotAStream;
        if (selected[index]) return error.DuplicateStreamReplacement;
        selected[index] = true;
        nodes.items[try file.nodeIndex(index)].content = entry.content;
    }
    const parent: usize = if (try file.findExact("/BinData")) |index| block: {
        if (file.entries[index].kind != 1) return error.InvalidHwpEntryKind;
        break :block try file.nodeIndex(index);
    } else block: {
        const index = nodes.items.len;
        try nodes.append(a, .{ .name = "BinData", .kind = 1, .parent = 0 });
        break :block index;
    };
    var keys: std.AutoHashMapUnmanaged(Key, void) = .empty;
    defer keys.deinit(a);
    for (nodes.items) |node| if (node.parent == parent) {
        if ((try keys.getOrPut(a, try key(node.name))).found_existing) return error.DuplicateDirectoryName;
    };
    for (pending) |entry| {
        const prefix = "/BinData/";
        if (!std.mem.startsWith(u8, entry.path, prefix)) return error.InvalidChartResourcePath;
        const name = entry.path[prefix.len..];
        if ((try keys.getOrPut(a, try key(name))).found_existing) return error.DuplicateDirectoryName;
        try nodes.append(a, .{ .name = name, .kind = 2, .parent = std.math.cast(u32, parent) orelse return error.LimitExceeded, .content = entry.bytes });
    }
    var limits = options.limits;
    limits.strict = true;
    limits.max_input_bytes = @min(limits.max_input_bytes, options.max_output_bytes);
    const bytes = try writer.write(a, nodes.items, .{ .version = file.header.major, .limits = limits });
    errdefer a.free(bytes);
    var checked = try cfb.File.open(a, bytes, limits);
    defer checked.deinit();
    for (pending) |entry| {
        const index = try checked.findExact(entry.path) orelse return error.MissingHwpEntry;
        if (checked.entries[index].kind != 2 or !std.mem.eql(u8, checked.entries[index].content, entry.bytes)) return error.ChartCreateVerificationFailed;
    }
    return bytes;
}
