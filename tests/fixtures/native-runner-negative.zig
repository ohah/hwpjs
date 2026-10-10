const std = @import("std");

test "pass control" { try std.testing.expect(true); }
test "failure control" { try std.testing.expect(false); }
test "skip control" { return error.SkipZigTest; }
test "leak control" { _ = try std.testing.allocator.alloc(u8, 8); }
test "error log control" { std.log.err("intentional native runner error control", .{}); }
