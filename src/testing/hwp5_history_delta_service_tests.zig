//! HWP5 격리 delta 통합 후보. 명시 noori 하나만 사용하며 미실행이다.
const std = @import("std");
const edit = @import("../hwp5/edit/style_preservation.zig");
const histories = @import("../hwp5/edit/editor_history.zig");
const baseline = @import("baseline");
const a = std.testing.allocator;
fn input() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
}
fn saved(s: *edit.Session) ![]u8 {
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn same(s: *edit.Session, expected: []const u8) !void {
    const bytes = try saved(s);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}
fn splice(h: *histories.History, s: *edit.Session, start: u32, end: u32, value: []const u8) !void {
    try std.testing.expect(try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = start, .end_unit = end, .utf8 = value } }));
}
test "HWP5 delta service: 실제 기존 current source reference20과 개별undo redo" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const ref = try s.currentSourceParagraphReference(0, 15);
    var h = try histories.History.initV2(a, s, .{});
    defer h.deinit();
    for (0..20) |i| {
        try std.testing.expect(try h.apply(s, .{ .splice_current_paragraph = .{ .section = 0, .reference = ref, .start_unit = @intCast(i), .end_unit = @intCast(i), .utf8 = "x" } }));
        try std.testing.expectEqual(@as(u32, @intCast(i + 1)), h.revision());
    }
    try std.testing.expectEqual(@as(usize, 20), h.owned.?.counters.delta);
    try std.testing.expectEqual(@as(usize, 0), h.owned.?.counters.capture);
    const changed = try saved(s);
    defer a.free(changed);
    const original_changed = try baseline.current20(a, bytes);
    defer a.free(original_changed);
    try std.testing.expectEqualSlices(u8, original_changed, changed);
    for (0..20) |_| try std.testing.expect(try h.undo(s));
    try same(s, bytes);
    for (0..20) |_| try std.testing.expect(try h.redo(s));
    try same(s, changed);
}
fn mixed(kind: enum { format, table, picture }) !void {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var request: baseline.Request = .{ .kind = if (kind == .format) .format else if (kind == .table) .table else .picture };
    const command: edit.Command = switch (kind) {
        .format => .{ .set_character_properties = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true, .italic = true, .size = 1800 } } },
        .table => blk: {
            const bindings = try s.tableBindings(a, 0);
            defer a.free(bindings);
            if (bindings.len == 0) return error.RequiredTableFixtureCoverageMissing;
            const row = bindings[0];
            request.node = row.list_node;
            request.width = try std.math.add(u32, row.width, 1);
            request.height = row.height;
            break :blk .{ .set_cell_size = .{ .section = 0, .list_node = request.node, .width = request.width, .height = request.height } };
        },
        .picture => blk: {
            const pictures = try s.pictureSources(a, 0, .base73);
            defer a.free(pictures);
            if (pictures.len == 0) return error.RequiredPictureFixtureCoverageMissing;
            const components = try s.drawingComponentSources(a, 0);
            defer a.free(components);
            var found = false;
            for (components) |row| if (row.component_node == pictures[0].component_node) {
                request.node = @intCast(pictures[0].picture_node);
                request.width = try std.math.add(u32, row.current_width, 1);
                request.height = row.current_height;
                found = true;
                break;
            };
            if (!found) return error.RequiredPictureComponentMissing;
            break :blk .{ .set_picture_current_size = .{ .section = 0, .picture_node = request.node, .width = request.width, .height = request.height } };
        },
    };
    var expected = try baseline.run(a, bytes, request);
    defer expected.deinit();
    var h = try histories.History.initV2(a, s, .{});
    defer h.deinit();
    try splice(&h, s, 0, 0, "x");
    try same(s, expected.states[0]);
    try std.testing.expect(try h.apply(s, command));
    try same(s, expected.states[1]);
    try splice(&h, s, 1, 1, "y");
    try same(s, expected.states[2]);
    try std.testing.expectEqual(@as(u32, 3), h.revision());
    try std.testing.expect(h.owned.?.counters.bridge >= 1);
    for (0..3) |i| {
        try std.testing.expect(try h.undo(s));
        try same(s, if (i == 2) bytes else expected.states[1 - i]);
    }
    for (expected.states) |value| {
        try std.testing.expect(try h.redo(s));
        try same(s, value);
    }
}
test "HWP5 delta service: 동일target 텍스트 서식 텍스트 원래V2 save3 undo3 redo3" {
    try mixed(.format);
}
test "HWP5 delta service: 동일target 텍스트 표 텍스트 원래V2 save3 undo3 redo3" {
    try mixed(.table);
}
test "HWP5 delta service: 동일target 텍스트 그림 텍스트 원래V2 save3 undo3 redo3" {
    try mixed(.picture);
}
test "HWP5 delta service: 외부 no-op과 검증실패는 redo epoch를 보존한다" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const original_expected = (try baseline.refusal(a, bytes, .noop_external, null)) orelse return error.MissingBaselineSavedBytes;
    defer a.free(original_expected);
    var h = try histories.History.initV2(a, s, .{});
    defer h.deinit();
    try splice(&h, s, 0, 0, "x");
    try std.testing.expect(try h.undo(s));
    const ticket = try s.historyTicket();
    try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "" } });
    try std.testing.expectError(error.InvalidParagraph, s.apply(.{ .set_style = .{ .section = 0, .paragraph = std.math.maxInt(usize), .style_id = 0 } }));
    try std.testing.expect(std.meta.eql(ticket, try s.historyTicket()));
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    try std.testing.expect(try h.redo(s));
    try same(s, original_expected);
}
test "HWP5 delta service: 외부 실제setter는 epoch mismatch로 미기록undo를 거부한다" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const original_expected = (try baseline.refusal(a, bytes, .changed_external, null)) orelse return error.MissingBaselineSavedBytes;
    defer a.free(original_expected);
    var h = try histories.History.initV2(a, s, .{});
    defer h.deinit();
    try splice(&h, s, 0, 0, "x");
    try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 1, .end_unit = 1, .utf8 = "z" } });
    try std.testing.expectError(error.HistoryCurrentMismatch, h.undo(s));
    try same(s, original_expected);
}
test "HWP5 delta service: payload한도는 준비단계에서 text revision redo 보존" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const payload = try s.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectEqual(try baseline.payloadCost(a, bytes), payload);
    const original_error = (try baseline.refusal(a, bytes, .payload, @intCast(payload))) orelse return error.MissingOriginalBudgetFailure;
    var h = try histories.History.initV2(a, s, .{ .max_checkpoint_bytes = @intCast(payload) });
    defer h.deinit();
    const observed: ?anyerror = blk: {
        _ = h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }) catch |err| break :blk err;
        break :blk null;
    };
    try std.testing.expectEqualStrings(original_error, @errorName(observed orelse return error.CandidateUnexpectedBudgetSuccess));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    try std.testing.expectEqual(@as(usize, 0), h.stats().undoCount);
    try same(s, bytes);
}
test "HWP5 delta service: surrogate 삽입 역명령과실패batch는 원본과redo보존" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    const original_expected = (try baseline.refusal(a, bytes, .failed_batch, null)) orelse return error.MissingBaselineSavedBytes;
    defer a.free(original_expected);
    var h = try histories.History.initV2(a, s, .{});
    defer h.deinit();
    try splice(&h, s, 0, 0, "😀");
    const changed = try saved(s);
    defer a.free(changed);
    try std.testing.expect(try h.undo(s));
    const before = h.stats();
    try std.testing.expectError(error.UnsupportedStructuralEdit, h.applyBatch(s, &.{ .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "Q" } }, .{ .delete_paragraph = .{ .section = 0, .paragraph = 15 } } }));
    try std.testing.expectEqual(before.revision, h.revision());
    try std.testing.expectEqual(before.redoCount, h.stats().redoCount);
    try same(s, bytes);
    try std.testing.expect(try h.redo(s));
    try same(s, changed);
    try same(s, original_expected);
}

test "HWP5 delta service: raw Session poison은 stats와쓰기guard에즉시sticky 전파" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try histories.History.initV2(a, s, .{});
    defer h.deinit();
    try splice(&h, s, 0, 0, "x");
    const changed = try saved(s);
    defer a.free(changed);
    const revision = h.revision();
    // 결정적 authority 주입이다. 실제 matches OOM 또는 rollback 실패를 재현했다고 부르지 않는다.
    s.poisonHistoryTransaction();
    try std.testing.expect(h.owned.?.poisoned);
    try std.testing.expect(h.stats().poisoned);
    try std.testing.expectError(error.HistoryMutationUncertain, h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "z" } }));
    try std.testing.expectError(error.HistoryMutationUncertain, h.undo(s));
    try std.testing.expectError(error.HistoryMutationUncertain, h.redo(s));
    try std.testing.expectError(error.HistoryMutationUncertain, s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = 0, .end_unit = 0, .utf8 = "" } }));
    try std.testing.expect(h.stats().poisoned);
    try std.testing.expectEqual(revision, h.revision());
    try same(s, changed);
}
test "HWP5 delta service: History해제는 observer를제거하고 Session poison을초기화하지않음" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try histories.History.initV2(a, s, .{});
    h.deinit(); // 이후 poison이 해제된 History 메모리에 쓰면 allocator가 수명 오류를 드러낸다.
    s.poisonHistoryTransaction();
    try std.testing.expectError(error.HistoryMutationUncertain, s.historyTicket());
    try std.testing.expectError(error.HistoryMutationUncertain, histories.History.initV2(a, s, .{}));
    try same(s, bytes);
}
