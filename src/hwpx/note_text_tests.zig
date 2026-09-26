const std = @import("std");
const section_tree = @import("section_tree.zig");
const notes_mod = @import("note_bodies.zig");
const text_mod = @import("note_text.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

const Inputs = struct {
    tree: section_tree.Tree,
    notes: notes_mod.Report,
    fn deinit(self: *Inputs, a: std.mem.Allocator) void {
        self.notes.deinit();
        self.tree.deinit(a);
    }
    fn inspect(self: *const Inputs, a: std.mem.Allocator, options: text_mod.Options) !text_mod.Report {
        return text_mod.inspect(a, &.{self.tree}, &self.notes, options);
    }
};

fn inputs(a: std.mem.Allocator, inner: []const u8) !Inputs {
    const source = try std.mem.concat(a, u8, &.{ prefix, inner, suffix });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    errdefer tree.deinit(a);
    const notes = try notes_mod.inspect(a, &.{tree}, .{});
    return .{ .tree = tree, .notes = notes };
}

test "HWPX note text owns normalized mixed content and empty text elements" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:t>outside</p:t><p:footNote><p:subList><p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t><p:t/></p:run></p:p></p:subList></p:footNote>" ++
        "<p:endNote><p:subList><p:p><p:run><p:t>끝</p:t></p:run></p:p></p:subList></p:endNote><x:footNote><p:t>foreign</p:t></x:footNote>");
    var report = try source.inspect(a, .{});
    source.deinit(a);
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.notes.len);
    try std.testing.expectEqual(@as(usize, 3), report.text_elements.len);
    try std.testing.expectEqual(@as(usize, 4), report.chunks.len);
    try std.testing.expectEqual(@as(usize, 7), report.owned_bytes);
    try std.testing.expectEqual(@as(usize, 2), report.notes[0].text_elements);
    try std.testing.expectEqual(@as(usize, 1), report.notes[1].text_elements);
    try std.testing.expectEqual(@as(usize, 4), report.notes[0].utf8_bytes);
    try std.testing.expectEqual(@as(usize, 3), report.notes[1].utf8_bytes);
    try std.testing.expectEqualStrings("A&", report.chunks[0].bytes);
    try std.testing.expectEqualStrings("B", report.chunks[1].bytes);
    try std.testing.expectEqualStrings("C", report.chunks[2].bytes);
    try std.testing.expectEqualStrings("끝", report.chunks[3].bytes);
    try std.testing.expectEqual(@as(?usize, 0), report.notes[0].first_text);
    try std.testing.expectEqual(@as(?usize, 1), report.text_elements[0].next_for_note);
    try std.testing.expectEqual(@as(?usize, 1), report.chunks[0].next_for_text);
    try std.testing.expectEqual(@as(?usize, null), report.text_elements[1].first_chunk);
    try std.testing.expect(report.text_elements[0].paragraph_element_index != null);
}

test "HWPX note text assigns nested notes to their nearest owner" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:subList><p:p><p:run><p:t>before</p:t><p:endNote><p:subList><p:p><p:run><p:t>inner</p:t></p:run></p:p></p:subList></p:endNote><p:t>after</p:t></p:run></p:p></p:subList></p:footNote>");
    defer source.deinit(a);
    var report = try source.inspect(a, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.text_elements.len);
    try std.testing.expectEqual(@as(usize, 2), report.notes[0].text_elements);
    try std.testing.expectEqual(@as(usize, 1), report.notes[1].text_elements);
    try std.testing.expectEqual(@as(usize, 11), report.notes[0].utf8_bytes);
    try std.testing.expectEqual(@as(usize, 5), report.notes[1].utf8_bytes);
    try std.testing.expectEqual(@as(?usize, 2), report.text_elements[0].next_for_note);
    try std.testing.expectEqual(@as(usize, 1), report.text_elements[1].note_index);
}

test "HWPX note text excludes nested note text from an enclosing text element" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:t>L<p:endNote><p:t>N</p:t></p:endNote>R</p:t><x:t>foreign</x:t></p:footNote>");
    defer source.deinit(a);
    var report = try source.inspect(a, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.text_elements.len);
    try std.testing.expectEqual(@as(usize, 3), report.chunks.len);
    try std.testing.expectEqual(@as(usize, 2), report.notes[0].utf8_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.notes[1].utf8_bytes);
    try std.testing.expectEqualStrings("L", report.chunks[0].bytes);
    try std.testing.expectEqualStrings("N", report.chunks[1].bytes);
    try std.testing.expectEqualStrings("R", report.chunks[2].bytes);
    try std.testing.expectEqual(@as(?usize, 2), report.chunks[0].next_for_text);
    try std.testing.expectEqual(@as(?usize, null), report.chunks[1].next_for_text);
}

test "HWPX note text keeps repeated element indexes separate by section" {
    const a = std.testing.allocator;
    const first = prefix ++ "<p:footNote><p:t>first</p:t></p:footNote>" ++ suffix;
    const second = prefix ++ "<p:endNote><p:t>second</p:t></p:endNote>" ++ suffix;
    var trees = [_]section_tree.Tree{
        try section_tree.parse(a, first, 0, 0, .{}),
        undefined,
    };
    defer trees[0].deinit(a);
    trees[1] = try section_tree.parse(a, second, 1, 1, .{});
    defer trees[1].deinit(a);
    var notes = try notes_mod.inspect(a, &trees, .{});
    defer notes.deinit();
    var report = try text_mod.inspect(a, &trees, &notes, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.notes.len);
    try std.testing.expectEqual(@as(usize, 2), report.text_elements.len);
    try std.testing.expectEqual(report.text_elements[0].element_index, report.text_elements[1].element_index);
    try std.testing.expectEqual(@as(usize, 0), report.text_elements[0].note_index);
    try std.testing.expectEqual(@as(usize, 1), report.text_elements[1].note_index);
    try std.testing.expectEqualStrings("first", report.chunks[0].bytes);
    try std.testing.expectEqualStrings("second", report.chunks[1].bytes);
}

test "HWPX note text enforces exact independent limits" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:subList><p:p><p:t>AB</p:t></p:p></p:subList></p:footNote>");
    defer source.deinit(a);
    try std.testing.expectError(error.LimitExceeded, source.inspect(a, .{ .max_text_elements = 0 }));
    try std.testing.expectError(error.LimitExceeded, source.inspect(a, .{ .max_chunks = 0 }));
    try std.testing.expectError(error.LimitExceeded, source.inspect(a, .{ .max_text_bytes = 1 }));
    var exact = try source.inspect(a, .{ .max_text_elements = 1, .max_chunks = 1, .max_text_bytes = 2 });
    defer exact.deinit();
    try std.testing.expectEqualStrings("AB", exact.chunks[0].bytes);
}

test "HWPX note text rejects inconsistent note reports and frees all allocation failures" {
    const a = std.testing.allocator;
    var source = try inputs(a, "<p:footNote><p:subList><p:p><p:t>AB</p:t></p:p></p:subList></p:footNote>");
    defer source.deinit(a);
    var bad = source.notes;
    bad.sections = 2;
    try std.testing.expectError(error.InconsistentSectionCount, text_mod.inspect(a, &.{source.tree}, &bad, .{}));
    var wrong = source.notes.notes[0];
    wrong.kind = .end;
    bad = source.notes;
    bad.notes = &.{wrong};
    try std.testing.expectError(error.InvalidNoteIndex, text_mod.inspect(a, &.{source.tree}, &bad, .{}));
    bad.notes = &.{ source.notes.notes[0], source.notes.notes[0] };
    try std.testing.expectError(error.InvalidNoteOrder, text_mod.inspect(a, &.{source.tree}, &bad, .{}));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(failing: std.mem.Allocator, source_inputs: *const Inputs) !void {
            var report = try source_inputs.inspect(failing, .{});
            report.deinit();
        }
    }.run, .{&source});
}

test "HWPX note text decodes both UTF-16 byte orders" {
    const a = std.testing.allocator;
    const ascii = prefix ++ "<p:footNote><p:t>A&amp;B</p:t></p:footNote>" ++ suffix;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const xml = "<?xml version='1.0' encoding='" ++ encoding ++ "'?>" ++ ascii;
        const raw = try a.alloc(u8, 2 + xml.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (xml, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var tree = try section_tree.parse(a, raw, 0, 0, .{});
        defer tree.deinit(a);
        var notes = try notes_mod.inspect(a, &.{tree}, .{});
        defer notes.deinit();
        var report = try text_mod.inspect(a, &.{tree}, &notes, .{});
        defer report.deinit();
        try std.testing.expectEqual(@as(usize, 1), report.text_elements.len);
        try std.testing.expectEqualStrings("A&B", report.chunks[0].bytes);
    }
}
