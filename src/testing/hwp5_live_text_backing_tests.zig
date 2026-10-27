//! 명시 probe. Native slot 허가 전 실행하지 않는다.
const std = @import("std");
const gap = @import("../hwp5/edit/live_text_backing.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const histories = @import("../hwp5/edit/editor_history.zig");
const a = std.testing.allocator;
const H5Probe = @import("../hwp5/edit/history_v2.zig").Probe;
const EpochTicket = @import("../model/history_mutation_epoch.zig").Ticket;
const HistoryStats = @import("../model/history_stats.zig").Stats;
const Prepared = @import("../hwp5/edit/history_text_journal.zig").Prepared;
const Window = @import("../hwp5/edit/live_text_window.zig").Window;
const FormattingLifetime = @import("../model/formatting_binding.zig").State;
const FormattingBinding = @import("../model/formatting_patch.zig").Binding;
fn scale(n: usize) !void {
    const bytes = try a.alloc(u8, (n + 1) * 2);
    defer a.free(bytes);
    for (0..n) |i| std.mem.writeInt(u16, bytes[i * 2 ..][0..2], 'a', .little);
    std.mem.writeInt(u16, bytes[n * 2 ..][0..2], 13, .little);
    var backing = try gap.Backing.init(a, bytes, 0, 15, 87, 80);
    defer backing.deinit();
    for (0..n) |i| {
        try backing.reserve(1);
        backing.spliceReserved(i, 0, &.{'x'});
    }
    try std.testing.expectEqual(@as(usize, 0), backing.counters.materialize_units);
    try std.testing.expectEqual(@as(usize, 0), backing.counters.move_units);
    for (0..n) |i| backing.spliceReserved(n - i - 1, 1, &.{});
    try std.testing.expectEqual(@as(usize, 0), backing.counters.move_units);
    try std.testing.expect(backing.counters.growth_copy_units <= 8 * (n + 1));
    try std.testing.expectEqual(n + 1, backing.counters.source_copy_units);
    const out = try backing.materialize(a);
    defer a.free(out);
    try std.testing.expectEqualSlices(u8, bytes, out);
    std.debug.print("\nHWP5 gap n={d} copy={d} growth={d} move={d} materialize={d}\n", .{ n, backing.counters.source_copy_units, backing.counters.growth_copy_units, backing.counters.move_units, backing.counters.materialize_units });
}
test "HWP5 live backing: n 2n 4n 소스단위 선형 bound" {
    for ([_]usize{ 128, 256, 512 }) |n| try scale(n);
}
fn allocationPath(allocator: std.mem.Allocator) !void {
    var backing = try gap.Backing.init(allocator, &.{ 'a', 0, 13, 0 }, 0, 15, 87, 80);
    defer backing.deinit();
    const removed = try backing.copyRange(allocator, 0, 1);
    defer allocator.free(removed);
    try backing.reserve(256);
    // reserve 후 input으로 독립 owned payload만 사용한다.
    backing.spliceReserved(0, 1, removed);
    const out = try backing.materialize(allocator);
    defer allocator.free(out);
    try std.testing.expectEqualSlices(u8, &.{ 'a', 0, 13, 0 }, out);
}
test "HWP5 live backing: 정확 allocation free와 성장 OOM" {
    try std.testing.checkAllAllocationFailures(a, allocationPath, .{});
    try growthRollback();
}
test "HWP5 live backing: UTF16 경계 CR 부재와 역교환" {
    var backing = try gap.Backing.init(a, &.{ 0x3d, 0xd8, 0, 0xde, 13, 0 }, 0, 15, 87, 80);
    defer backing.deinit();
    try std.testing.expectError(error.SplitSurrogatePair, backing.boundary(1));
    try std.testing.expectError(error.InvalidTextPosition, backing.boundary(3));
    try std.testing.expectError(error.UnsupportedParagraphTerminator, gap.Backing.init(a, &.{}, 0, 15, 87, 80));
    try std.testing.expectError(error.UnsupportedParagraphTerminator, gap.Backing.init(a, &.{ 'a', 0 }, 0, 15, 87, 80));
    try backing.reserve(1);
    backing.spliceReserved(0, 0, &.{'x'});
    backing.spliceReserved(0, 1, &.{});
    try std.testing.expect(backing.matches(0, &.{ 0xd83d, 0xde00, 13 }));
}
test "HWP5 live backing: 동일 noori 0 15 source87 parent80 연속20 copy 길이 undo redo" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    const info = try session.paragraph(0, 15);
    try std.testing.expectEqual(@as(?u32, 87), info.source_node);
    try std.testing.expectEqual(@as(?u32, 80), info.parent_node);
    const length = try session.editableTextLength(a, 0, 15);
    var h = try histories.History.initV2(a, session, .{});
    defer h.deinit();
    const ref = try session.currentSourceParagraphReference(0, 15);
    for (0..20) |i| {
        try std.testing.expect(try h.apply(session, .{ .splice_current_paragraph = .{ .section = 0, .reference = ref, .start_unit = @intCast(i), .end_unit = @intCast(i), .utf8 = "x" } }));
        try std.testing.expectEqual(length + @as(u32, @intCast(i)) + 1, try session.editableTextLength(a, 0, 15));
    }
    const first = session.liveTextCounters();
    // fallback이면 검사를 실패시킨다. 다른 target으로 교체하지 않는다.
    try std.testing.expect(first.source_copy_units > 0);
    try std.testing.expectEqual(@as(usize, 0), first.materialize_units);
    for (0..20) |_| try std.testing.expect(try h.undo(session));
    const reversed = session.liveTextCounters();
    try std.testing.expectEqual(first.source_copy_units, reversed.source_copy_units);
    try std.testing.expectEqual(@as(usize, 0), reversed.materialize_units);
    const original = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    for (0..20) |_| try std.testing.expect(try h.redo(session));
    try std.testing.expectEqual(@as(usize, 20), h.owned.?.counters.delta);
    try std.testing.expectEqual(@as(usize, 0), h.owned.?.counters.capture);
}
// apply 게시 전 각 allocation 실패에서 현재 텍스트/redo/ticket/save를 대조한다.
// FailingAllocator의 resize 실패 전수와 전체 bridge OOM은 별도 미검증이다.
test "HWP5 live backing: 동일owner apply OOM은 text redo epoch 보존" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var reached_success = false;
    for (0..256) |offset| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const allocator = failing.allocator();
        const session = try edit.Session.open(allocator, input);
        defer session.close();
        session.enableHistoryDelta();
        var h = try histories.History.initV2(allocator, session, .{});
        defer h.deinit();
        try std.testing.expect(try h.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
        try std.testing.expect(try h.undo(session));
        const ticket = try session.historyTicket();
        const revision = h.revision();
        const before = h.stats();
        failing.fail_index = failing.alloc_index + offset;
        const result = h.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "😀" } }) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            if (err != error.OutOfMemory) return err;
            try std.testing.expect(std.meta.eql(ticket, try session.historyTicket()));
            try std.testing.expectEqual(revision, h.revision());
            try std.testing.expectEqual(before.redoCount, h.stats().redoCount);
            const original = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
            defer a.free(original);
            try std.testing.expectEqualSlices(u8, input, original);
            try std.testing.expect(try h.redo(session));
            continue;
        };
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expect(result);
        reached_success = true;
        break;
    }
    try std.testing.expect(reached_success);
    try preparedLifetime(input);
    try failureMatrix(input);
    try pendingRollbackNoAlloc(input);
    try checkpointDestinationLimitNegative(input);
}

// Prepared 수명: canonical tokens를 참조하지 않고 별도 소유 run/range만 정리한다.
fn preparedLifetime(input: []const u8) !void {
    const s = try edit.Session.open(a, input);
    var closed = false;
    defer if (!closed) s.close();
    s.enableHistoryDelta();
    const ticket = try s.historyTicket();
    try s.beginHistoryTransaction(ticket);
    const command: edit.Command = .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } };
    var old = (try s.prepareHistoryTextDelta(a, command, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
    defer old.deinit();
    try std.testing.expect(old.live != null and old.draft == null);
    const projection = try s.currentTextPreview(a);
    a.free(projection); // 기존 gap 해제. 이전 Prepared는 독립 소유다.
    var fresh = (try s.prepareHistoryTextDelta(a, command, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
    defer fresh.deinit();
    try std.testing.expectError(error.HistoryCurrentMismatch, s.swapHistoryTextDraft(&old));
    try s.swapHistoryTextDraft(&fresh);
    try s.swapHistoryTextDraft(&fresh); // 같은 거래의 역교환. 할당하지 않는다.
    s.finishHistoryTransaction(false);
    s.close();
    closed = true; // defer 정리는 Session 파괴 뒤에도 토큰/Session을 역참조하지 않는다.
}

const FailureCase = enum { save, preview, undo, redo, format, rollback, external_restore };
fn failureCase(input: []const u8, expected_x: []const u8, expected_format: []const u8, which: FailureCase) !void {
    var succeeded = false;
    var oom_count: usize = 0;
    var restored_cases: usize = 0;
    for (0..512) |offset| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const allocator = failing.allocator();
        const s = try edit.Session.open(allocator, input);
        defer s.close();
        s.enableHistoryDelta();
        const cp = if (which == .rollback or which == .external_restore) try s.createCheckpoint(128 * 1024 * 1024) else null;
        defer if (cp) |snapshot| snapshot.deinit();
        var h = try histories.History.initV2(allocator, s, .{});
        defer h.deinit();
        try std.testing.expect(try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
        if (which == .redo) try std.testing.expect(try h.undo(s));
        const ticket = try s.historyTicket();
        const stats = h.stats();
        const ref = try s.currentSourceParagraphReference(0, 15);
        const length = try s.editableTextLength(a, 0, 15);
        var old: ?Prepared = null;
        defer if (old) |*draft| draft.deinit();
        var old_window: ?Window = null;
        defer if (old_window) |*window| window.deinit(a);
        var original_window: ?[]u8 = null;
        defer if (original_window) |bytes| a.free(bytes);
        var lifetime: FormattingLifetime = .{};
        var binding_name: ?[]u8 = null;
        defer if (binding_name) |bytes| a.free(bytes);
        var binding: ?FormattingBinding = null;
        if (which == .format) {
            try s.beginHistoryTransaction(ticket);
            old = (try s.prepareHistoryTextDelta(a, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 1, .end_unit = 1, .utf8 = "y" } }, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
            s.finishHistoryTransaction(false);
            try std.testing.expect(old.?.live != null);
            old_window = try s.copySourceTextWindowUtf16(a, 0, ref.source.host, 0, 2);
            original_window = try a.dupe(u8, old_window.?.bytes);
            try lifetime.open();
            binding_name = try lifetime.session(a);
            binding = .{ .session = binding_name.?, .revision = h.revision() };
            const service: @import("../wasm/formatting_service.zig").Service(.hwp5) = .{ .backend = .{ .session = s, .allocator = a }, .lifetime = &lifetime, .history = &h };
            try service.checkBinding(binding.?);
        }
        const old_identity = edit.Testing.liveIdentity(s);
        var witness: H5Probe.Witness = .{ .owner = h.owned.? };
        H5Probe.watch(&witness);
        var watching = true;
        defer if (watching) {
            _ = H5Probe.unwatch(&witness);
        };
        // native helper의 resize 성공 여부와 무관하게 allocate-copy 경로도 강제로 검사한다.
        failing.resize_fail_index = failing.resize_index;
        failing.fail_index = failing.alloc_index + offset;
        const result: ?anyerror = operation: {
            switch (which) {
                .save => {
                    const out = s.save(a, .{ .allow_stale_layout = true }) catch |err| break :operation err;
                    a.free(out.bytes);
                },
                .preview => {
                    const out = s.currentTextPreview(a) catch |err| break :operation err;
                    a.free(out);
                },
                .undo => {
                    _ = h.undo(s) catch |err| break :operation err;
                },
                .redo => {
                    _ = h.redo(s) catch |err| break :operation err;
                },
                .format => {
                    _ = h.apply(s, .{ .set_character_properties = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true, .italic = true, .size = 1800 } } }) catch |err| break :operation err;
                },
                .external_restore => {
                    s.restoreCheckpoint(cp.?) catch |err| break :operation err;
                },
                .rollback => {
                    s.beginHistoryTransaction(ticket) catch |err| break :operation err;
                    s.rollbackHistoryCheckpoint(cp.?) catch |err| {
                        if (s.historyTransactionActive()) s.finishHistoryTransaction(false);
                        break :operation err;
                    };
                    s.finishHistoryTransaction(true);
                },
            }
            break :operation null;
        };
        const restores = H5Probe.unwatch(&witness);
        watching = false;
        failing.fail_index = std.math.maxInt(usize);
        failing.resize_fail_index = std.math.maxInt(usize);
        if (result) |err| {
            if (err != error.OutOfMemory) return err;
            oom_count += 1;
            const after_ticket = try s.historyTicket();
            switch (restores) {
                0 => try std.testing.expect(std.meta.eql(ticket, after_ticket)),
                1 => {
                    try std.testing.expect(which == .format);
                    try std.testing.expect(std.meta.eql(ticket.binding, after_ticket.binding));
                    try std.testing.expectEqual(ticket.epoch + 1, after_ticket.epoch);
                    restored_cases += 1;
                },
                else => return error.UnexpectedRollbackWitnessCount,
            }
            try std.testing.expect(std.meta.eql(after_ticket, h.owned.?.observed.?));
            try expectStableHistoryStats(stats, h.stats());
            try std.testing.expect(!h.stats().poisoned and !s.historyTransactionActive());
            try std.testing.expectEqual(stats.revision, h.stats().revision);
            try std.testing.expectEqual(stats.undoCount, h.stats().undoCount);
            try std.testing.expectEqual(stats.redoCount, h.stats().redoCount);
            try std.testing.expectEqual(length, try s.editableTextLength(a, 0, 15));
            try std.testing.expect(std.meta.eql(ref, try s.currentSourceParagraphReference(0, 15)));
            const saved = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, if (which == .redo) input else expected_x, saved);
            if (restores == 1) try recoveredFormatAuthority(s, &h, ticket, stats, &old.?, old_identity, &old_window.?, original_window.?, &lifetime, binding.?, input, expected_x, expected_format);
            continue;
        }
        const saved = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, switch (which) {
            .undo, .rollback, .external_restore => input,
            .format => expected_format,
            else => expected_x,
        }, saved);
        if (which == .external_restore) {
            // 외부 exchange는 교체된 현재값도 canonical 상태로 보존해야 한다.
            try s.restoreCheckpoint(cp.?);
            const restored = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, expected_x, restored);
        }
        if (failing.has_induced_failure) continue;
        succeeded = true;
        break;
    }
    try std.testing.expect(succeeded);
    if (which == .format) try std.testing.expect(restored_cases > 0);
    std.debug.print("OOM_PHASE {s}: failures={d} restored={d} success={}\n", .{ @tagName(which), oom_count, restored_cases, succeeded });
    if (which == .rollback) try std.testing.expectEqual(@as(usize, 0), oom_count) else try std.testing.expect(oom_count > 0);
}
fn failureMatrix(input: []const u8) !void {
    var original = try @import("baseline").run(a, input, .{ .kind = .format });
    defer original.deinit();
    inline for (std.meta.tags(FailureCase)) |which| try failureCase(input, original.states[0], original.states[1], which);
}

fn growthRollback() !void {
    var failing = std.testing.FailingAllocator.init(a, .{});
    var backing = try gap.Backing.init(failing.allocator(), &.{ 'a', 0, 13, 0 }, 0, 15, 87, 80);
    var alive = true;
    defer if (alive) backing.deinit();
    const before_ptr = backing.storage.ptr;
    const before_len = backing.storage.len;
    failing.fail_index = failing.alloc_index;
    failing.resize_fail_index = failing.resize_index;
    try std.testing.expectError(error.OutOfMemory, backing.reserve(256));
    try std.testing.expectEqual(before_ptr, backing.storage.ptr);
    try std.testing.expectEqual(before_len, backing.storage.len);
    try std.testing.expectEqual(@as(u64, 0), backing.serial);
    try std.testing.expect(backing.matches(0, &.{ 'a', 13 }));
    // 원래 gap의 pointer를 입력으로 다시 쓰지 않고 독립 range만 사용한다.
    failing.fail_index = std.math.maxInt(usize);
    const copied = try backing.copyRange(a, 0, 1);
    defer a.free(copied);
    try backing.reserve(256);
    backing.spliceReserved(0, 1, copied);
    try std.testing.expect(backing.matches(0, &.{ 'a', 13 }));
    backing.deinit();
    alive = false;
    try std.testing.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    try std.testing.expectEqual(failing.allocations, failing.deallocations);
}

fn pendingRollbackNoAlloc(input: []const u8) !void {
    const expected = try @import("baseline").run(a, input, .{ .kind = .format });
    var owned_expected = expected;
    defer owned_expected.deinit();
    var failing = std.testing.FailingAllocator.init(a, .{});
    {
        const allocator = failing.allocator();
        const s = try edit.Session.open(allocator, input);
        defer s.close();
        s.enableHistoryDelta();
        var h = try histories.History.initV2(allocator, s, .{});
        defer h.deinit();
        try std.testing.expect(try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
        const parent = try s.createCheckpoint(128 * 1024 * 1024);
        var parent_alive = true;
        defer if (parent_alive) parent.deinit();
        const other = try edit.Session.open(allocator, input);
        defer other.close();
        const foreign = try other.createCheckpoint(128 * 1024 * 1024);
        defer foreign.deinit();
        const foreign_allocator = try s.createHistoryCheckpointIn(a, 128 * 1024 * 1024);
        defer foreign_allocator.deinit();
        const before = try s.historyTicket();
        const stats = h.stats();
        try s.beginHistoryTransaction(before);
        var draft = (try s.prepareHistoryTextDelta(a, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 1, .end_unit = 1, .utf8 = "y" } }, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
        defer draft.deinit();
        const length = try s.editableTextLength(a, 0, 15);
        const counters = s.liveTextCounters();
        const identity = edit.Testing.liveIdentity(s);
        try std.testing.expect(identity.has_backing);
        // 같은 allocator/다른 owner 및 같은 owner/다른 allocator 모두 gap을 폐기하지 않는다.
        try std.testing.expectError(error.SourceBindingMismatch, s.rollbackHistoryCheckpoint(foreign));
        try std.testing.expectError(error.SourceBindingMismatch, s.rollbackHistoryCheckpoint(foreign_allocator));
        try std.testing.expectEqual(length, try s.editableTextLength(a, 0, 15));
        try std.testing.expect(std.meta.eql(counters, s.liveTextCounters()));
        try std.testing.expect(std.meta.eql(before, try s.historyTicket()));
        try std.testing.expect(std.meta.eql(identity, edit.Testing.liveIdentity(s)));
        try s.swapHistoryTextDraft(&draft); // 실패한 bind가 Prepared/gap/serial을 무효화하지 않았다.
        const pending = s.liveTextCounters();
        failing.fail_index = failing.alloc_index;
        failing.resize_fail_index = failing.resize_index;
        // matchesCheckpoint의 materialize가 OOM이어도 유효 checkpoint rollback은 할당 없이 완료한다.
        const err = @import("../hwp5/edit/history_v2.zig").Probe.rollback(h.owned.?, parent, error.InvalidTextPosition);
        try std.testing.expect(err == error.InvalidTextPosition);
        try std.testing.expect(failing.has_induced_failure);
        try std.testing.expect(!h.owned.?.poisoned);
        try std.testing.expect(!s.historyTransactionActive());
        const after = try s.historyTicket();
        try std.testing.expectEqual(before.epoch + 1, after.epoch);
        try std.testing.expectEqual(stats.revision, h.stats().revision);
        try std.testing.expectEqual(stats.redoCount, h.stats().redoCount);
        const finished = s.liveTextCounters();
        const disposed = edit.Testing.liveIdentity(s);
        try std.testing.expect(!disposed.has_backing);
        try std.testing.expectEqual(identity.incarnation + 1, disposed.incarnation);
        try std.testing.expectEqual(pending.source_copy_units, finished.source_copy_units);
        try std.testing.expectEqual(pending.materialize_units, finished.materialize_units);
        // 소비 checkpoint가 소유한 이전 stale tokens는 정확히 한 번 해제한다.
        parent.deinit();
        parent_alive = false;
        try s.beginHistoryTransaction(after);
        try std.testing.expectError(error.HistoryCurrentMismatch, s.swapHistoryTextDraft(&draft));
        failing.fail_index = std.math.maxInt(usize);
        failing.resize_fail_index = std.math.maxInt(usize);
        var next = (try s.prepareHistoryTextDelta(a, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 1, .end_unit = 1, .utf8 = "q" } }, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
        defer next.deinit();
        const rebound = edit.Testing.liveIdentity(s);
        try std.testing.expect(rebound.has_backing);
        try std.testing.expectEqual(disposed.incarnation + 1, rebound.incarnation);
        try std.testing.expectError(error.HistoryCurrentMismatch, s.swapHistoryTextDraft(&draft));
        s.finishHistoryTransaction(false);
        failing.fail_index = std.math.maxInt(usize);
        failing.resize_fail_index = std.math.maxInt(usize);
        const restored = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, owned_expected.states[0], restored);
        try std.testing.expect(try h.undo(s));
        const original = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
        defer a.free(original);
        try std.testing.expectEqualSlices(u8, input, original);
        try std.testing.expect(try h.redo(s));
    }
    try std.testing.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    try std.testing.expectEqual(failing.allocations, failing.deallocations);
}

// 소비된 checkpoint를 의도적으로 재사용하는 음성통제: 목적지 한도 실패 전 gap 폐기 금지.
fn checkpointDestinationLimitNegative(input: []const u8) !void {
    const s = try edit.Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    const limit = try s.checkpointSize(std.math.maxInt(usize));
    const tight = try s.createCheckpoint(limit);
    defer tight.deinit();
    try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } });
    try std.testing.expect(try s.checkpointSize(std.math.maxInt(usize)) > limit);
    try s.beginHistoryTransaction(try s.historyTicket());
    try s.rollbackHistoryCheckpoint(tight); // 교체된 큰 현재값을 보관한 소비 checkpoint.
    s.finishHistoryTransaction(true);
    const ticket = try s.historyTicket();
    try s.beginHistoryTransaction(ticket);
    var draft = (try s.prepareHistoryTextDelta(a, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "z" } }, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
    defer draft.deinit();
    const counters = s.liveTextCounters();
    const length = try s.editableTextLength(a, 0, 15);
    try std.testing.expectError(error.LimitExceeded, s.rollbackHistoryCheckpoint(tight));
    try std.testing.expectEqual(length, try s.editableTextLength(a, 0, 15));
    try std.testing.expect(std.meta.eql(counters, s.liveTextCounters()));
    try std.testing.expect(std.meta.eql(ticket, try s.historyTicket()));
    try s.swapHistoryTextDraft(&draft);
    try s.swapHistoryTextDraft(&draft);
    s.finishHistoryTransaction(false);
    const original = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
}

fn recoveredFormatAuthority(session: *edit.Session, history: *histories.History, before: EpochTicket, stats: HistoryStats, old: *Prepared, old_identity: anytype, window: *Window, original_window: []const u8, lifetime: *FormattingLifetime, binding: FormattingBinding, input: []const u8, expected_x: []const u8, expected_format: []const u8) !void {
    const service: @import("../wasm/formatting_service.zig").Service(.hwp5) = .{ .backend = .{ .session = session, .allocator = a }, .lifetime = lifetime, .history = history };
    const format: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true, .italic = true, .size = 1800 } } };
    const after = try session.historyTicket();
    try std.testing.expect(std.meta.eql(before.binding, after.binding));
    try std.testing.expectEqual(before.epoch + 1, after.epoch);
    try std.testing.expect(std.meta.eql(after, history.owned.?.observed.?));
    try std.testing.expect(!session.historyTransactionActive() and !history.stats().poisoned);
    try expectStableHistoryStats(stats, history.stats());
    try std.testing.expectEqual(stats.revision, history.stats().revision);
    try std.testing.expectEqual(stats.undoCount, history.stats().undoCount);
    try std.testing.expectEqual(stats.redoCount, history.stats().redoCount);
    const saved = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, expected_x, saved);
    try std.testing.expectError(error.StaleMutationEpoch, session.beginHistoryTransaction(before));
    try session.beginHistoryTransaction(after);
    try std.testing.expectError(error.HistoryCurrentMismatch, session.swapHistoryTextDraft(old));
    var fresh = (try session.prepareHistoryTextDelta(a, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 1, .end_unit = 1, .utf8 = "z" } }, 1024 * 1024)) orelse return error.RequiredGapCoverageMissing;
    defer fresh.deinit();
    try std.testing.expect(edit.Testing.liveIdentity(session).incarnation > old_identity.incarnation);
    try std.testing.expectError(error.HistoryCurrentMismatch, session.swapHistoryTextDraft(old));
    try session.swapHistoryTextDraft(&fresh);
    try session.swapHistoryTextDraft(&fresh);
    try std.testing.expectError(error.HistoryCurrentMismatch, session.swapHistoryTextDraft(old));
    session.finishHistoryTransaction(false);
    // 문서 revision과 물리 Prepared 권한은 서로 다른 계약입니다.
    try service.checkBinding(binding);
    try std.testing.expectEqualSlices(u8, original_window, window.bytes);
    const owner = try session.currentSourceParagraphReference(0, 15);
    try std.testing.expectEqual(window.source_node, @as(?u32, owner.source.host.original_node));
    var current_window = try session.copySourceTextWindowUtf16(a, 0, owner.source.host, 0, 2);
    defer current_window.deinit(a);
    try std.testing.expectEqualSlices(u8, original_window, current_window.bytes);
    try std.testing.expect(try history.undo(session));
    const original = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expect(try history.redo(session));
    const redone = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, expected_x, redone);
    try std.testing.expect(try history.apply(session, format));
    const formatted = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(formatted);
    try std.testing.expectEqualSlices(u8, expected_format, formatted);
    try std.testing.expectError(error.StaleFormattingBinding, service.checkBinding(binding));
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.redo(session));
    const final_saved = (try session.save(a, .{ .allow_stale_layout = true })).bytes;
    defer a.free(final_saved);
    try std.testing.expectEqualSlices(u8, expected_format, final_saved);
    try std.testing.expect(!history.stats().poisoned);
    try std.testing.expectEqualSlices(u8, original_window, window.bytes);
    std.debug.print("ROLLBACK_AUTHORITY ticket {d}->{d}; old Prepared stale; save/history/recovery/binding/window exact\n", .{ before.epoch, after.epoch });
}

// Stable retained authority only. Session live-work and History.counters are
// observational counters outside HistoryStats, and may grow during failed work.
// Any future Stats field requires an explicit classification here.
fn expectStableHistoryStats(before: HistoryStats, after: HistoryStats) !void {
    const stable = .{ "protocolVersion", "requested", "resolved", "revision", "oldestAvailableRevision", "undoCount", "redoCount", "retainedBytes", "metadataOwnedBytes", "currentOwnedBytes", "undoOwnedBytes", "redoOwnedBytes", "evictedCount", "poisoned" };
    comptime {
        if (std.meta.fieldNames(HistoryStats).len != stable.len) @compileError("Classify every HistoryStats field before changing rollback expectations");
    }
    inline for (stable) |name| try std.testing.expect(std.meta.eql(@field(before, name), @field(after, name)));
}
