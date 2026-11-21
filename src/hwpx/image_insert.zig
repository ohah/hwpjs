//! One owned inline picture candidate, committed only by existing parked History.
const std = @import("std");
const insertion = @import("../image/image_insertion.zig");
pub const Request = struct {
    expected_source_sha256: [32]u8,
    target: @import("inline_object_insert.zig").Target,
    width: u32,
    height: u32,
    /// Borrowed until synchronous History.apply returns. Candidate ZIP owns a copy.
    image: []const u8,
};
pub fn validate(request: Request) !void {
    const owner = request.target.owner orelse return error.InlineObjectOwnerRequired;
    if (owner.kind != .body) return error.UnsupportedPictureInsertionHost;
    if (request.target.physical_paragraph != null or request.target.anchor_insertion) return error.InvalidImageInsertRequest;
    _ = try insertion.size(.{ .expected_source_sha256 = request.expected_source_sha256, .target = .{ .section = 0, .paragraph = 1, .unit = 0 }, .expected_text = "", .width = request.width, .height = request.height });
    _ = try insertion.picture_input.inspectImage(request.image, insertion.picture_input.max_image_bytes);
    _ = try insertion.byteOffset(request.target.expected_text, request.target.unit);
}
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: Request, physical: @import("inline_object_insert.zig").Target) !insertion.Result {
    try validate(request);
    if (physical.owner != null or physical.physical_paragraph == null or !physical.anchor_insertion) return error.SourceBindingMismatch;
    const wire: insertion.Request = .{
        .expected_source_sha256 = request.expected_source_sha256,
        .target = .{ .section = std.math.cast(u32, physical.section) orelse return error.LimitExceeded, .paragraph = std.math.cast(u32, physical.paragraph) orelse return error.LimitExceeded, .unit = physical.unit },
        .expected_text = physical.expected_text,
        .width = request.width,
        .height = request.height,
    };
    return @import("image_insertion_file.zig").prepareCurrent(a, before, request.image, wire, physical);
}
