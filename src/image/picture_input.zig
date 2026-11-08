//! 그림 교체 입력의 공통 구조 검사입니다. 픽셀 디코딩·완전한 이미지 유효성 검사는 아닙니다.
const std = @import("std");
pub const max_document_bytes = 64 * 1024 * 1024;
pub const max_image_bytes = 8 * 1024 * 1024;
pub const Media = struct { mime: []const u8, extension: []const u8 };

pub fn inspectImage(bytes: []const u8, max_bytes: usize) !Media {
    if (bytes.len == 0 or bytes.len > @min(max_bytes, max_image_bytes)) return error.ImageByteLimitExceeded;
    if (std.mem.startsWith(u8, bytes, @import("png/chunks.zig").signature)) {
        _ = try @import("png/structure.zig").inspect(bytes, .{});
        return .{ .mime = "image/png", .extension = "png" };
    }
    if (std.mem.startsWith(u8, bytes, &.{ 0xff, 0xd8 })) {
        _ = try @import("jpeg/structure.zig").inspect(bytes, .{});
        return .{ .mime = "image/jpeg", .extension = "jpg" };
    }
    return error.UnsupportedReplacementImageFormat;
}
