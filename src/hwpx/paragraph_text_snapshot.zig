//! Owned plain text in authoritative editor order, not serialized XML order.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Row = struct { paragraph: usize, text: []u8, nested: bool };
pub fn free(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |row| a.free(row.text);
    a.free(rows);
}
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    if (try @import("formula_section_save.zig").hasFormula(a, &session.sections[section_index].tree)) {
        const bytes = try session.save();
        defer session.allocator.free(bytes);
        var rendered = try editor.open(a, bytes, session.options);
        defer rendered.deinit();
        return readOwned(a, &rendered, section_index);
    }
    return readOwned(a, session, section_index);
}

// Serialized calculation results are transient display data, never model writes.
fn readOwned(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const rows = try a.alloc(Row, current.paragraphs.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |row| a.free(row.text);
        a.free(rows);
    }
    var used: usize = 0;
    for (current.paragraphs, rows, 0..) |paragraph, *row, index| {
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(a);
        for (paragraph.sites.items) |site| {
            if (site.text.len > session.options.max_text_bytes -| used) return error.LimitExceeded;
            used += site.text.len;
            try bytes.appendSlice(a, site.text);
        }
        const parent = section.tree.elements[paragraph.template_element].parent;
        const nested = if (parent) |node| !section.tree.elements[node].is(@import("document_xml.zig").section_uri, "sec") else true;
        const ordinal = std.math.add(usize, section.first_paragraph, index) catch return error.LimitExceeded;
        row.* = .{ .paragraph = ordinal, .nested = nested, .text = try bytes.toOwnedSlice(a) };
        initialized += 1;
    }
    return rows;
}

test "HWPX paragraph text snapshot keeps nested text in current editor order" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraphAnchored(0, 1, 5, 0));
    const rows = try read(a, &session, 0);
    defer free(a, rows);
    try std.testing.expectEqual(@as(usize, 7), rows.len);
    try std.testing.expectEqual(@as(usize, 3), rows[2].paragraph);
    try std.testing.expectEqualStrings(" 각주입니다.", rows[2].text);
    try std.testing.expect(rows[2].nested);
    try std.testing.expect(!rows[1].nested);
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, 999));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session) !void {
            const result = try read(allocator, state, 0);
            defer free(allocator, result);
            try std.testing.expectEqualStrings(" 각주입니다.", result[2].text);
        }
    }.run, .{&session});
    var exact_bytes: usize = 0;
    for (rows) |row| exact_bytes += row.text.len;
    session.options.max_text_bytes = exact_bytes;
    const exact = try read(a, &session, 0);
    defer free(a, exact);
    try std.testing.expectEqualDeep(rows, exact);
    session.options.max_text_bytes = exact_bytes - 1;
    try std.testing.expectError(error.LimitExceeded, read(a, &session, 0));
    session.options.max_text_bytes = 0;
    try std.testing.expectError(error.LimitExceeded, read(a, &session, 0));
    session.options.max_text_bytes = exact_bytes;
    session.sections[0].first_paragraph = std.math.maxInt(usize);
    try std.testing.expectError(error.LimitExceeded, read(a, &session, 0));
}
