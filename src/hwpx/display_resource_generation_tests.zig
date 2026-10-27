//! 실제 Native 검사는 실행 계획 검토 후에만 수행한다. 현재는 작성·문법 검사 단계다.
const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
const cp = @import("editor_checkpoint.zig");
const proof = @import("display_resource_generation.zig");
fn load(a: std.mem.Allocator) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(4_000_000));
}
fn format() history.Command {
    return .{ .kind = .character_properties, .section = 0, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true, .italic = true, .size = 1800 } };
}
test "HX resource integration: actual plain undo redo preserves resource generation and exact save" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const g = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    for ([_]usize{ 20, 100 }) |count| {
        for (0..count) |_| {
            try std.testing.expect(try h.apply(&s, .{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }));
            try std.testing.expectEqual(g, s.display_resource_generation);
        }
        const edited = try s.save();
        defer a.free(edited);
        try std.testing.expect(!std.mem.eql(u8, bytes, edited));
        for (0..count) |_| {
            try std.testing.expect(try h.undo(&s));
            try std.testing.expectEqual(g, s.display_resource_generation);
        }
        const saved = try s.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
        for (0..count) |_| {
            try std.testing.expect(try h.redo(&s));
            try std.testing.expectEqual(g, s.display_resource_generation);
        }
        const redone = try s.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, edited, redone);
        for (0..count) |_| try std.testing.expect(try h.undo(&s));
    }
}
test "HX resource integration: actual formatting undo restores previous generation and redo restores format generation" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const g = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, format()));
    const fg = s.display_resource_generation;
    try std.testing.expect(fg != g);
    const formatted = try s.save();
    defer a.free(formatted);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectEqual(g, s.display_resource_generation);
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expectEqual(fg, s.display_resource_generation);
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, formatted, redone);
}
test "HX resource integration: new format branch never reuses discarded generation" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(&s, format()));
    const abandoned = s.display_resource_generation;
    try std.testing.expect(try h.undo(&s));
    var command = format();
    command.character_properties.size = 2001;
    try std.testing.expect(try h.apply(&s, command));
    try std.testing.expect(s.display_resource_generation != abandoned);
    try std.testing.expectEqual(@as(usize, 0), h.stats().redoCount);
}
test "HX resource integration: checkpoint rollback restores generation without restoring issue counter" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const old = s.display_resource_generation;
    var before = try cp.capture(&s, 128 * 1024 * 1024);
    defer before.deinit();
    try std.testing.expect(try history.History.applyCommandsUnchecked(&s, &.{format()}, 128 * 1024 * 1024));
    const abandoned = s.display_resource_generation;
    try before.rollback(&s);
    try std.testing.expectEqual(old, s.display_resource_generation);
    try std.testing.expect(try history.History.applyCommandsUnchecked(&s, &.{format()}, 128 * 1024 * 1024));
    try std.testing.expect(s.display_resource_generation != abandoned);
}
test "HX resource integration: raw mutable session never issues valid receipt by default" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var wire: [24]u8 = undefined;
    proof.write(&s, &wire);
    try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, wire[4..8], .little));
}
test "HX resource integration: document incarnation differs after close reopen of same bytes" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    proof.openOwned(&s);
    const old = s.display_resource_document;
    s.deinit();
    var next = try editor.open(a, bytes, .{});
    defer next.deinit();
    proof.openOwned(&next);
    try std.testing.expect(old != next.display_resource_document);
}

fn failureTrial(offset: ?usize) !usize {
    const parent = std.testing.allocator;
    const bytes = try load(parent);
    defer parent.free(bytes);
    var failing = std.testing.FailingAllocator.init(parent, .{});
    var s = try editor.open(failing.allocator(), bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const generation = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const before = h.stats();
    const start = failing.alloc_index;
    if (offset) |n| failing.fail_index = start + n;
    const applied = proof.applyOwned(&h, &s, &.{format()});
    const count = failing.alloc_index - start;
    // 실패 확인을 위한 저장과 정리는 원래 할당자를 계속 사용하되 추가 실패는 끈다.
    failing.fail_index = std.math.maxInt(usize);
    if (offset != null) {
        try std.testing.expectError(error.OutOfMemory, applied);
        try std.testing.expect(failing.has_induced_failure);
        try std.testing.expectEqual(generation, s.display_resource_generation);
        try std.testing.expect(!s.display_resource_trusted);
        try std.testing.expectEqualDeep(before, h.stats());
        const saved = try s.save();
        defer s.allocator.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
        try std.testing.expect(try proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }}));
        try std.testing.expect(s.display_resource_trusted);
        try std.testing.expectEqual(generation, s.display_resource_generation);
        try std.testing.expect(try h.undo(&s));
        try std.testing.expect(try h.redo(&s));
    } else {
        try std.testing.expect(try applied);
    }
    return count;
}
test "HX resource integration: measured first middle last allocation failures preserve generation history and save" {
    const count = try failureTrial(null);
    try std.testing.expect(count >= 3);
    for ([_]usize{ 0, count / 2, count - 1 }) |offset| _ = try failureTrial(offset);
    // 세 지점 통제이며 모든 할당 실패 전수 검증이라고 주장하지 않는다.
}

test "HX resource integration: original 88662 cap still requires both formatting undos" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{ .max_retained_bytes = 88662 });
    defer h.deinit();
    std.debug.print("HX_RESOURCE_R2_SIZE session={} checkpoint={} entry={} history={} stack={}\n", .{ @sizeOf(editor.Session), @sizeOf(cp.Checkpoint), @sizeOf(@import("history_v2.zig").History.E), @sizeOf(@import("history_v2.zig").History), @sizeOf(@import("history_v2.zig").History.S) });
    try std.testing.expect(try h.apply(&s, format()));
    try std.testing.expect(try h.apply(&s, .{ .kind = .paragraph_alignment, .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "", .paragraph_alignment = .RIGHT }));
    const measured = h.stats();
    std.debug.print("HX_RESOURCE_R2_STAGE after2 retained={} meta={} current={} undo={} undoCount={} evicted={}\n", .{ measured.retainedBytes.?, measured.metadataOwnedBytes.?, measured.currentOwnedBytes.?, measured.undoOwnedBytes.?, measured.undoCount, measured.evictedCount.? });
    // 추가 필드 비용 때문에 실패하더라도 한도나 두 번 undo 기대를 바꾸지 않는다.
    try std.testing.expectEqual(@as(usize, 2), h.stats().undoCount);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expect(try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
}

test "HX resource integration: benign native noop then text undo redo remains certified" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const original = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    try std.testing.expect(!try proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "" }}));
    // generic transaction의 기존 noop 후 matches가 동일성을 확인한 경우만 즉시 재인증된다.
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(original, s.display_resource_generation);
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expect(try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(original, s.display_resource_generation);
}
test "HX resource integration: empty undo suspends until next existing owned comparison" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const generation = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const changed = try h.undo(&s);
    proof.afterTravel(&s, changed);
    try std.testing.expect(!changed and !s.display_resource_trusted and s.display_resource_recoverable);
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(generation, s.display_resource_generation);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expect(try h.redo(&s));
    try std.testing.expect(s.display_resource_trusted);
}
test "HX resource integration: failed mixed batch rollback reauthenticates before later text" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    const generation = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const before = h.stats();
    const invalid: history.Command = .{ .section = std.math.maxInt(usize), .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" };
    try std.testing.expectError(error.InvalidSectionIndex, proof.applyOwned(&h, &s, &.{ format(), invalid }));
    try std.testing.expect(!s.display_resource_trusted and s.display_resource_recoverable);
    try std.testing.expectEqual(generation, s.display_resource_generation);
    try std.testing.expectEqualDeep(before, h.stats());
    const rolled_back = try s.save();
    defer a.free(rolled_back);
    try std.testing.expectEqualSlices(u8, bytes, rolled_back);
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(generation, s.display_resource_generation);
    try std.testing.expect(try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expect(s.display_resource_trusted);
}
test "HX resource integration: raw mismatch remains fallback even after raw restoration" {
    const a = std.testing.allocator;
    const bytes = try load(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    try std.testing.expect(try s.splice(0, 3, 0, 0, "q"));
    try std.testing.expectError(error.HistoryCurrentMismatch, proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }}));
    try std.testing.expect(!s.display_resource_trusted and !s.display_resource_recoverable);
    try std.testing.expect(try s.splice(0, 3, 0, 1, ""));
    // 논리 상태를 되돌려도 unknown raw 경로는 증명 등록을 다시 허용하지 않는다.
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{.{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }}));
    try std.testing.expect(!s.display_resource_trusted);
}
