const std = @import("std");
const service = @import("context.zig");
const policy = @import("../model/history_policy.zig");
test "NativeContext V2 기본 정책은 공통 SSOT를 사용한다" {
    const p = try policy.resolve(.{});
    try std.testing.expectEqual(@as(u32, 256), p.max_entries);
    try std.testing.expectEqual(@as(u32, 128 * 1024 * 1024), p.max_retained_bytes);
}
test "NativeContext 잘못된 정책은 문서 파싱 전 거부한다" {
    var bridge = service.Bridge.init(std.testing.allocator);
    defer bridge.deinit();
    try std.testing.expectError(error.InvalidHistoryOptions, bridge.openWithHistory(.hwp5, "invalid", .{ .max_entries = 0 }));
    try std.testing.expectEqual(@as(usize, 0), bridge.contexts.items.len);
}
test "NativeContext State 기존 C ABI 크기를 유지한다" {
    try std.testing.expectEqual(@as(usize, 20), @sizeOf(service.State));
    try std.testing.expectEqual(@as(usize, 8), @sizeOf(service.Token));
}

fn syntheticBridge(a: std.mem.Allocator) !service.Bridge {
    var bridge = service.Bridge.init(a);
    errdefer bridge.deinit();
    const ctx = try a.create(service.Context);
    errdefer a.destroy(ctx);
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p></s:sec>";
    ctx.* = .{ .allocator = a, .document = .{ .hwpx = .{ .session = try @import("../hwpx/editor_history_test_fixture.zig").open(a, xml, 1), .history = undefined } } };
    const d = &ctx.document.hwpx;
    errdefer d.session.deinit();
    d.history = try @import("../hwpx/editor_history.zig").History.initV2(&d.session, .{});
    errdefer d.history.deinit();
    try bridge.contexts.append(a, .{ .value = ctx });
    return bridge;
}
test "NativeContext V2 실제 문서 모델 100입력 undo100 redo100" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    for (0..100) |_| try std.testing.expect(try ctx.splice(ctx.revision, 0, 1, 0, 0, "X"));
    try std.testing.expectEqual(@as(u32, 100), ctx.state().history_revision);
    try std.testing.expectEqual(@as(u32, 100), ctx.state().undo_count);
    for (0..100) |_| try std.testing.expect(try ctx.moveHistory(ctx.revision, false));
    try std.testing.expectEqual(@as(u32, 0), ctx.state().history_revision);
    try std.testing.expectEqualStrings("A", ctx.document.hwpx.session.sections[0].sites.items[0].text);
    for (0..100) |_| try std.testing.expect(try ctx.moveHistory(ctx.revision, true));
    try std.testing.expectEqual(@as(u32, 100), ctx.state().history_revision);
    try std.testing.expectEqual(@as(usize, 101), ctx.document.hwpx.session.sections[0].sites.items[0].text.len);
}
test "NativeContext V2 잘못된 입력은 revision을 바꾸지 않는다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    _ = ctx.splice(0, 0, 1, 99999, 0, "X") catch {};
    try std.testing.expectEqual(@as(u32, 0), ctx.revision);
    try std.testing.expectEqualStrings("A", ctx.document.hwpx.session.sections[0].sites.items[0].text);
}
test "NativeContext V2 개별 예산은 다른 세션으로 누출하지 않는다" {
    var first = try syntheticBridge(std.testing.allocator);
    defer first.deinit();
    var second = try syntheticBridge(std.testing.allocator);
    defer second.deinit();
    const a = try first.get(.{ .slot = 1, .generation = 1 });
    const b = try second.get(.{ .slot = 1, .generation = 1 });
    try a.configureHistory(0, .{ .max_entries = 2 });
    try std.testing.expectEqual(@as(?u32, 2), a.historyStats().resolved.maxEntries);
    try std.testing.expectEqual(@as(?u32, 256), b.historyStats().resolved.maxEntries);
    try std.testing.expect(try a.splice(0, 0, 1, 0, 0, "X"));
    try std.testing.expectError(error.HistoryAlreadyActive, a.configureHistory(a.revision, .{}));
}

test "NativeContext V2 OOM 후 원문과 revision 원자성" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var bridge = try syntheticBridge(a);
            defer bridge.deinit();
            const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
            _ = ctx.splice(0, 0, 1, 0, 0, "X") catch |err| {
                try std.testing.expectEqual(@as(u32, 0), ctx.revision);
                try std.testing.expectEqualStrings("A", ctx.document.hwpx.session.sections[0].sites.items[0].text);
                return err;
            };
        }
    }.run, .{});
}
test "NativeContext V2 u32 fence는 변경 전에 거부한다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    ctx.revision = std.math.maxInt(u32);
    try std.testing.expectError(error.LimitExceeded, ctx.splice(ctx.revision, 0, 1, 0, 0, "X"));
    try std.testing.expectEqualStrings("A", ctx.document.hwpx.session.sections[0].sites.items[0].text);
}
test "NativeContext V2 poison는 조회와 복구 역할을 구분한다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    ctx.document.hwpx.history.owned.?.poisoned = true;
    try std.testing.expect(ctx.historyStats().poisoned);
    try std.testing.expectError(error.HistoryMutationUncertain, ctx.splice(0, 0, 1, 0, 0, "X"));
    try std.testing.expectError(error.HistoryMutationUncertain, bridge.save(.{ .slot = 1, .generation = 1 }, 0, true));
    // refresh/projection은 poison을 지우지 않습니다. 새 Context를 열어 복구합니다.
    try std.testing.expect(ctx.historyStats().poisoned);
}

test "NativeContext V2 HWP5 원본 저장 100입력 undo100 redo100" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var bridge = service.Bridge.init(a);
    defer bridge.deinit();
    const token = try bridge.open(.hwp5, input);
    const ctx = try bridge.get(token);
    for (0..100) |_| try std.testing.expect(try ctx.splice(ctx.revision, 0, 1, 0, 0, "X"));
    const edited = try bridge.save(token, ctx.revision, true);
    defer bridge.release(edited.token) catch unreachable;
    for (0..100) |_| try std.testing.expect(try ctx.moveHistory(ctx.revision, false));
    const original = try bridge.save(token, ctx.revision, false);
    defer bridge.release(original.token) catch unreachable;
    try std.testing.expectEqualSlices(u8, input, try bridge.output(original.token));
    for (0..100) |_| try std.testing.expect(try ctx.moveHistory(ctx.revision, true));
    const redone = try bridge.save(token, ctx.revision, true);
    defer bridge.release(redone.token) catch unreachable;
    try std.testing.expectEqualSlices(u8, try bridge.output(edited.token), try bridge.output(redone.token));
}

test "NativeContext V2 HWPX owner는 최종 세션 주소와 같다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    try std.testing.expect(ctx.document.hwpx.history.owned.?.owner == &ctx.document.hwpx.session);
    try ctx.configureHistory(0, .{ .max_entries = 12 });
    try std.testing.expect(ctx.document.hwpx.history.owned.?.owner == &ctx.document.hwpx.session);
}
test "NativeContext V2 noop과 오래된 요청은 revision을 바꾸지 않는다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    try std.testing.expect(!try ctx.splice(0, 0, 1, 0, 0, ""));
    try std.testing.expect(!try ctx.moveHistory(0, false));
    try std.testing.expectError(error.StaleRevision, ctx.splice(1, 0, 1, 0, 0, "X"));
    try std.testing.expectEqual(@as(u32, 0), ctx.revision);
    try std.testing.expectEqual(@as(u32, 0), ctx.state().undo_count);
}
test "NativeContext V2 초기 root보다 작은 재설정은 기존 root를 보존한다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    const before = ctx.document.hwpx.history.owned.?;
    const before_stats = ctx.historyStats();
    if (ctx.configureHistory(0, .{ .max_retained_bytes = 1 })) |_| {
        return error.TestUnexpectedResult;
    } else |_| {}
    try std.testing.expect(ctx.document.hwpx.history.owned.? == before);
    try std.testing.expectEqual(before_stats.retainedBytes, ctx.historyStats().retainedBytes);
    try std.testing.expectEqual(before_stats.resolved.maxRetainedBytes, ctx.historyStats().resolved.maxRetainedBytes);
    try std.testing.expectEqual(@as(u32, 0), ctx.revision);
    try std.testing.expect(try ctx.splice(0, 0, 1, 0, 0, "X"));
}
test "NativeContext V2 poison를 configure로 지울 수 없다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    ctx.document.hwpx.history.owned.?.poisoned = true;
    try std.testing.expectError(error.HistoryMutationUncertain, ctx.configureHistory(0, .{}));
    try std.testing.expectError(error.HistoryMutationUncertain, ctx.moveHistory(0, false));
    try std.testing.expect(ctx.historyStats().poisoned);
}

test "NativeContext V2 정책 재설정 OOM은 이전 이력을 보존한다" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var bridge = try syntheticBridge(a);
            defer bridge.deinit();
            const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
            const before = ctx.document.hwpx.history.owned.?;
            ctx.configureHistory(0, .{ .max_entries = 12 }) catch |err| {
                try std.testing.expect(ctx.document.hwpx.history.owned.? == before);
                try std.testing.expectEqual(@as(?u32, 256), ctx.historyStats().resolved.maxEntries);
                try std.testing.expectEqual(@as(u32, 0), ctx.revision);
                return err;
            };
        }
    }.run, .{});
}
test "NativeContext V2 history revision 한도는 원문 변경 전에 거부한다" {
    var bridge = try syntheticBridge(std.testing.allocator);
    defer bridge.deinit();
    const ctx = try bridge.get(.{ .slot = 1, .generation = 1 });
    ctx.document.hwpx.history.owned.?.stack.next_revision = std.math.maxInt(u32);
    try std.testing.expectError(error.HistoryRevisionExhausted, ctx.splice(0, 0, 1, 0, 0, "X"));
    try std.testing.expectEqual(@as(u32, 0), ctx.revision);
    try std.testing.expectEqualStrings("A", ctx.document.hwpx.session.sections[0].sites.items[0].text);
}

test "NativeContext V2 실제 HWPX owner와 원본 저장 100입력 undo100 redo100" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var bridge = service.Bridge.init(a);
    defer bridge.deinit();
    const token = try bridge.open(.hwpx, input);
    const ctx = try bridge.get(token);
    try std.testing.expect(ctx.document.hwpx.history.owned.?.owner == &ctx.document.hwpx.session);
    for (0..100) |_| try std.testing.expect(try ctx.splice(ctx.revision, 0, 1, 0, 0, "X"));
    const edited = try bridge.save(token, ctx.revision, true);
    defer bridge.release(edited.token) catch unreachable;
    for (0..100) |_| try std.testing.expect(try ctx.moveHistory(ctx.revision, false));
    const original = try bridge.save(token, ctx.revision, false);
    defer bridge.release(original.token) catch unreachable;
    try std.testing.expectEqualSlices(u8, input, try bridge.output(original.token));
    for (0..100) |_| try std.testing.expect(try ctx.moveHistory(ctx.revision, true));
    const redone = try bridge.save(token, ctx.revision, true);
    defer bridge.release(redone.token) catch unreachable;
    try std.testing.expectEqualSlices(u8, try bridge.output(edited.token), try bridge.output(redone.token));
}
