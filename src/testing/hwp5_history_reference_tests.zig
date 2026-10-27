//! 정규 root가 소유하는 회귀. baseline 모듈과 실패 할당 SSOT의 소유권을 섞지 않는다.
const std = @import("std");
const baseline = @import("baseline");
const a = std.testing.allocator;
fn input() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
}
test "HWP5 fixed reference: 입력과 요청의 모든 키 불일치는 명시 거부" {
    const bytes = try input();
    defer a.free(bytes);
    try std.testing.expectError(error.ReferenceInputMismatch, baseline.current20(a, "다른 입력"));
    const wrong = [_]baseline.Request{
        .{ .kind = .format, .section = 1 }, .{ .kind = .format, .paragraph = 16 },
        .{ .kind = .format, .node = 1 },    .{ .kind = .format, .width = 1 },
        .{ .kind = .format, .height = 1 },  .{ .kind = .table },
        .{ .kind = .picture },
    };
    for (wrong) |request| try std.testing.expectError(error.ReferenceRequestMismatch, baseline.run(a, bytes, request));
    try std.testing.expectError(error.ReferenceRequestMismatch, baseline.refusal(a, bytes, .noop_external, 1));
    try std.testing.expectError(error.ReferenceRequestMismatch, baseline.refusal(a, bytes, .payload, null));
    try std.testing.expectError(error.ReferenceRequestMismatch, baseline.refusal(a, bytes, .payload, 1));
}
fn cloneFailure(allocator: std.mem.Allocator, bytes: []const u8) !void {
    var result = try baseline.run(allocator, bytes, .{ .kind = .format });
    defer result.deinit();
    for (result.states) |value| try std.testing.expect(value.len > 0);
}
test "HWP5 fixed reference: 부분 복제 OOM과 해제는 원 golden 소유권을 보존" {
    const bytes = try input();
    defer a.free(bytes);
    try @import("allocation_failures.zig").check(cloneFailure, .{bytes});
}
test "HWP5 fixed reference: old 요청9종의 저장값 오류 budget은 고정 계약과 일치" {
    const bytes = try input();
    defer a.free(bytes);
    const requests = [_]baseline.Request{
        .{ .kind = .format },
        .{ .kind = .table, .node = 21, .width = 5721, .height = 2149 },
        .{ .kind = .picture, .node = 14, .width = 48105, .height = 6134 },
    };
    for (requests) |request| {
        var result = try baseline.run(a, bytes, request);
        defer result.deinit();
        var digest: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(result.states[0], &digest, .{});
        try std.testing.expectEqualStrings("3544803d6faec763ae280ff05faaa4a4cdeecd5bfc091aa4aab460c37029eade", &std.fmt.bytesToHex(digest, .lower));
    }
    const changed = try baseline.current20(a, bytes);
    defer a.free(changed);
    try std.testing.expect(changed.len > 0);
    const cost = try baseline.payloadCost(a, bytes);
    try std.testing.expect(cost > 0);
    try std.testing.expectError(error.LimitExceeded, baseline.refusal(a, bytes, .payload, @intCast(cost - 1)));
    const err = (try baseline.refusal(a, bytes, .payload, @intCast(cost))) orelse return error.MissingBudgetReference;
    try std.testing.expectEqualStrings("LimitExceeded", err);
    inline for (.{ .noop_external, .changed_external, .failed_batch }) |kind| {
        const output = (try baseline.refusal(a, bytes, kind, null)) orelse return error.MissingSavedReference;
        defer a.free(output);
        try std.testing.expect(output.len > 0);
    }
}
