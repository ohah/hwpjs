//! 새 WASM 인스턴스 전용 파일 바이트 변환 ABI입니다.
const allocator = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const owner = @import("picture_file_replace_output.zig");
var output: owner.Output = .{ .allocator = allocator };

export fn picture_file_replace_free() void {
    output.clear();
}
export fn picture_file_replace_ptr() usize {
    return if (output.bytes) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn picture_file_replace_len() usize {
    return if (output.bytes) |bytes| bytes.len else 0;
}
export fn picture_file_replace(format: u32, input_ptr: [*]const u8, input_size: usize, section: u32, picture_node: u32, image_ptr: [*]const u8, image_size: usize) u32 {
    // 슬라이스 생성 전 길이를 검사하며 실패 시 이전 출력도 폐기합니다.
    owner.validateRequest(format, input_size, image_size) catch |err| {
        output.clear();
        _ = errors.fail(err);
        return 0;
    };
    output.replace(format, input_ptr[0..input_size], section, picture_node, image_ptr[0..image_size]) catch |err| {
        _ = errors.fail(err);
        return 0;
    };
    return 1;
}
