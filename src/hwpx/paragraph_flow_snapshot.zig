//! 현재 문단의 source owner와 강제 나눔 원값입니다. 페이지 배치는 계산하지 않습니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Host = enum { body, header, footer, footnote, endnote, drawing, other };
pub const Row = struct {
    paragraph: usize,
    source_node: usize,
    top_level: bool,
    page_break: ?bool,
    column_break: ?bool,
    single_column: bool = true,
    host: Host = .other,
    page_area: ?@import("page_area_context.zig").Context = null,
    page_number_source: ?@import("page_number_source.zig").Values = null,
    column_declaration: ?@import("column_context.zig").Context = null,
    column_start_declaration: ?@import("column_context.zig").Context = null,
    column_changes: []@import("column_current_context.zig").Change = &.{},
    note_context: ?@import("note_paragraph_context.zig").Context = null,
};

fn freeRow(a: std.mem.Allocator, row: Row) void {
    if (row.column_declaration) |column| a.free(column.sizes);
    if (row.column_start_declaration) |column| a.free(column.sizes);
    for (row.column_changes) |change| a.free(change.declaration.sizes);
    a.free(row.column_changes);
}

pub fn free(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |row| freeRow(a, row);
    a.free(rows);
}

fn host(tree: *const Tree, node: usize) !Host {
    const uri = @import("document_xml.zig").paragraph_uri;
    var current = node;
    while (tree.elements[current].parent) |parent| {
        if (parent >= current) return error.InvalidPartTree;
        const element = tree.elements[parent];
        if (current == node and element.is(@import("document_xml.zig").section_uri, "sec")) return .body;
        inline for (.{ "header", "footer" }) |name| {
            if (element.is(uri, name)) return @field(Host, name);
        }
        if (element.is(uri, "footNote")) return .footnote;
        if (element.is(uri, "endNote")) return .endnote;
        inline for (.{ "drawText", "rect", "ellipse", "polygon", "container" }) |name| {
            if (element.is(uri, name)) return .drawing;
        }
        current = parent;
    }
    return .other;
}

fn boolean(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?bool {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try @import("table_xml_fields.zig").boolean(a, raw, 4096);
}

test "HWPX paragraph flow host distinguishes nested controls and foreign namespace" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:p/><p:header><p:subList><p:p/></p:subList></p:header><p:footnote><p:subList><p:p/></p:subList></p:footnote><f:header><p:p/></f:header></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(Host.body, try host(&tree, 1));
    try std.testing.expectEqual(Host.header, try host(&tree, 4));
    try std.testing.expectEqual(Host.other, try host(&tree, 7));
    try std.testing.expectEqual(Host.other, try host(&tree, 9));
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Row {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const trees = try a.alloc(Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |source, *tree| tree.* = source.tree;
    var has_page_area = false;
    for (section.tree.elements) |element| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "header") or element.is(@import("document_xml.zig").paragraph_uri, "footer")) has_page_area = true;
    }
    const page_number_source = if (has_page_area) try @import("page_number_source.zig").read(a, session.source, trees, section_index) else null;
    var columns = try @import("column_definitions.zig").inspect(a, trees, .{});
    defer columns.deinit();
    var single_column = true;
    for (columns.columns) |column| {
        if (column.section_ordinal == section_index and column.attributes.col_count != 1) single_column = false;
    }
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    const current_columns = try @import("column_current_context.zig").read(a, &section.tree, &columns, view.paragraphs);
    defer @import("column_current_context.zig").free(a, current_columns);
    const rows = try a.alloc(Row, view.paragraphs.len);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |row| freeRow(a, row);
        a.free(rows);
    }
    for (view.paragraphs, rows, 0..) |paragraph, *row, index| {
        const node = paragraph.template_element;
        if (node >= section.tree.elements.len) return error.InvalidPartTree;
        const parent = section.tree.elements[node].parent orelse return error.InvalidPartTree;
        if (parent >= node) return error.InvalidPartTree;
        const continuation = paragraph.generated_id != null;
        const currentBreak = @import("paragraph_continuation_tag.zig").currentBreak;
        row.* = .{ .paragraph = std.math.add(usize, section.first_paragraph, index) catch return error.LimitExceeded, .source_node = node, .top_level = section.tree.elements[parent].is(@import("document_xml.zig").section_uri, "sec"), .page_break = currentBreak(try boolean(a, &section.tree, node, "pageBreak"), continuation), .column_break = currentBreak(try boolean(a, &section.tree, node, "columnBreak"), continuation) };
        initialized += 1;
        row.single_column = single_column;
        row.host = try host(&section.tree, node);
        row.note_context = try @import("note_paragraph_context.zig").read(&section.tree, node);
        row.page_area = try @import("page_area_context.zig").read(a, &section.tree, node);
        row.page_number_source = page_number_source;
        row.column_declaration = current_columns[index].initial;
        if (row.column_declaration) |*column| column.sizes = try @import("column_context.zig").copySizes(a, &columns, column.declaration_node, section_index);
        row.column_start_declaration = current_columns[index].start;
        if (row.column_start_declaration) |*column| column.sizes = try @import("column_context.zig").copySizes(a, &columns, column.declaration_node, section_index);
        row.column_changes = try a.dupe(@import("column_current_context.zig").Change, current_columns[index].changes);
        for (row.column_changes) |*change| change.declaration.sizes = try @import("column_context.zig").copySizes(a, &columns, change.declaration.declaration_node, section_index);
    }
    return rows;
}

test "HWPX paragraph flow uses current merged column boundaries and continuation inheritance" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const merged = try read(a, &session, 0);
    defer free(a, merged);
    try std.testing.expectEqual(@as(?u32, 2), merged[0].column_declaration.?.count);
    try std.testing.expect(!merged[0].column_declaration.?.ambiguous);
    try std.testing.expectEqual(@as(usize, 2), merged[0].column_changes.len);
    try std.testing.expectEqual(@as(u32, 0), merged[0].column_changes[0].unit);
    try std.testing.expectEqual(@as(u32, 0), merged[0].column_changes[1].unit);
    try std.testing.expectEqual(@as(?u32, 2), merged[0].column_changes[1].declaration.count);
    try std.testing.expectEqual(@as(?u32, 3), merged[1].column_declaration.?.count);
    {
        const boundary = &session.sections[0].structure_values.?.paragraphs[0].column_boundaries.?[0];
        const previous = boundary.unit;
        defer boundary.unit = previous;
        boundary.unit = std.math.maxInt(u32);
        try std.testing.expectError(error.InvalidTextPosition, read(a, &session, 0));
    }
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const reopened_rows = try read(a, &reopened, 0);
    defer free(a, reopened_rows);
    try std.testing.expectEqual(@as(?u32, 2), reopened_rows[0].column_declaration.?.count);
    try std.testing.expect(!reopened_rows[0].column_declaration.?.ambiguous);
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const split = try read(a, &session, 0);
    defer free(a, split);
    try std.testing.expectEqual(@as(?u32, 2), split[0].column_declaration.?.count);
    try std.testing.expectEqual(@as(?u32, 2), split[1].column_declaration.?.count);
    try std.testing.expectEqual(@as(?u32, 3), split[2].column_declaration.?.count);
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const internal = try read(a, &session, 0);
    defer free(a, internal);
    try std.testing.expect(internal[0].column_declaration.?.ambiguous);
    try std.testing.expect(!internal[0].column_start_declaration.?.ambiguous);
    try std.testing.expectEqual(@as(?u32, 2), internal[0].column_start_declaration.?.count);
    try std.testing.expectEqual(@as(usize, 3), internal[0].column_changes.len);
    try std.testing.expectEqual(@as(u32, 1968), internal[0].column_changes[2].unit);
    try std.testing.expectEqual(@as(?u32, 3), internal[0].column_changes[2].declaration.count);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, current: *const editor.Session) !void {
            const rows = try read(allocator, current, 0);
            defer free(allocator, rows);
            try std.testing.expect(rows[0].column_declaration.?.ambiguous);
        }
    }.run, .{&session});
}

test "HWPX paragraph flow reads hyperlink source columns without granting anchor edit permission" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
            defer a.free(bytes);
            var session = try editor.open(a, bytes, .{});
            defer session.deinit();
            const rows = try read(a, &session, 0);
            defer free(a, rows);
            try std.testing.expectEqual(@as(usize, 9), rows.len);
            try std.testing.expectEqual(@as(?u32, 1), rows[0].column_declaration.?.count);
            try std.testing.expectEqual(@as(usize, 1), rows[0].column_changes.len);
            try std.testing.expectEqual(@as(u32, 0), rows[0].column_changes[0].unit);
            try std.testing.checkAllAllocationFailures(a, struct {
                fn run(allocator: std.mem.Allocator, current: *const editor.Session) !void {
                    const output = try read(allocator, current, 0);
                    defer free(allocator, output);
                    try std.testing.expectEqual(@as(usize, 9), output.len);
                }
            }.run, .{&session});
        }
    }.run, .{});
}

test "HWPX paragraph flow note context keeps direct ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const rows = try read(a, &session, 0);
    defer free(a, rows);
    try std.testing.expectEqual(@as(usize, 6), rows.len);
    try std.testing.expect(rows[0].note_context == null and rows[3].note_context == null);
    for ([_]usize{ 1, 2, 4, 5 }) |index| {
        const context = rows[index].note_context.?;
        try std.testing.expect(context.note_node < context.list_node and context.list_node < rows[index].source_node);
        try std.testing.expectEqualStrings(@tagName(rows[index].host), @tagName(context.kind));
    }
    try std.testing.expect(rows[1].note_context.?.note_node != rows[2].note_context.?.note_node);
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:footNote><p:subList><p:p/><p:p/><p:rect><p:subList><p:p/></p:subList></p:rect></p:subList></p:footNote><f:endNote><p:subList><p:p/></p:subList></f:endNote></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const context = @import("note_paragraph_context.zig");
    try std.testing.expectEqualDeep((try context.read(&tree, 3)).?, (try context.read(&tree, 4)).?);
    try std.testing.expect(try context.read(&tree, 7) == null);
    try std.testing.expect(try context.read(&tree, 10) == null);
    try std.testing.expectError(error.InvalidPartTree, context.read(&tree, tree.elements.len));
}

test "HWPX paragraph flow actual cell columns remain list scoped" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-in-common-controls.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const rows = try read(a, &session, 0);
    defer free(a, rows);
    try std.testing.expectEqual(@as(usize, 6), rows.len);
    try std.testing.expectEqual(@as(?u32, 1), rows[0].column_declaration.?.count);
    try std.testing.expect(rows[1].column_declaration == null);
    try std.testing.expectEqual(@as(?u32, 2), rows[2].column_declaration.?.count);
    try std.testing.expectEqual(@as(?u32, 1), rows[3].column_declaration.?.count);
    try std.testing.expectEqual(@as(?u32, 2), rows[4].column_declaration.?.count);
    try std.testing.expect(rows[2].column_declaration.?.owner_node != rows[4].column_declaration.?.owner_node);
    try std.testing.expect(rows[5].column_declaration == null);
}

test "HWPX paragraph flow actual split all allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            const rows = try read(allocator, source, 0);
            defer free(allocator, rows);
            try std.testing.expectEqual(@as(usize, 2), rows.len);
            try std.testing.expect(rows[0].top_level and rows[1].top_level);
            try std.testing.expect(rows[1].page_break != true and rows[1].column_break != true);
            const bytes = try std.json.Stringify.valueAlloc(allocator, rows, .{});
            defer allocator.free(bytes);
        }
    }.run, .{&session});
}
