const std = @import("std");
const section_tree = @import("section_tree.zig");
const notes_mod = @import("note_bodies.zig");
const note_site = @import("note_site.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

test "HWPX note sites preserve direct ctrl and nearest paragraph run ancestry" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:ctrl><p:footNote/><p:endNote/></p:ctrl>" ++ suffix;
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var report = try notes_mod.inspect(a, &.{tree}, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.notes.len);
    for (report.notes) |note| {
        const site = note.site;
        try std.testing.expectEqual(@as(?usize, note.parent_element_index), site.control_element_index);
        try std.testing.expect(site.paragraph_element_index != null);
        try std.testing.expect(site.run_element_index != null);
        try std.testing.expectEqual(@as(?usize, null), site.text_element_index);
        try std.testing.expectEqual(@as(?usize, null), site.sub_list_element_index);
        try std.testing.expectEqual(@as(?usize, null), site.enclosing_note_element_index);
        try std.testing.expectEqualSlices(u8, note.raw_xml, tree.source[site.byte_offset..][0..note.raw_xml.len]);
    }
    try std.testing.expectEqual(report.notes[0].site.control_element_index, report.notes[1].site.control_element_index);
    try std.testing.expect(report.notes[0].site.byte_offset < report.notes[1].site.byte_offset);
}

test "HWPX note sites keep nested note body and foreign wrappers distinct" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:ctrl><p:footNote><p:subList><p:p><p:run><p:ctrl><p:endNote/></p:ctrl></p:run></p:p></p:subList></p:footNote></p:ctrl><x:ctrl><p:footNote/></x:ctrl>" ++ suffix;
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var report = try notes_mod.inspect(a, &.{tree}, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.notes.len);
    const outer = report.notes[0];
    const inner = report.notes[1];
    const foreign = report.notes[2];
    try std.testing.expectEqual(@as(?usize, outer.element_index), inner.site.enclosing_note_element_index);
    try std.testing.expectEqual(@as(?usize, null), outer.site.enclosing_note_element_index);
    try std.testing.expect(inner.site.sub_list_element_index != null);
    try std.testing.expect(inner.site.paragraph_element_index != outer.site.paragraph_element_index);
    try std.testing.expect(inner.site.run_element_index != outer.site.run_element_index);
    try std.testing.expectEqual(@as(?usize, null), foreign.site.control_element_index);
    try std.testing.expectEqual(outer.site.paragraph_element_index, foreign.site.paragraph_element_index);
}

test "HWPX note site byte offsets follow UTF16 source and survive tree release" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?>" ++ prefix ++ "<p:footNote/>" ++ suffix;
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = blk: {
            var tree = try section_tree.parse(a, raw, 0, 0, .{});
            defer tree.deinit(a);
            var owned = try notes_mod.inspect(a, &.{tree}, .{});
            errdefer owned.deinit();
            const offset = owned.notes[0].site.byte_offset;
            try std.testing.expect(offset > 2);
            try std.testing.expectEqual(@as(usize, 0), offset % 2);
            try std.testing.expectEqualSlices(u8, owned.notes[0].raw_xml, tree.source[offset..][0..owned.notes[0].raw_xml.len]);
            break :blk owned;
        };
        defer report.deinit();
        try std.testing.expect(report.notes[0].site.byte_offset > 2);
    }
}

test "HWPX note site rejects invalid index and cyclic parent references" {
    const a = std.testing.allocator;
    var tree = try section_tree.parse(a, prefix ++ "<p:ctrl><p:footNote/></p:ctrl>" ++ suffix, 0, 0, .{});
    defer tree.deinit(a);
    var report = try notes_mod.inspect(a, &.{tree}, .{});
    defer report.deinit();
    const index = report.notes[0].element_index;
    const parent = report.notes[0].parent_element_index;
    try std.testing.expectError(error.InvalidNoteIndex, note_site.locate(&tree, tree.elements.len));
    try std.testing.expectError(error.InvalidNoteIndex, note_site.locate(&tree, 0));
    tree.elements[parent].parent = tree.elements.len;
    try std.testing.expectError(error.InvalidNoteParent, note_site.locate(&tree, index));
    tree.elements[parent].parent = parent;
    try std.testing.expectError(error.InvalidNoteParent, note_site.locate(&tree, index));
}
