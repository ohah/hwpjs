const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
pub const envelope = @import("envelope.zig");

/// Owns its returned File; caller must deinit it. No OLE activation, recursion,
/// stream-name interpretation or fallback on invalid input.
/// max_input_bytes bounds the entire decoded envelope, including its prefix.
/// Other limits are the existing CFB limits; strict validation is mandatory.
pub fn open(a: std.mem.Allocator, bytes: []const u8, layout: envelope.Layout, limits: cfb.Options) !cfb.File {
    const inner = try envelope.payload(bytes, layout, limits.max_input_bytes);
    var options = limits;
    options.strict = true;
    return cfb.File.open(a, inner, options);
}
