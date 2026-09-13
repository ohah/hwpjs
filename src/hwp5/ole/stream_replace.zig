const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const writer = @import("../../cfb/writer.zig");
const container = @import("container.zig");
const envelope = @import("envelope.zig");

pub const Options = struct {
    limits: cfb.Options = .{},
    max_output_bytes: usize = 256 * 1024 * 1024,
};

/// Rebuilds a decoded HWP OLE BinData value after replacing one exact inner
/// CFB stream. The result preserves the input envelope layout and CFB version;
/// all inputs are borrowed and the returned bytes belong to the caller.
pub fn replaceExact(a: std.mem.Allocator, bytes: []const u8, layout: envelope.Layout, path: []const u8, replacement: []const u8, options: Options) ![]u8 {
    var file = try container.open(a, bytes, layout, options.limits);
    defer file.deinit();
    const entry_index = try file.findExact(path) orelse return error.StreamNotFound;
    if (file.entries[entry_index].kind != 2) return error.NotAStream;
    const node_index = try file.nodeIndex(entry_index);
    const nodes = try file.toNodes(a);
    defer a.free(nodes);
    nodes[node_index].content = replacement;

    const envelope_bytes: usize = if (layout == .raw_cfb) 0 else 4;
    if (options.max_output_bytes < envelope_bytes) return error.LimitExceeded;
    var output_limits = options.limits;
    output_limits.max_input_bytes = @min(output_limits.max_input_bytes, options.max_output_bytes - envelope_bytes);
    const raw = try writer.write(a, nodes, .{ .version = file.header.major, .limits = output_limits });
    if (layout == .raw_cfb) {
        if (raw.len > options.max_output_bytes) {
            a.free(raw);
            return error.LimitExceeded;
        }
        return raw;
    }
    defer a.free(raw);
    if (raw.len > std.math.maxInt(u32))
        return error.LimitExceeded;
    const out = try a.alloc(u8, raw.len + 4);
    std.mem.writeInt(u32, out[0..4], @intCast(raw.len), .little);
    @memcpy(out[4..], raw);
    return out;
}
