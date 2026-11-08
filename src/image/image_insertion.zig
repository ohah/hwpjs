//! 독립 그림 삽입 요청의 공통 계약입니다. 문단 주소의 존재·소속 검증은 형식별 계획기가 소유합니다.
const std = @import("std");
const scalars = @import("../text/scalars.zig");
pub const picture_input = @import("picture_input.zig");
pub const max_text_bytes = 4 * 1024 * 1024;

pub const Target = struct {
    section: u32,
    /// HWP5는 구역 내 0 기반, HWPX는 문서 전체 1 기반 Native 번호입니다.
    paragraph: u32,
    unit: u32,
};
pub const Request = struct {
    expected_source_sha256: [32]u8,
    target: Target,
    /// Native 읽기가 제공한 원문 UTF-8입니다. CR·컨트롤을 정규화하지 않습니다.
    expected_text: []const u8,
    /// HWPUNIT 원값입니다. 1 HWPUNIT = 1/7200 인치이며 mm 변환을 하지 않습니다.
    width: u32,
    height: u32,
};
pub const Size = struct { width: u32, height: u32 };

pub const Result = struct {
    bytes: []u8,
    resource_path: []u8,
    instance_id: u32,
    layout_requires_reflow: bool = true,
    preview_stale: bool = true,

    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        a.free(self.resource_path);
        self.* = undefined;
    }
};

/// 원문 UTF-16 바이트를 정규화 없이 UTF-8로 변환합니다. 잘못된 surrogate는 추측하지 않습니다.
pub fn utf8FromUtf16(a: std.mem.Allocator, raw: []const u8) ![]u8 {
    if (raw.len > max_text_bytes) return error.LimitExceeded;
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    var offset: usize = 0;
    while (try scalars.read(raw, offset, .utf16le)) |scalar| {
        var bytes: [4]u8 = undefined;
        const length = try std.unicode.utf8Encode(scalar.value, &bytes);
        if (length > max_text_bytes -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, bytes[0..length]);
        offset = scalar.end;
    }
    return output.toOwnedSlice(a);
}

pub fn size(request: Request) !Size {
    // 그림 사각형·회전 중심의 좌표도 같은 값을 signed i32로 표현해야 합니다.
    if (request.width == 0 or request.height == 0 or request.width > std.math.maxInt(i32) or request.height > std.math.maxInt(i32)) return error.InvalidPictureInsertionSize;
    return .{ .width = request.width, .height = request.height };
}

pub fn verifySource(input: []const u8, expected: [32]u8) !void {
    if (input.len == 0 or input.len > picture_input.max_document_bytes) return error.LimitExceeded;
    var actual: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &actual, .{});
    if (!std.mem.eql(u8, &actual, &expected)) return error.SourceHashMismatch;
}

/// 정확한 UTF-16 경계에 대응하는 UTF-8 오프셋입니다. 형식별 컨트롤 보호를 대체하지 않습니다.
pub fn byteOffset(text: []const u8, unit: u32) !usize {
    if (text.len > max_text_bytes) return error.LimitExceeded;
    var offset: usize = 0;
    var units: u32 = 0;
    var found: ?usize = null;
    while (try scalars.read(text, offset, .utf8)) |scalar| {
        if (units == unit) found = offset;
        const count: u32 = if (scalar.value > 0xffff) 2 else 1;
        if (unit > units and unit < units + count) return error.InvalidPictureInsertionPosition;
        units += count;
        offset = scalar.end;
    }
    if (units == unit) found = text.len;
    return found orelse error.InvalidPictureInsertionPosition;
}

pub fn verifyText(actual: []const u8, request: Request) !usize {
    if (actual.len > max_text_bytes or request.expected_text.len > max_text_bytes) return error.LimitExceeded;
    if (!std.mem.eql(u8, actual, request.expected_text)) return error.PictureInsertionTextMismatch;
    return byteOffset(actual, request.target.unit);
}

/// 호출자는 원문 SHA·Native 문단 소속·컨트롤 경계를 확인한 뒤에만 후보 파일을 만들 수 있습니다.
pub const ValidatedInput = struct { size: Size, media: picture_input.Media };

pub fn validateInput(input: []const u8, image: []const u8, request: Request) !ValidatedInput {
    try verifySource(input, request.expected_source_sha256);
    const media = try picture_input.inspectImage(image, picture_input.max_image_bytes);
    if (request.expected_text.len > max_text_bytes) return error.LimitExceeded;
    _ = try byteOffset(request.expected_text, request.target.unit);
    return .{ .size = try size(request), .media = media };
}
