//! Future product admission for an actual shared-painter payload.
//! This does not grant a body owner, History authority, or visual authenticity.
const std = @import("std");
const data_module = @import("../../hwpx/chart_create_data.zig");
const resources = @import("create_resources.zig");
pub const Payload = struct {
    source_xml_sha256: [32]u8,
    pixel_width: u32,
    pixel_height: u32,
    bytes: []const u8,
};
pub fn validate(a: std.mem.Allocator, data: data_module.Data, rendered: Payload, limits: resources.Limits) !void {
    try data_module.validate(data);
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
    if (!std.mem.eql(u8, &digest, &rendered.source_xml_sha256)) return error.StaleChartCreatePreview;
    const width = rendered.pixel_width;
    const height = rendered.pixel_height;
    if (width < 64 or height < 64 or width > 2048 or height > 2048 or @as(u64, width) * height > 4 * 1024 * 1024) return error.ChartCreatePreviewPixelLimit;
    const media = try @import("../../image/picture_input.zig").inspectImage(rendered.bytes, limits.max_fallback_bytes);
    if (!std.mem.eql(u8, media.mime, "image/png")) return error.InvalidChartCreatePreviewPNG;
    const image = try @import("../../image/png/structure.zig").inspect(rendered.bytes, .{ .max_pixels = 4 * 1024 * 1024 });
    if (image.header.width != width or image.header.height != height) return error.InvalidChartCreatePreviewPNG;
    // Format/CRC and data identity only. The caller must bind the trusted host
    // renderer and current document target; neither a hash nor PNG proves paint.

}

pub fn prepare(a: std.mem.Allocator, docinfo: []const u8, version: @import("../version.zig").Version, names: []const []const u8, data: data_module.Data, rendered: Payload, limits: resources.Limits) !resources.Prepared {
    try validate(a, data, rendered, limits);
    return resources.prepare(a, docinfo, version, names, data, rendered.bytes, limits);
}
