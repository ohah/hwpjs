//! Keep allocation classes stable when resizing WASM buffers.
const std = @import("std");
const backing = std.heap.wasm_allocator;
// Read leases compare allocator identities. A stateless vtable still needs a
// defined context pointer; comparing an undefined pointer is undefined behavior.
var identity: u8 = 0;
pub const allocator: std.mem.Allocator = .{ .ptr = &identity, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
fn sameClass(old_len: usize, new_len: usize, alignment: std.mem.Alignment) bool {
    const old_size = std.math.ceilPowerOfTwo(usize, @max(old_len +| @sizeOf(usize), alignment.toByteUnits())) catch return false;
    const new_size = std.math.ceilPowerOfTwo(usize, @max(new_len +| @sizeOf(usize), alignment.toByteUnits())) catch return false;
    return old_size == new_size;
}
fn alloc(_: *anyopaque, len: usize, alignment: std.mem.Alignment, ra: usize) ?[*]u8 {
    return backing.rawAlloc(len, alignment, ra);
}
fn resize(_: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, len: usize, ra: usize) bool {
    if (!sameClass(bytes.len, len, alignment)) return false;
    return backing.rawResize(bytes, alignment, len, ra);
}
fn remap(_: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, len: usize, ra: usize) ?[*]u8 {
    if (!sameClass(bytes.len, len, alignment)) return null;
    return backing.rawRemap(bytes, alignment, len, ra);
}
fn free(_: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, ra: usize) void {
    backing.rawFree(bytes, alignment, ra);
}
