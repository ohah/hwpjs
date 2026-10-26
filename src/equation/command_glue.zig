const std = @import("std");
// 명령과 기호가 같은 접두어 경계 정책을 사용합니다.
pub const Policy = enum {
    none,
    alphanumeric,
    digit,
    pub fn permits(self: Policy, next: u8) bool {
        return switch (self) {
            .none => false,
            .alphanumeric => std.ascii.isAlphanumeric(next),
            .digit => std.ascii.isDigit(next),
        };
    }
};
