//! 버전 1 그림 삽입 요청: 고정 64바이트 LE 헤더 뒤에 정확한 UTF-8 원문이 이어집니다.
const std = @import("std");
const insertion = @import("../image/image_insertion.zig");
pub const header_bytes = 64;
pub const max_bytes = 4 * 1024 * 1024;

fn word(bytes: []const u8, at: usize) u32 {
    return std.mem.readInt(u32, bytes[at..][0..4], .little);
}

/// 반환 원문의 수명은 요청 버퍼와 같습니다. SHA·숫자는 값으로 복사합니다.
pub fn decode(bytes: []const u8) !insertion.Request {
    if (bytes.len < header_bytes or bytes.len > max_bytes) return error.InvalidImageInsertionRequestLength;
    if (word(bytes, 0) != 1 or word(bytes, 28) != 0) return error.InvalidImageInsertionRequest;
    if (word(bytes, 24) != bytes.len - header_bytes) return error.InvalidImageInsertionRequestLength;
    var digest: [32]u8 = undefined;
    @memcpy(&digest, bytes[32..64]);
    const request: insertion.Request = .{
        .expected_source_sha256 = digest,
        .target = .{ .section = word(bytes, 4), .paragraph = word(bytes, 8), .unit = word(bytes, 12) },
        .width = word(bytes, 16),
        .height = word(bytes, 20),
        .expected_text = bytes[header_bytes..],
    };
    _ = try insertion.size(request);
    _ = try insertion.byteOffset(request.expected_text, request.target.unit);
    return request;
}
