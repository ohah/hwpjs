//! 독립 그림 삽입 결과만 소유합니다. 열린 편집 세션·다른 파일 변환 출력과 공유하지 않습니다.
const std = @import("std");
const insertion = @import("../image/image_insertion.zig");
const wire = @import("image_file_insert_request.zig");

pub fn validateSizes(format: u32, input_len: usize, request_len: usize, image_len: usize) !void {
    if (format != 1 and format != 2) return error.InvalidDocumentFormat;
    if (input_len == 0 or input_len > insertion.picture_input.max_document_bytes or image_len == 0 or image_len > insertion.picture_input.max_image_bytes) return error.LimitExceeded;
    if (request_len < wire.header_bytes or request_len > wire.max_bytes) return error.InvalidImageInsertionRequestLength;
}

pub const Output = struct {
    allocator: std.mem.Allocator,
    bytes: ?[]u8 = null,

    pub fn clear(self: *Output) void {
        if (self.bytes) |bytes| self.allocator.free(bytes);
        self.bytes = null;
    }

    pub fn replace(self: *Output, format: u32, input: []const u8, request_bytes: []const u8, image: []const u8) !void {
        const previous = self.bytes;
        self.bytes = null;
        // 이전 출력과 입력/요청/이미지가 겹쳐도 이번 호출이 끝날 때까지 할당을 유지합니다.
        defer if (previous) |bytes| self.allocator.free(bytes);
        try validateSizes(format, input.len, request_bytes.len, image.len);
        const request = try wire.decode(request_bytes);
        const result = switch (format) {
            1 => try @import("../hwp5/edit/image_insertion_file.zig").prepare(self.allocator, input, image, request),
            2 => try @import("../hwpx/image_insertion_file.zig").prepare(self.allocator, input, image, request),
            else => unreachable,
        };
        self.allocator.free(result.resource_path);
        self.bytes = result.bytes;
    }
};
