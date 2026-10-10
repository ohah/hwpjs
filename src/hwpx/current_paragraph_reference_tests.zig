const std = @import("std");
const refs = @import("current_paragraph_reference.zig");
const views = @import("display_current_paragraphs.zig");
const editor = @import("editor_session.zig");

fn resolve(a: std.mem.Allocator, session: *const editor.Session, reference: refs.Reference) !usize {
    var view = try views.read(a, &session.sections[0], session.options);
    defer view.deinit(a);
    return refs.ordinal(view.paragraphs, session.sections[0].first_paragraph, reference);
}

test "current paragraph reference follows actual split order and refuses a retired merge identity" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const source = block: {
        var view = try views.read(a, &session.sections[0], session.options);
        defer view.deinit(a);
        break :block try refs.from(&view.paragraphs[1]);
    };
    try std.testing.expectEqual(@as(usize, 2), try resolve(a, &session, source));
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    const generated = block: {
        var view = try views.read(a, &session.sections[0], session.options);
        defer view.deinit(a);
        break :block try refs.from(&view.paragraphs[1]);
    };
    try std.testing.expectEqual(@as(usize, 3), try resolve(a, &session, source));
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    try std.testing.expectEqual(@as(usize, 3), try resolve(a, &session, generated));
    try std.testing.expectEqual(@as(usize, 4), try resolve(a, &session, source));
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expectEqual(@as(usize, 2), try resolve(a, &session, generated));
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expectError(error.MissingCurrentParagraphReference, resolve(a, &session, generated));
    try std.testing.expectEqual(@as(usize, 2), try resolve(a, &session, source));
    try std.testing.expectEqualSlices(u8, input, session.source);
}
