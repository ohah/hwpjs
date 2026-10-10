//! Explicit new plaintext CFB, independent of reader/editor state.
var result: @import("password_result.zig").Result = .{};
export fn hwp5_password_free() void {
    result.free();
}
export fn hwp5_password_ptr() usize {
    return result.ptr();
}
export fn hwp5_password_len() usize {
    return result.len();
}
/// 0 error, 1 owned plaintext CFB, 2 no encryption/rewrite.
export fn hwp5_password_decrypt(ptr: [*]const u8, size: usize, password: [*]const u8, password_size: usize) u32 {
    return result.decrypt(@import("../hwp5/password_package.zig").decryptToPlaintext, ptr, size, password, password_size);
}
