//! 독립 변환 ABI의 출력 소유권입니다. 편집 세션·이력을 참조하지 않습니다.
const std = @import("std");
const replacement = @import("picture_resource_replacement.zig");

pub const Output = struct {
    allocator: std.mem.Allocator,
    bytes: ?[]u8 = null,

    pub fn clear(self: *Output) void {
        if (self.bytes) |bytes| self.allocator.free(bytes);
        self.bytes = null;
    }

    // 입력이 이전 출력과 같은 버퍼여도 후보가 완성될 때까지 원본을 유지합니다.
    pub fn replace(self: *Output, input: []const u8, section: usize, picture: usize, image: []const u8) !void {
        const candidate = try replacement.prepare(self.allocator, input, section, picture, image, .{});
        self.allocator.free(candidate.resource_id);
        self.allocator.free(candidate.resource_path);
        self.clear();
        self.bytes = candidate.bytes;
    }
};
