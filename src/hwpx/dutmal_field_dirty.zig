//! Derive field invalidation without mutating source or persisted dirty values.
const std = @import("std");
const Dirty = @import("text_sites_save.zig").FieldDirty;
pub fn read(session: *const @import("editor_session.zig").Session, section_index: usize) ![]Dirty {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const a = session.allocator;
    const section = &session.sections[section_index];
    var output: std.ArrayList(Dirty) = .empty;
    defer output.deinit(a);
    for (section.field_dirty.items) |value| {
        for (output.items) |previous| if (previous.element_index == value.element_index) return error.DuplicateFieldDirty;
        try output.append(a, value);
    }
    if (section.dutmal_texts.entries.items.len == 0) return output.toOwnedSlice(a);
    var analysis = try @import("source_field_analysis.zig").leaseForDiagnostics(session);
    defer analysis.deinit(a);
    for (section.dutmal_texts.entries.items) |entry| {
        const leaf = try @import("dutmal_text_changes.zig").target(&section.tree, entry.control, entry.kind);
        const element = section.tree.elements[leaf];
        for (analysis.source.report.markers) |marker| {
            if (marker.section_ordinal != section_index or marker.kind != .begin or marker.matched_marker_index != null) continue;
            const envelope = try @import("field_source_scope.zig").forBegin(&section.tree, marker.element_index);
            if (envelope.contains(element.start_tag.start)) return error.ProtectedFieldRange;
        }
        for (analysis.source.fields) |field| {
            if (field.section != section_index or field.content_end <= element.start_tag.start or element.end <= field.content_start) continue;
            if (element.start_tag.start < field.content_start or element.end > field.content_end) return error.UnsupportedDutmalFieldEdit;
            const marker = analysis.source.report.markers[field.begin_marker];
            if (!@import("field_text_kind.zig").supported(marker.begin.?.type_raw orelse "")) return error.UnsupportedDutmalFieldEdit;
            var found = false;
            for (output.items) |*value| if (value.element_index == marker.element_index) {
                value.dirty = true;
                found = true;
                break;
            };
            if (!found) try output.append(a, .{ .element_index = marker.element_index, .dirty = true });
        }
    }
    return output.toOwnedSlice(a);
}

test "dutmal field dirty marks text fields and preserves unknown and unresolved protection" {
    const a = std.testing.allocator;
    const cases = [_]struct { kind: []const u8, closed: bool, failure: ?anyerror }{
        .{ .kind = "CLICK_HERE", .closed = true, .failure = null },
        .{ .kind = "DATE", .closed = true, .failure = error.UnsupportedDutmalFieldEdit },
        .{ .kind = "CLICK_HERE", .closed = false, .failure = error.ProtectedFieldRange },
    };
    for (cases) |case| {
        const xml = try std.fmt.allocPrint(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='1' type='{s}' dirty='0'/></p:ctrl><p:dutmal><p:mainText>A</p:mainText><p:subText>B</p:subText></p:dutmal>{s}</p:run><p:linesegarray/></p:p>", .{ case.kind, if (case.closed) "<p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>" else "" });
        defer a.free(xml);
        const section_xml = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>{s}</s:sec>", .{xml});
        defer a.free(section_xml);
        const input = try @import("test_formula_fixture.zig").zipWithSection(a, section_xml);
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        var node: ?usize = null;
        for (session.sections[0].tree.elements, 0..) |_, index| if (@import("run_anchor.zig").kind(&session.sections[0].tree, index) == .dutmal) {
            node = index;
        };
        if (case.failure) |failure| {
            try std.testing.expectError(failure, session.setDutmalText(0, node.?, .sub_text, "새😀"));
            try std.testing.expectEqual(@as(usize, 0), session.sections[0].dutmal_texts.entries.items.len);
            const unchanged = try session.save();
            defer a.free(unchanged);
            try std.testing.expectEqualSlices(u8, input, unchanged);
        } else {
            try std.testing.expect(try session.setDutmalText(0, node.?, .sub_text, "새😀"));
            const dirty = try read(&session, 0);
            defer a.free(dirty);
            try std.testing.expectEqual(@as(usize, 1), dirty.len);
            try std.testing.expect(dirty[0].dirty);
            const saved = try session.save();
            defer a.free(saved);
            var reopened = try @import("editor_session.zig").open(a, saved, .{});
            defer reopened.deinit();
            try std.testing.expect(reopened.source_fields.?.report.markers[0].begin.?.dirty.?);
        }
        try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
}
