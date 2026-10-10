//! Explicit plaintext conversion ABI, separate from ordinary reader/session.
var result: @import("password_result.zig").Result = .{};
export fn hwpx_password_free() void {
    result.free();
}
export fn hwpx_password_ptr() usize {
    return result.ptr();
}
export fn hwpx_password_len() usize {
    return result.len();
}
/// 0: error; 1: owned plaintext ZIP; 2: no encryption/rewrite.
/// Caller owns and must clear password input after this synchronous call.
export fn hwpx_password_decrypt(ptr: [*]const u8, size: usize, password: [*]const u8, password_size: usize) u32 {
    return result.decrypt(@import("../hwpx/password_package.zig").decryptToPlaintext, ptr, size, password, password_size);
}
