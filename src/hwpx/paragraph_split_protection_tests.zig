const std = @import("std");
const editor = @import("editor_session.zig");
fn fixture(a: std.mem.Allocator) ![]u8 {
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0'><p:run><p:t>ABC</p:t></p:run></p:p></s:sec>", "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:paraProperties itemCnt='1'><h:paraPr id='0'><h:align horizontal='LEFT'/><h:breakSetting keepLines='1' keepWithNext='1'/></h:paraPr></h:paraProperties></h:refList></h:head>");
}
test "paragraph end protection split prepares style and topology atomically under injected allocation failure" {
    const a = std.testing.allocator;
    const input = try fixture(a);
    defer a.free(input);
    // 실제 allocator의 resize/remap 성공 경로도 독립적으로 검사합니다.
    {
        var real = try editor.open(a, input, .{});
        defer real.deinit();
        try std.testing.expect(try real.splitParagraph(0, 1, 3, 0));
        try std.testing.expectEqual(@as(usize, 1), real.paragraph_resources.entries.items.len);
        try std.testing.expectEqual(@as(?bool, false), real.paragraph_resources.entries.items[0].keep_lines);
        try std.testing.expectEqual(@as(usize, 2), real.sections[0].last_paragraph);
    }
    var baseline_backing: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = a };
    var count = std.testing.FailingAllocator.init(baseline_backing.allocator(), .{});
    const allocations = baseline: {
        var session = try editor.open(count.allocator(), input, .{});
        // assertion·예산 오류를 포함한 모든 반환에서 baseline을 해제합니다.
        defer session.deinit();
        const before = count.alloc_index;
        try std.testing.expect(try session.splitParagraph(0, 1, 3, 0));
        const measured = count.alloc_index - before;
        try std.testing.expect(measured > 2);
        if (measured > 6000) return error.TestAllocationSweepBudgetExceeded;
        try std.testing.expectEqual(@as(usize, 1), session.paragraph_resources.entries.items.len);
        try std.testing.expectEqual(@as(?bool, false), session.paragraph_resources.entries.items[0].keep_lines);
        try std.testing.expectEqual(@as(usize, 2), session.sections[0].last_paragraph);
        break :baseline measured;
    };
    try std.testing.expectEqual(count.allocated_bytes, count.freed_bytes);
    // open과 검증 save는 주입 밖에 두고 split의 모든 할당 지점을 검사합니다.
    for (0..allocations) |offset| {
        var failure_backing: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = a };
        var failing = std.testing.FailingAllocator.init(failure_backing.allocator(), .{});
        {
            var session = try editor.open(failing.allocator(), input, .{});
            defer session.deinit();
            failing.fail_index = failing.alloc_index + offset;
            const outcome = session.splitParagraph(0, 1, 3, 0);
            // 미도달 index와 실제 OOM을 삼킨 성공 모두 실패로 남깁니다.
            try std.testing.expect(failing.has_induced_failure);
            try std.testing.expectError(error.OutOfMemory, outcome);
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectEqual(@as(usize, 0), session.paragraph_resources.entries.items.len);
            try std.testing.expectEqual(@as(usize, 1), session.sections[0].last_paragraph);
            const saved = try session.save();
            defer session.allocator.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
            try std.testing.expectEqualSlices(u8, input, session.source);
        }
        try std.testing.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    }
    std.debug.print("paragraph protection split full OOM sweep: {d} indices, real/fallback controls retained\n", .{allocations});
}

test "paragraph end protection split retains legacy paragraphs with no explicit shape reference" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>ABC</p:t></p:run></p:p></s:sec>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 3, 0));
    try std.testing.expectEqual(@as(usize, 0), session.paragraph_resources.entries.items.len);
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].last_paragraph);
}

test "paragraph end protection split preserves unknown and absent source alignment" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<h:align horizontal='FUTURE' vertical='BASELINE'/>", "" }) |alignment_xml| {
        const header = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:paraProperties itemCnt='1'><h:paraPr id='0' opaque='keep'>{s}<h:breakSetting keepLines='1'/></h:paraPr></h:paraProperties></h:refList></h:head>", .{alignment_xml});
        defer a.free(header);
        const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0'><p:run><p:t>ABC</p:t></p:run></p:p></s:sec>", header);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        try std.testing.expect(try session.splitParagraph(0, 1, 3, 0));
        const shapes = try session.paragraphShapes();
        defer @import("paragraph_display_resources.zig").deinit(a, shapes);
        try std.testing.expectEqual(@as(usize, 2), shapes.len);
        if (alignment_xml.len == 0) {
            try std.testing.expect(shapes[0].horizontal == null and shapes[1].horizontal == null);
        } else {
            try std.testing.expectEqualStrings("FUTURE", shapes[0].horizontal.?);
            try std.testing.expectEqualStrings("FUTURE", shapes[1].horizontal.?);
        }
        try std.testing.expectEqual(@as(?bool, true), shapes[0].break_settings.?.keep_lines);
        try std.testing.expectEqual(@as(?bool, false), shapes[1].break_settings.?.keep_lines);
    }
}
