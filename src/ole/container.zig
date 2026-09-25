const std = @import("std");
const cfb = @import("../cfb/reader.zig");
pub const envelope = @import("envelope.zig");

/// Strict CFB inspection only. Never activates OLE or interprets stream names.
pub fn open(a: std.mem.Allocator, bytes: []const u8, layout: envelope.Layout, limits: cfb.Options) !cfb.File {
    const inner = try envelope.payload(bytes, layout, limits.max_input_bytes);
    var options = limits;
    options.strict = true;
    return cfb.File.open(a, inner, options);
}
