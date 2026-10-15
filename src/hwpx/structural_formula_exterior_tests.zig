const std = @import("std");
const editor = @import("editor_session.zig");

test "structural formula exterior refuses duplicate immutable field owners before publication" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:t>ordinary</p:t></p:run></p:p><p:p><p:run><p:t>outside</p:t><p:ctrl><p:fieldBegin id='2' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 1));
    const before = try session.save();
    defer a.free(before);
    const original = session.sections[0].structure_values.?;
    const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
    const rows = try a.alloc(Paragraph, original.paragraphs.len + 1);
    defer a.free(rows);
    var initialized: usize = 0;
    defer for (rows[0..initialized]) |*row| row.deinit(a);
    for (original.paragraphs) |row| {
        rows[initialized] = try row.clone(a);
        initialized += 1;
    }
    rows[initialized] = try original.paragraphs[2].clone(a);
    initialized += 1;
    var proxy = session;
    proxy.sections = try a.dupe(editor.Section, session.sections);
    defer a.free(proxy.sections);
    proxy.sections[0].structure_values = .{ .paragraphs = rows };
    proxy.sections[0].last_paragraph += 1;
    try std.testing.expectError(error.DuplicateCurrentTextOwner, @import("field_outside_query.zig").canEdit(&proxy, 0, 3, 0, 0));
    try std.testing.expectError(error.DuplicateCurrentTextOwner, proxy.splice(0, 3, 0, 0, "금지"));
    for (original.paragraphs, rows[0..original.paragraphs.len]) |old, now| {
        for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
    }
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "mixed formula moved field allocation failures preserve owned markers definition and original ZIP" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:t>outside</p:t><p:ctrl><p:fieldBegin id='2' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    var formula_begin: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin") and std.mem.indexOf(u8, session.sections[0].tree.sourceOf(index), "type='FORMULA'") != null) formula_begin = index;
    }
    const begin = formula_begin orelse return error.MissingFormulaField;
    try std.testing.expect(try session.setFormulaDefinition(0, begin, "=AVG(A1:A1)"));
    const baseline = try session.save();
    defer a.free(baseline);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, definition: usize) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, original.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].structure_values = try original.sections[0].structure_values.?.clone(allocator);
            defer proxy.sections[0].structure_values.?.deinit(allocator);
            const changed = proxy.splice(0, 2, 0, 0, "혼합😀") catch |err| {
                for (original.sections[0].structure_values.?.paragraphs, proxy.sections[0].structure_values.?.paragraphs) |old, now| {
                    try std.testing.expectEqual(old.sites.items.len, now.sites.items.len);
                    for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                    try std.testing.expectEqualDeep(old.field_positions, now.field_positions);
                    try std.testing.expectEqualDeep(old.character_styles, now.character_styles);
                    try std.testing.expectEqual(old.generated_id, now.generated_id);
                }
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                try std.testing.expectEqualStrings("=AVG(A1:A1)", proxy.sections[0].formula_definitions.get(definition).?);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualStrings("=AVG(A1:A1)", proxy.sections[0].formula_definitions.get(definition).?);
        }
    }.run, .{ &session, begin });
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            try std.testing.expect(try @import("field_outside_query.zig").canEdit(&proxy, 0, 2, 0, 0));
            try std.testing.expect(!try @import("field_outside_query.zig").canEdit(&proxy, 0, 2, 7, 7));
            const labels = try proxy.fieldLabels(0, 2);
            defer allocator.free(labels);
            try std.testing.expectEqual(@as(usize, 1), labels.len);
            const computed = try proxy.fieldLabels(0, 4);
            defer allocator.free(computed);
            try std.testing.expectEqual(@as(usize, 0), computed.len);
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}

test "mixed formula section retains existing moved hyperlink exterior permission" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:t>outside</p:t><p:ctrl><p:fieldBegin id='2' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    if (!try session.splitParagraph(0, 1, 0, 0)) return error.ExpectedMixedFieldSplit;
    if (session.sections[0].structure_values.?.paragraphs[1].field_positions == null) return error.MissingMovedFieldPositions;
    const formula_labels = try session.fieldLabels(0, 4);
    defer a.free(formula_labels);
    try std.testing.expectEqual(@as(usize, 0), formula_labels.len);
    if (!try @import("field_outside_query.zig").canEdit(&session, 0, 2, 0, 0)) return error.MissingMixedExteriorPermission;
    try std.testing.expect(!try @import("field_outside_query.zig").canEdit(&session, 0, 2, 7, 7));
    try std.testing.expect(try session.splice(0, 2, 0, 0, "외부😀"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&reopened, 0, 2, 0, 0));
}

test "structural formula exterior transaction allocation failures preserve complete model and ZIP" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:t>ordinary</p:t></p:run></p:p><p:p><p:run><p:t>outside</p:t><p:ctrl><p:fieldBegin id='2' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 1));
    var formula_begin: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin") and std.mem.indexOf(u8, session.sections[0].tree.sourceOf(index), "type='FORMULA'") != null) formula_begin = index;
    }
    const begin = formula_begin orelse return error.MissingFormulaField;
    try std.testing.expect(try session.setFormulaDefinition(0, begin, "=AVG(A1:A1)"));
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 3, 0, 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, definition: usize) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, original.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].structure_values = try original.sections[0].structure_values.?.clone(allocator);
            defer proxy.sections[0].structure_values.?.deinit(allocator);
            const changed = proxy.splice(0, 3, 0, 0, "구조😀") catch |err| {
                for (original.sections[0].structure_values.?.paragraphs, proxy.sections[0].structure_values.?.paragraphs) |old, now| {
                    try std.testing.expectEqual(old.template_element, now.template_element);
                    try std.testing.expectEqual(old.source_ordinal, now.source_ordinal);
                    try std.testing.expectEqual(old.sites.items.len, now.sites.items.len);
                    for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                    try std.testing.expectEqualDeep(old.character_styles, now.character_styles);
                }
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                try std.testing.expectEqualStrings("=AVG(A1:A1)", proxy.sections[0].formula_definitions.get(definition).?);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualStrings("=AVG(A1:A1)", proxy.sections[0].formula_definitions.get(definition).?);
            try std.testing.expectEqualStrings("구조😀outside", proxy.sections[0].structure_values.?.paragraphs[2].sites.items[0].text);
        }
    }.run, .{ &session, begin });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}
