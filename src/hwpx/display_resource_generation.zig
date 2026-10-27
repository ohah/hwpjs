//! 표시 자원의 동일성 증명이다. 편집 권한이나 현재 좌표를 부여하지 않는다.
const std = @import("std");
pub const Clock = struct {
    next_token: u64 = 1,
    pub fn issue(self: *Clock) u64 {
        const token = self.next_token;
        if (token == 0) return 0;
        self.next_token = std.math.add(u64, token, 1) catch 0;
        return token;
    }
};
// 이 모듈의 실사용 범위는 단일 스레드 WASM 인스턴스다.
var clock: Clock = .{};
pub fn openOwned(session: anytype) void {
    session.display_resource_document = clock.issue();
    session.display_resource_generation = clock.issue();
    session.display_resource_trusted = session.display_resource_document != 0 and session.display_resource_generation != 0;
    session.display_resource_recoverable = session.display_resource_trusted;
}
// 실패 직후에는 값을 재사용하지 않는다. 복구 가능 여부 자체는 보존한다.
pub fn pauseReceipt(session: anytype) void {
    session.display_resource_trusted = false;
}
pub fn block(session: anytype) void {
    session.display_resource_trusted = false;
    session.display_resource_recoverable = false;
}
// 호출자는 기존 owned current snapshot의 source/전체 논리 상태 대조 결과만 전달한다.
// 이 함수는 세대나 문서 상태를 바꾸지 않으며 추가 전체 문서 대조도 수행하지 않는다.
pub fn observedOwnedMatch(session: anytype, same: bool) void {
    if (!same) {
        block(session);
        return;
    }
    if (session.display_resource_recoverable and session.display_resource_document != 0 and session.display_resource_generation != 0)
        session.display_resource_trusted = true;
}
// 실제 WASM history 분기와 Native 집중 검사가 같은 오류 경계를 사용한다.
pub fn applyOwned(history: anytype, session: anytype, commands: []const @import("editor_history.zig").Command) anyerror!bool {
    // 실패한 foreign 호출은 그 Session의 표시 상태도 바꾸지 않는다.
    errdefer if (history.ownsSession(session)) pauseReceipt(session);
    return history.applyBatch(session, commands);
}
pub fn afterTravel(session: anytype, changed: bool) void {
    if (!changed) pauseReceipt(session);
}
pub fn afterCommands(session: anytype, commands: anytype, changed: bool) void {
    // pause는 재인증만 막는다. 등록된 문서의 실제 resource 변경 발급은 멈추지 않는다.
    if (session.display_resource_document == 0 or session.display_resource_generation == 0) return;
    if (!changed or commands.len == 0) {
        pauseReceipt(session);
        return;
    }
    // 단순 텍스트 경로의 실제 쓰기 범위 감사에 의존한다. JS 메시지 kind를 신뢰하지 않는다.
    for (commands) |command| {
        if (command.kind != .plain) {
            session.display_resource_generation = clock.issue();
            if (session.display_resource_generation == 0) block(session);
            return;
        }
    }
}
pub fn write(session: anytype, bytes: *[24]u8) void {
    const valid = session.display_resource_trusted and session.display_resource_recoverable and session.display_resource_document != 0 and session.display_resource_generation != 0;
    std.mem.writeInt(u32, bytes[0..4], 1, .little);
    std.mem.writeInt(u32, bytes[4..8], @intFromBool(valid), .little);
    std.mem.writeInt(u64, bytes[8..16], if (valid) session.display_resource_document else 0, .little);
    std.mem.writeInt(u64, bytes[16..24], if (valid) session.display_resource_generation else 0, .little);
}

test "HX resource receipt: overflow never reuses a token" {
    var c: Clock = .{ .next_token = std.math.maxInt(u64) };
    try std.testing.expectEqual(std.math.maxInt(u64), c.issue());
    try std.testing.expectEqual(@as(u64, 0), c.issue());
    try std.testing.expectEqual(@as(u64, 0), c.issue());
}
test "HX resource receipt: plain text preserves generation and formatting issues a new one" {
    const Session = struct { display_resource_document: u64 = 0, display_resource_generation: u64 = 0, display_resource_trusted: bool = false, display_resource_recoverable: bool = false };
    const Command = struct { kind: enum { plain, format } };
    var s: Session = .{};
    openOwned(&s);
    const initial = s.display_resource_generation;
    afterCommands(&s, &[_]Command{.{ .kind = .plain }}, true);
    try std.testing.expectEqual(initial, s.display_resource_generation);
    afterCommands(&s, &[_]Command{.{ .kind = .format }}, true);
    try std.testing.expect(s.display_resource_generation != initial);
    const formatted = s.display_resource_generation;
    // 실제 분기/undo 복원은 통합 케이스에서 검사하며 여기서는 발급 연속성만 검사한다.
    afterCommands(&s, &[_]Command{.{ .kind = .format }}, true);
    try std.testing.expect(s.display_resource_generation != initial and s.display_resource_generation != formatted);
    afterCommands(&s, &[_]Command{.{ .kind = .plain }}, false);
    var bytes: [24]u8 = undefined;
    write(&s, &bytes);
    try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, bytes[4..8], .little));
}

test "HX resource receipt: blocked state cannot reauthenticate from matching boolean alone" {
    const Session = struct {
        display_resource_document: u64 = 0,
        display_resource_generation: u64 = 0,
        display_resource_trusted: bool = false,
        display_resource_recoverable: bool = false,
    };
    var s: Session = .{};
    observedOwnedMatch(&s, true);
    try std.testing.expect(!s.display_resource_trusted);
    openOwned(&s);
    const generation = s.display_resource_generation;
    pauseReceipt(&s);
    observedOwnedMatch(&s, true);
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(generation, s.display_resource_generation);
    block(&s);
    observedOwnedMatch(&s, true);
    try std.testing.expect(!s.display_resource_trusted);
}

test "SSOT resource union: paused formatting issues a new token without granting trust" {
    const Session = struct { display_resource_document: u64 = 0, display_resource_generation: u64 = 0, display_resource_trusted: bool = false, display_resource_recoverable: bool = false };
    const Command = struct { kind: enum { plain, format } };
    var session: Session = .{};
    openOwned(&session);
    const old = session.display_resource_generation;
    pauseReceipt(&session);
    afterCommands(&session, &[_]Command{.{ .kind = .format }}, true);
    try std.testing.expect(session.display_resource_generation != old);
    try std.testing.expect(!session.display_resource_trusted);
    const formatted = session.display_resource_generation;
    observedOwnedMatch(&session, true);
    try std.testing.expect(session.display_resource_trusted);
    try std.testing.expectEqual(formatted, session.display_resource_generation);
    block(&session);
    afterCommands(&session, &[_]Command{.{ .kind = .format }}, true);
    observedOwnedMatch(&session, true);
    try std.testing.expect(!session.display_resource_trusted and !session.display_resource_recoverable);
}
