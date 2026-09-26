const std = @import("std");
const section_tree = @import("section_tree.zig");
const notes_mod = @import("note_bodies.zig");
const numbers_mod = @import("number_controls.zig");
const links_mod = @import("note_number_links.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

const Inputs = struct {
    tree: section_tree.Tree,
    notes: notes_mod.Report,
    numbers: numbers_mod.Report,
    fn deinit(self: *Inputs, a: std.mem.Allocator) void {
        self.numbers.deinit();
        self.notes.deinit();
        self.tree.deinit(a);
    }
    fn link(self: *const Inputs, a: std.mem.Allocator, options: links_mod.Options) !links_mod.Report {
        return links_mod.inspect(a, &.{self.tree}, &self.notes, &self.numbers, options);
    }
};

fn inputs(a: std.mem.Allocator, inner: []const u8) !Inputs {
    const source = try std.mem.concat(a, u8, &.{ prefix, inner, suffix });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    errdefer tree.deinit(a);
    var notes = try notes_mod.inspect(a, &.{tree}, .{});
    errdefer notes.deinit();
    const numbers = try numbers_mod.inspect(a, &.{tree}, .{});
    return .{ .tree = tree, .notes = notes, .numbers = numbers };
}

test "HWPX note number links join embedded foot and end markers without assigning numbers" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:ctrl><p:footNote><p:subList><p:p><p:run><p:ctrl><p:autoNum num='1' numType='FOOTNOTE'/></p:ctrl></p:run></p:p></p:subList></p:footNote>" ++
        "<p:endNote><p:subList><p:p><p:run><p:autoNum num='-2' numType='ENDNOTE'/></p:run></p:p></p:subList></p:endNote></p:ctrl><p:autoNum num='9' numType='PAGE'/>");
    defer source.deinit(a);
    var report = try source.link(a, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.links.len);
    try std.testing.expectEqual(@as(usize, 1), report.controls_outside_notes);
    try std.testing.expectEqual(@as(usize, 0), report.notes_without_auto_num);
    try std.testing.expectEqual(@as(usize, 0), report.links[0].note_index);
    try std.testing.expectEqual(@as(usize, 1), report.links[1].note_index);
    try std.testing.expect(report.links[0].inside_direct_sub_list);
    try std.testing.expectEqual(@as(?bool, true), report.links[0].type_matches_note);
    try std.testing.expectEqual(@as(?i32, -2), report.links[1].num);
    try std.testing.expectEqual(@as(usize, 1), report.notes[0].matching_type);
    try std.testing.expectEqual(@as(usize, 1), report.notes[1].matching_type);
}

test "HWPX note number links distinguish absent mismatched foreign and outside-list markers" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<x:footNote><p:autoNum numType='FOOTNOTE'/></x:footNote>" ++
        "<p:footNote><p:autoNum numType='ENDNOTE'/><p:subList><p:p><p:autoNum numType=''/><p:autoNum/></p:p></p:subList></p:footNote>" ++
        "<p:endNote><p:subList><p:p><p:autoNum numType='FOOTNOTE'/></p:p></p:subList></p:endNote><p:footNote/>");
    defer source.deinit(a);
    var report = try source.link(a, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.controls_outside_notes);
    try std.testing.expectEqual(@as(usize, 4), report.links.len);
    try std.testing.expectEqual(@as(usize, 1), report.notes_without_auto_num);
    try std.testing.expect(!report.links[0].inside_direct_sub_list);
    try std.testing.expectEqual(@as(?bool, false), report.links[0].type_matches_note);
    try std.testing.expectEqual(@as(?bool, false), report.links[1].type_matches_note);
    try std.testing.expectEqual(@as(?bool, null), report.links[2].type_matches_note);
    try std.testing.expectEqual(@as(usize, 3), report.notes[0].links);
    try std.testing.expectEqual(@as(usize, 1), report.notes[0].missing_type);
}

test "HWPX note number links enforce exact budget and release allocation failures" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:subList><p:p><p:autoNum numType='FOOTNOTE'/></p:p></p:subList></p:footNote>");
    defer source.deinit(a);
    try std.testing.expectError(error.LimitExceeded, source.link(a, .{ .max_links = 0 }));
    var exact = try source.link(a, .{ .max_links = 1 });
    exact.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(failing: std.mem.Allocator, source_inputs: *const Inputs) !void {
            var report = try source_inputs.link(failing, .{});
            report.deinit();
        }
    }.run, .{&source});
}

test "HWPX note number links choose the nearest nested note and own scalar results" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:subList><p:p><p:endNote><p:subList><p:p><p:autoNum num='2' numType='ENDNOTE'/></p:p></p:subList></p:endNote><p:autoNum num='1' numType='FOOTNOTE'/></p:p></p:subList></p:footNote>");
    var report = try source.link(a, .{});
    source.deinit(a);
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.links.len);
    try std.testing.expectEqual(@as(usize, 1), report.links[0].note_index);
    try std.testing.expectEqual(@as(usize, 0), report.links[1].note_index);
    try std.testing.expect(report.links[0].inside_direct_sub_list);
    try std.testing.expect(report.links[1].inside_direct_sub_list);
    try std.testing.expectEqual(@as(?i32, 2), report.links[0].num);
}

test "HWPX note number links reject inconsistent caller reports" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:subList><p:p><p:autoNum numType='FOOTNOTE'/></p:p></p:subList></p:footNote>");
    defer source.deinit(a);
    var bad_notes = source.notes;
    bad_notes.sections = 2;
    try std.testing.expectError(error.InconsistentSectionCount, links_mod.inspect(a, &.{source.tree}, &bad_notes, &source.numbers, .{}));
    var bad_note = source.notes.notes[0];
    bad_note.kind = .end;
    bad_notes = source.notes;
    bad_notes.notes = &.{bad_note};
    try std.testing.expectError(error.InvalidNoteIndex, links_mod.inspect(a, &.{source.tree}, &bad_notes, &source.numbers, .{}));
    bad_note = source.notes.notes[0];
    bad_note.parent_element_index = source.tree.elements.len;
    bad_notes.notes = &.{bad_note};
    try std.testing.expectError(error.InvalidNoteIndex, links_mod.inspect(a, &.{source.tree}, &bad_notes, &source.numbers, .{}));
    bad_notes.notes = &.{ source.notes.notes[0], source.notes.notes[0] };
    try std.testing.expectError(error.DuplicateNoteIndex, links_mod.inspect(a, &.{source.tree}, &bad_notes, &source.numbers, .{}));
    var bad_numbers = source.numbers;
    var bad_control = source.numbers.controls[0];
    bad_control.element_index = source.tree.elements.len;
    bad_numbers.controls = &.{bad_control};
    try std.testing.expectError(error.InvalidControlIndex, links_mod.inspect(a, &.{source.tree}, &source.notes, &bad_numbers, .{}));
    bad_control = source.numbers.controls[0];
    bad_control.parent_element_index = source.tree.elements.len;
    bad_numbers.controls = &.{bad_control};
    try std.testing.expectError(error.InvalidControlIndex, links_mod.inspect(a, &.{source.tree}, &source.notes, &bad_numbers, .{}));
    bad_control = source.numbers.controls[0];
    bad_control.auto = null;
    bad_numbers.controls = &.{bad_control};
    try std.testing.expectError(error.InconsistentControlReport, links_mod.inspect(a, &.{source.tree}, &source.notes, &bad_numbers, .{}));
}

test "HWPX note number links keep equal element indices in different sections separate" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:footNote><p:subList><p:p><p:autoNum numType='FOOTNOTE'/></p:p></p:subList></p:footNote>" ++ suffix;
    var first = try section_tree.parse(a, section, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, section, 1, 1, .{});
    defer second.deinit(a);
    const trees = [_]section_tree.Tree{ first, second };
    var notes = try notes_mod.inspect(a, &trees, .{});
    defer notes.deinit();
    var numbers = try numbers_mod.inspect(a, &trees, .{});
    defer numbers.deinit();
    var links = try links_mod.inspect(a, &trees, &notes, &numbers, .{});
    defer links.deinit();
    try std.testing.expectEqual(@as(usize, 2), links.links.len);
    try std.testing.expectEqual(@as(usize, 0), links.links[0].note_index);
    try std.testing.expectEqual(@as(usize, 1), links.links[1].note_index);
    try std.testing.expectEqual(links.links[0].element_index, links.links[1].element_index);
    try std.testing.expectEqual(@as(usize, 1), links.links[1].section_ordinal);
}
