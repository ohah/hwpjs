pub const allocator = @import("std").heap.wasm_allocator;
export fn cfb_alloc(size: usize) ?[*]u8 {
    const bytes = allocator.alloc(u8, @max(size, 1)) catch return null;
    return bytes.ptr;
}
export fn cfb_free(ptr: [*]u8, size: usize) void {
    allocator.free(ptr[0..@max(size, 1)]);
}
