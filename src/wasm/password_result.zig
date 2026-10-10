//! Shared password-result ownership; formats keep independent state.
const std = @import("std");
const allocator = @import("memory.zig").allocator;
pub const Result = struct {
    output: ?[]u8 = null,
    pub fn free(self: *Result) void {
        if (self.output) |bytes| {
            std.crypto.secureZero(u8, bytes);
            allocator.free(bytes);
        }
        self.output = null;
    }
    pub fn ptr(self: *const Result) usize {
        return if (self.output) |bytes| @intFromPtr(bytes.ptr) else 0;
    }
    pub fn len(self: *const Result) usize {
        return if (self.output) |bytes| bytes.len else 0;
    }
    pub fn decrypt(self: *Result, comptime convert: anytype, input: [*]const u8, size: usize, password: [*]const u8, password_size: usize) u32 {
        self.free();
        if (size > 64 * 1024 * 1024 or password_size > 4096) {
            _ = @import("cfb.zig").fail(error.LimitExceeded);
            return 0;
        }
        self.output = convert(allocator, input[0..size], password[0..password_size], .{}) catch |err| {
            _ = @import("cfb.zig").fail(err);
            return 0;
        };
        return if (self.output != null) 1 else 2;
    }
};
