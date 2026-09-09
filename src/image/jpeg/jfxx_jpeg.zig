const std = @import("std");
const structure = @import("structure.zig");
const markers = @import("markers.zig");
const frame = @import("frame.zig");
const jfif = @import("jfif.zig");
const planes = @import("sample_planes.zig");

/// Decode the extension_data of JFXX code 0x10. The parent image need not have
/// the same component count. No recursion into APP data or nested thumbnails.
pub fn decode(allocator: std.mem.Allocator, bytes: []const u8, options: planes.Options) !planes.Image {
    // Largest APP payload minus JFXX identifier and code.
    if (bytes.len > 65527) return error.LimitExceeded;
    var bounded = options;
    bounded.frame.structure.allow_trailing_bytes = false;
    _ = try structure.inspectWithMarkerCheck(bytes, bounded.frame.structure, checkMarker);
    // Reuse full entropy decoding, table checks and owned plane construction.
    // The extra bounded structural pass is intentional; no second marker walker.
    return planes.decode(allocator, bytes, bounded);
}

fn checkMarker(marker: markers.Marker) !void {
    if (structure.isFrame(marker.code)) {
        if (marker.code != 0xc0) return error.UnsupportedJfxxJpegProcess;
        // Caller limits remain enforced by the shared structural inspector.
        const parsed = try frame.parse(marker.code, marker.payload, .{ .max_pixels = std.math.maxInt(u64) });
        try jfif.validateFrame(parsed);
    }
    if (marker.code == 0xe0 and (std.mem.startsWith(u8, marker.payload, "JFIF\x00") or std.mem.startsWith(u8, marker.payload, "JFXX\x00"))) return error.ForbiddenJfxxNestedMarker;
}
