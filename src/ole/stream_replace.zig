//! Shared OLE envelope/CFB reconstruction; no HWP-specific selection rules.
const std = @import("std");
const cfb = @import("../cfb/reader.zig");
const container = @import("container.zig");
const envelope = @import("envelope.zig");
pub const Options = struct { limits: cfb.Options = .{}, max_output_bytes: usize = 256 * 1024 * 1024 };

pub fn replaceExact(a: std.mem.Allocator, bytes: []const u8, layout: envelope.Layout, path: []const u8, replacement: []const u8, options: Options) ![]u8 {
    return replaceManyExact(a, bytes, layout, &.{.{ .path = path, .content = replacement }}, options);
}
pub fn replaceManyExact(a: std.mem.Allocator, bytes: []const u8, layout: envelope.Layout, replacements: []const cfb.stream_replace.Replacement, options: Options) ![]u8 {
    var file = try container.open(a, bytes, layout, options.limits);
    defer file.deinit();
    return rebuildOpened(a, &file, layout, replacements, options);
}
/// Caller owns strict opening and explicit copy-only compatibility policy.
/// Does not change File or publish a document edit.
pub fn rebuildOpened(a: std.mem.Allocator, file: *const cfb.File, layout: envelope.Layout, replacements: []const cfb.stream_replace.Replacement, options: Options) ![]u8 {
    const envelope_bytes: usize = if (layout == .raw_cfb) 0 else 4;
    if (options.max_output_bytes < envelope_bytes) return error.LimitExceeded;
    const raw = try cfb.stream_replace.rebuildManyExact(a, file, replacements, .{ .limits = options.limits, .max_output_bytes = options.max_output_bytes - envelope_bytes });
    if (layout == .raw_cfb) {
        if (raw.len > options.max_output_bytes) {
            a.free(raw);
            return error.LimitExceeded;
        }
        return raw;
    }
    defer a.free(raw);
    if (raw.len > std.math.maxInt(u32)) return error.LimitExceeded;
    const out = try a.alloc(u8, raw.len + 4);
    std.mem.writeInt(u32, out[0..4], @intCast(raw.len), .little);
    @memcpy(out[4..], raw);
    return out;
}
