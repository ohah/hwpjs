const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
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
    return replaceManyExact(a, bytes, layout, &.{.{ .path = path, .content = replacement }}, options);
}

/// Rebuilds one decoded OLE BinData value after validating and replacing all
/// exact inner streams in a single CFB writer call.
pub fn replaceManyExact(a: std.mem.Allocator, bytes: []const u8, layout: envelope.Layout, replacements: []const cfb.stream_replace.Replacement, options: Options) ![]u8 {
    var file = try container.open(a, bytes, layout, options.limits);
    defer file.deinit();
    const envelope_bytes: usize = if (layout == .raw_cfb) 0 else 4;
    if (options.max_output_bytes < envelope_bytes) return error.LimitExceeded;
    const raw = try cfb.stream_replace.rebuildManyExact(a, &file, replacements, .{ .limits = options.limits, .max_output_bytes = options.max_output_bytes - envelope_bytes });
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
