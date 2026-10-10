//! Actual command failure injection; fixture sampling is not exhaustive OOM proof.
const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX paragraph format sampled allocation failures preserve source and current values" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var failures: usize = 0;
    for ([_]usize{ 0, 1, 2, 8, 32, 128, 512, 2048 }) |fail_index| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        const paragraph = session.sections[0].first_paragraph + 1;
        const original = try session.paragraphShapeId(0, paragraph);
        const ids = try session.paragraphShapeIds();
        defer a.free(ids);
        var next = original;
        for (ids) |id| if (id != original) {
            next = id;
            break;
        };
        try std.testing.expect(next != original);
        var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = fail_index });
        session.allocator = failing.allocator();
        const outcome = session.setParagraphFormat(0, paragraph, next);
        session.allocator = a;
        if (outcome) |changed| {
            try std.testing.expect(changed);
            try std.testing.expectEqual(next, try session.paragraphShapeId(0, paragraph));
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            failures += 1;
            try std.testing.expectEqual(original, try session.paragraphShapeId(0, paragraph));
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, bytes, saved);
        }
    }
    try std.testing.expect(failures >= 3);
}
