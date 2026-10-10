const std = @import("std");
const editor = @import("../hwpx/editor_session.zig");
const History = @import("../hwpx/editor_history.zig").History;
const commands = @import("named_font_text_commands.zig");

test "named font text HWP5 allocation failures preserve empty document and prior redo" {
    const a = std.testing.allocator;
    const edit = @import("../hwp5/edit/style_preservation.zig");
    const Histories = @import("../hwp5/edit/editor_history.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const batch = try commands.build(.hwp5, .{ .section = 0, .paragraph = 5, .start = 0, .end = 0, .text = "한😀", .language = .hangul, .name = "Failure Typing Font" });
    for (0..50_000) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const session = try edit.Session.open(failing.allocator(), input);
        defer session.close();
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 4, .utf8 = "" } });
        const empty = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(empty.bytes);
        var history = try Histories.History.init(failing.allocator(), session, 4, 4_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 0, .utf8 = "Old" } }));
        const old = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(old.bytes);
        try std.testing.expect(try history.undo(session));
        failing.fail_index = failing.alloc_index + index;
        const result = history.applyBatch(session, &batch);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            try std.testing.expect(!try history.redo(session));
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            const reopened = try edit.Session.open(a, saved.bytes);
            defer reopened.close();
            try std.testing.expect(try history.undo(session));
            try std.testing.expect(!try history.undo(session));
            const restored = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, empty.bytes, restored.bytes);
            if (!failing.has_induced_failure) {
                std.debug.print("HWP5 named font text checked allocation points with prior redo: {d}\n", .{index});
                return;
            }
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expect(!try history.undo(session));
            const restored = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, empty.bytes, restored.bytes);
            try std.testing.expect(try history.redo(session));
            const redone = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(redone.bytes);
            try std.testing.expectEqualSlices(u8, old.bytes, redone.bytes);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}

test "named font text allocation failures preserve original ZIP and prior redo" {
    const a = std.testing.allocator;
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'><h:refList><h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='0' face='Old'/></h:fontface></h:fontfaces><h:charProperties itemCnt='1'><h:charPr id='0' height='1000'><h:fontRef hangul='0'/></h:charPr></h:charProperties></h:refList></h:head>";
    const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:t/></p:run></p:p></s:sec>";
    const input = try @import("../hwpx/test_package_fixture.zig").syntheticStructureZip(a, header, section);
    defer a.free(input);
    const batch = try commands.build(.hwpx, .{ .section = 0, .paragraph = 1, .start = 0, .end = 0, .text = "한😀", .language = .hangul, .name = "Failure Typing Font" });
    for (0..50_000) |index| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        var session = try editor.open(failing.allocator(), input, .{});
        defer session.deinit();
        var history = try History.init(&session, 4, 4_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "Old" }));
        const old = try session.save();
        defer session.allocator.free(old);
        try std.testing.expect(try history.undo(&session));
        failing.fail_index = failing.alloc_index + index;
        const result = history.applyBatch(&session, &batch);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |changed| {
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 1), session.font_resources.entries.items.len);
            try std.testing.expect(!try history.redo(&session));
            const saved = try session.save();
            defer session.allocator.free(saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            try std.testing.expect(try history.undo(&session));
            try std.testing.expect(!try history.undo(&session));
            const restored = try session.save();
            defer session.allocator.free(restored);
            try std.testing.expectEqualSlices(u8, input, restored);
            if (!failing.has_induced_failure) {
                std.debug.print("HWPX named font text checked allocation points with prior redo: {d}\n", .{index});
                return;
            }
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(@as(usize, 0), session.font_resources.entries.items.len);
            try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
            try std.testing.expect(!try history.undo(&session));
            const restored = try session.save();
            defer session.allocator.free(restored);
            try std.testing.expectEqualSlices(u8, input, restored);
            try std.testing.expect(try history.redo(&session));
            const redone = try session.save();
            defer session.allocator.free(redone);
            try std.testing.expectEqualSlices(u8, old, redone);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}
