//! Creation foundation only: owned resources ready for a future atomic owner.
//! Does not insert an object, enable a public capability, or return a saved HWP.
const std = @import("std");
const info = @import("create_docinfo.zig");
pub const Limits = struct {
    max_docinfo_bytes: usize = 32 * 1024 * 1024,
    max_fallback_bytes: usize = 8 * 1024 * 1024,
    max_result_bytes: usize = 64 * 1024 * 1024,
};
pub const Prepared = struct {
    docinfo: info.Prepared,
    ole: []u8,
    fallback: []u8,
    ole_path: []u8,
    fallback_path: []u8,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.docinfo.deinit(a);
        a.free(self.ole);
        a.free(self.fallback);
        a.free(self.ole_path);
        a.free(self.fallback_path);
        self.* = undefined;
    }
};

/// The first candidate is modern OOXML only, not a synchronized legacy Contents
/// writer. Supplied fallback bytes are format-checked and retained exactly;
/// their visual relationship to data needs the future renderer/owner proof.
pub fn prepare(a: std.mem.Allocator, docinfo: []const u8, version: @import("../version.zig").Version, direct_names: []const []const u8, data: @import("../../hwpx/chart_create_data.zig").Data, fallback: []const u8, limits: Limits) !Prepared {
    try @import("../../hwpx/chart_create_data.zig").validate(data);
    const media = try @import("../../image/picture_input.zig").inspectImage(fallback, limits.max_fallback_bytes);
    const image: info.Image = if (std.mem.eql(u8, media.extension, "png")) .png else if (std.mem.eql(u8, media.extension, "jpg")) .jpeg else return error.UnsupportedReplacementImageFormat;
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    // Reuse the own fresh CFB writer, not an extracted Contents/CFB template.
    const ole = try @import("../../hwpx/chart_create_ole.zig").create(a, xml);
    errdefer a.free(ole);
    var checked = try @import("ooxml_resource.zig").read(a, ole, .observed_size_prefix);
    defer checked.deinit(a);
    if (checked.legacy_backup_present or checked.presentation_streams != 0) return error.ChartCreateVerificationFailed;
    var updated = try info.prepare(a, docinfo, version, direct_names, image, limits.max_docinfo_bytes);
    errdefer updated.deinit(a);
    // Result payload cap only. Existing XML, image and CFB workspaces have
    // separate limits; this is not a peak heap promise.
    const partial = std.math.add(usize, updated.bytes.len, ole.len) catch return error.LimitExceeded;
    const total = std.math.add(usize, partial, fallback.len) catch return error.LimitExceeded;
    if (total > limits.max_result_bytes) return error.LimitExceeded;
    const copy = try a.dupe(u8, fallback);
    errdefer a.free(copy);
    const ole_path = try @import("../container/paths.zig").binary(a, updated.ids.physical.ole, &.{});
    errdefer a.free(ole_path);
    const fallback_path = try @import("../container/paths.zig").binary(a, updated.ids.physical.fallback, info.extension(image));
    return .{ .docinfo = updated, .ole = ole, .fallback = copy, .ole_path = ole_path, .fallback_path = fallback_path };
}
