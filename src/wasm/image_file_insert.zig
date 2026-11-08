//! 새 WASM 인스턴스에서 사용하는 독립 파일 삽입 ABI입니다. 전역 ABI 버전은 변경하지 않습니다.
const a = @import("memory.zig").allocator;
const errors = @import("cfb.zig");
const owner = @import("image_file_insert_output.zig");
var output: owner.Output = .{ .allocator = a };

export fn image_file_insert_ptr() usize {
    return if (output.bytes) |bytes| @intFromPtr(bytes.ptr) else 0;
}
export fn image_file_insert_len() usize {
    return if (output.bytes) |bytes| bytes.len else 0;
}
export fn image_file_insert_free() void {
    output.clear();
}
fn validRange(ptr: [*]const u8, length: usize) bool {
    const maximum: u64 = @as(u64, @wasmMemorySize(0)) * 65536;
    const address: u64 = @intFromPtr(ptr);
    return address <= maximum and @as(u64, length) <= maximum - address;
}

export fn image_file_insert(format: u32, input_ptr: [*]const u8, input_size: usize, request_ptr: [*]const u8, request_size: usize, image_ptr: [*]const u8, image_size: usize) u32 {
    // 길이와 실제 선형 메모리 범위를 검사한 뒤에만 외부 포인터를 슬라이스로 만듭니다.
    owner.validateSizes(format, input_size, request_size, image_size) catch |err| {
        output.clear();
        _ = errors.fail(err);
        return 0;
    };
    if (!validRange(input_ptr, input_size) or !validRange(request_ptr, request_size) or !validRange(image_ptr, image_size)) {
        output.clear();
        _ = errors.fail(error.InvalidMemoryRange);
        return 0;
    }
    output.replace(format, input_ptr[0..input_size], request_ptr[0..request_size], image_ptr[0..image_size]) catch |err| {
        _ = errors.fail(err);
        return 0;
    };
    return 1;
}
