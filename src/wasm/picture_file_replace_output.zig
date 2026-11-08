//! 독립 파일 변환의 출력 소유권입니다. 열린 문서·Session·이력에는 접근하지 않습니다.
const std = @import("std");
const policy = @import("../image/picture_input.zig");

pub fn validateRequest(format: u32, input_size: usize, image_size: usize) !void {
    if (format < 1 or format > 2) return error.InvalidDocumentFormat;
    if (input_size == 0 or input_size > policy.max_document_bytes or image_size == 0 or image_size > policy.max_image_bytes) return error.LimitExceeded;
}

pub const Output = struct {
    allocator: std.mem.Allocator,
    bytes: ?[]u8 = null,

    pub fn clear(self: *Output) void {
        if (self.bytes) |bytes| self.allocator.free(bytes);
        self.bytes = null;
    }

    pub fn replace(self: *Output, format: u32, input: []const u8, section: u32, picture: u32, image: []const u8) !void {
        // 외부 관측은 즉시 비우되, 이전 출력과 입력이 겹쳐도 호출 종료까지 할당을 유지합니다.
        const previous = self.bytes;
        self.bytes = null;
        defer if (previous) |bytes| self.allocator.free(bytes);
        try validateRequest(format, input.len, image.len);
        switch (format) {
            1 => {
                const result = try @import("../hwp5/edit/picture_resource_replacement.zig").prepare(self.allocator, input, section, picture, image, .{});
                self.allocator.free(result.resource_path);
                self.bytes = result.bytes;
            },
            2 => {
                const result = try @import("../hwpx/picture_resource_replacement.zig").prepare(self.allocator, input, section, picture, image, .{});
                self.allocator.free(result.resource_id);
                self.allocator.free(result.resource_path);
                self.bytes = result.bytes;
            },
            else => return error.InvalidDocumentFormat,
        }
    }
};
