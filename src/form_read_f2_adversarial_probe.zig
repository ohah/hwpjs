const std = @import("std");
const a = std.testing.allocator;
const editor = @import("hwpx/editor_session.zig");
const P = @import("hwpx/paragraph_structure_values.zig");
const Tree = @import("hwpx/xml_part_tree.zig").Tree;
fn open() !editor.Session {
    const bytes = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0'><p:run><p:t>BODY</p:t><p:edit enabled='1' editable='1' readOnly='0' numOnly='0' multiLine='1'><p:text>source😀</p:text></p:edit><p:checkBtn enabled='1' editable='1' triState='1' value='UNCHECKED'/></p:run></p:p></s:sec>");
    defer a.free(bytes);
    return editor.open(a, bytes, .{});
}
fn node(s: *const editor.Session) !usize {
    for (s.sections[0].tree.elements, 0..) |_, i| if (@import("hwpx/run_anchor.zig").kind(&s.sections[0].tree, i) == .edit_box) return i;
    return error.NoForm;
}
fn same(tree: *const Tree, rows: []const P.Paragraph, first: usize, template: usize, anchor: usize) !void {
    var index = try @import("hwpx/form_display_index.zig").Index.init(a, tree, rows);
    defer index.deinit();
    const legacy = @import("hwpx/protected_display_host.zig").currentAnchorOrdinal(rows, first, template, anchor);
    if (legacy) |expected| try std.testing.expectEqual(expected, try index.ordinal(first, template, anchor)) else |err| try std.testing.expectError(err, index.ordinal(first, template, anchor));
}
test "R7 F2 selected ambiguous owner before later malformed joined row preserves error priority" {
    var s = try open();
    defer s.deinit();
    const anchor = try node(&s);
    const tree = &s.sections[0].tree;
    const template = try @import("hwpx/paragraph_site_owner.zig").ancestor(tree, anchor);
    var owned = [_]P.ProtectedPosition{.{ .element_index = anchor, .unit = 0, .kind = .anchor }};
    var bad = [_]@import("hwpx/paragraph_joined_values.zig").Piece{.{ .template_element = template, .source_ordinal = 1, .generated_id = null, .first_site = 1, .site_count = 0 }};
    var rows = [_]P.Paragraph{
        .{ .template_element = template, .source_ordinal = 1, .sites = .{ .items = &.{} }, .protected_positions = &owned },
        .{ .template_element = template, .source_ordinal = null, .generated_id = 2, .sites = .{ .items = &.{} }, .protected_positions = &owned },
        .{ .template_element = template, .source_ordinal = null, .generated_id = 3, .sites = .{ .items = &.{} }, .pieces = &bad, .protected_positions = &.{} },
    };
    try same(tree, &rows, 1, template, anchor);
    try same(tree, &rows, std.math.maxInt(usize), template, anchor);
    std.mem.swap(P.Paragraph, &rows[0], &rows[2]);
    try same(tree, &rows, 1, template, anchor);
    std.mem.swap(P.Paragraph, &rows[0], &rows[2]);
    rows[1].protected_positions = &.{};
    try same(tree, &rows, 1, template, anchor);
    rows[0].protected_positions = null;
    try same(tree, &rows, 1, template, anchor);
}
test "R7 F2 full lease allocation failures detach own indexes and preserve original pending owners" {
    var s = try open();
    defer s.deinit();
    const selected = try node(&s);
    try std.testing.expect(try s.setFormText(0, selected, "pending😀"));
    const before = try s.save();
    defer a.free(before);
    const entries = s.sections[0].form_texts.entries.items.ptr;
    const value = s.sections[0].form_texts.entries.items[0].text.ptr;
    const sites = s.sections[0].sites.items.ptr;
    const body = s.sections[0].sites.items[0].text.ptr;
    const serial = s.mutation_serial;
    var attempts: usize = 0;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, session: *editor.Session, count: *usize) !void {
            count.* += 1;
            if (count.* > 2048) return error.ProbeAllocationBoundExceeded;
            const previous = session.allocator;
            session.allocator = allocator;
            defer session.allocator = previous;
            var scope = try @import("hwpx/paragraph_read_scope.zig").Scope.init(session, 0);
            defer scope.deinit();
            try scope.attach();
            const rows = try @import("hwpx/form_display_sites.zig").read(allocator, session, 0);
            defer allocator.free(rows);
            const text = try session.formText(0, try node(session));
            defer allocator.free(text);
            try std.testing.expectEqualStrings("pending😀", text);
            for (rows) |row| if (row.kind == .check_button) {
                try std.testing.expectEqual(@import("hwpx/form_checkbox_state_write.zig").State.unchecked, try session.checkBoxState(0, row.formNode));
            };
        }
    }.run, .{ &s, &attempts });
    std.debug.print("R7 F2 whole lease OOM attempts={d}\n", .{attempts});
    try std.testing.expect(s.form_read_context == null and s.header_read_context == null and s.sections[0].paragraph_query_cache == null);
    try std.testing.expectEqual(entries, s.sections[0].form_texts.entries.items.ptr);
    try std.testing.expectEqual(value, s.sections[0].form_texts.entries.items[0].text.ptr);
    try std.testing.expectEqual(sites, s.sections[0].sites.items.ptr);
    try std.testing.expectEqual(body, s.sections[0].sites.items[0].text.ptr);
    try std.testing.expectEqual(serial, s.mutation_serial);
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "R7 F2 exhaustive actual Native priority differential 14043 cases" {
    var s = try open();
    defer s.deinit();
    const selected = try node(&s);
    const tree = &s.sections[0].tree;
    const template = try @import("hwpx/paragraph_site_owner.zig").ancestor(tree, selected);
    var owned = [_]P.ProtectedPosition{ .{ .element_index = selected, .unit = 0, .kind = .anchor }, .{ .element_index = selected, .unit = 1, .kind = .anchor } };
    var bad_binding = [_]@import("hwpx/paragraph_joined_values.zig").Piece{.{ .template_element = template, .source_ordinal = 1, .generated_id = null, .first_site = 1, .site_count = 0 }};
    var bad_piece = [_]@import("hwpx/paragraph_joined_values.zig").Piece{.{ .template_element = template, .source_ordinal = null, .generated_id = 1, .first_site = 0, .site_count = 1, .template_only = true, .owns_source = false }};
    var rows: [4]P.Paragraph = undefined;
    var cases: usize = 0;
    var combinations: usize = 1;
    for (0..5) |length| {
        for (0..combinations) |code| {
            var digits = code;
            for (rows[0..length]) |*row| {
                const state = digits % 8;
                digits /= 8;
                row.* = .{ .template_element = if (state == 0 or state == 5) template + 1 else template, .source_ordinal = 1, .sites = .{ .items = &.{} } };
                switch (state) {
                    0, 1 => {},
                    2 => row.protected_positions = &.{},
                    3, 5 => row.protected_positions = owned[0..1],
                    4 => row.protected_positions = &owned,
                    6 => row.pieces = &bad_binding,
                    7 => {
                        row.pieces = &bad_piece;
                        row.sites = .{ .items = s.sections[0].sites.items[0..1] };
                    },
                    else => unreachable,
                }
            }
            for ([_]usize{ 1, std.math.maxInt(usize) - 1, std.math.maxInt(usize) }) |first| {
                try same(tree, rows[0..length], first, template, selected);
                cases += 1;
            }
        }
        combinations *= 8;
    }
    try std.testing.expectEqual(@as(usize, 14043), cases);
    std.debug.print("R7 F2 actual Native error-priority cases={d}\n", .{cases});
}
