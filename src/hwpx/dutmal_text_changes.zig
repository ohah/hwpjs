//! Source-only leaf text changes. Caller owns session/field/cache transactions.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Change = @import("xml_source_writer.zig").Change;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Kind = enum { main_text, sub_text };

const Builder = struct {
    a: std.mem.Allocator,
    tree: *const Tree,
    leaf: usize,
    limit: usize,
    text: std.ArrayList(u8) = .empty,
    changes: std.ArrayList(Change) = .empty,
    fn deinit(self: *@This()) void {
        self.text.deinit(self.a);
        self.changes.deinit(self.a);
    }
    fn content(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
        const self: *@This() = @ptrCast(@alignCast(raw));
        if (event.parent_index != self.leaf) return;
        const span = try @import("xml_content_source_span.zig").read(self.tree, event.value);
        const value = try event.value.toUtf8(self.a, self.limit -| self.text.items.len);
        defer self.a.free(value);
        try self.text.appendSlice(self.a, value);
        try self.changes.append(self.a, .{ .start = span.start, .end = span.end, .text = "" });
    }
};

fn collect(a: std.mem.Allocator, tree: *const Tree, leaf: usize, limit: usize) !Builder {
    if (tree.elements[leaf].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    var builder: Builder = .{ .a = a, .tree = tree, .leaf = leaf, .limit = limit };
    errdefer builder.deinit();
    try tree.visitContent(a, .{ .context = &builder, .on_content = Builder.content });
    return builder;
}

pub fn readValue(a: std.mem.Allocator, tree: *const Tree, control: usize, kind: Kind, limit: usize) ![]u8 {
    var builder = try collect(a, tree, try target(tree, control, kind), limit);
    defer builder.deinit();
    return builder.text.toOwnedSlice(a);
}

pub fn target(tree: *const Tree, control: usize, kind: Kind) !usize {
    if (@import("run_anchor.zig").kind(tree, control) != .dutmal) return error.InvalidDutmalNode;
    const name = if (kind == .main_text) "mainText" else "subText";
    var found: ?usize = null;
    var child = tree.elements[control].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, name)) {
            if (found != null) return error.DuplicateInlineStringText;
            if (element.first_child != null) return error.UnsupportedInlineStringContent;
            found = index;
        }
        child = element.next_sibling;
    }
    return found orelse error.MissingInlineStringText;
}

test "dutmal leaf changes preserve comments PI attributes and other text with CDATA" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:dutmal posType='TOP'>";
    const suffix = "<p:subText>주석</p:subText></p:dutmal></p:run></p:p></s:sec>";
    const source = prefix ++ "<p:mainText custom='keep'>A<!--keep-->B<?hold x?><![CDATA[C😀<&]]></p:mainText>" ++ suffix;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const unchanged = try prepare(a, &tree, 3, .main_text, "ABC😀<&", 4096);
    defer a.free(unchanged);
    try std.testing.expectEqual(@as(usize, 0), unchanged.len);
    const changes = try prepare(a, &tree, 3, .main_text, "새😀<&", 4096);
    defer a.free(changes);
    const output = try @import("xml_source_writer.zig").write(a, tree.source, changes, 4096);
    defer a.free(output);
    try std.testing.expectEqualStrings(prefix ++ "<p:mainText custom='keep'>새😀&lt;&amp;<!--keep--><?hold x?></p:mainText>" ++ suffix, output);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            const edits = try prepare(allocator, parsed, 3, .main_text, "새😀<&", 4096);
            defer allocator.free(edits);
            const xml = try @import("xml_source_writer.zig").write(allocator, parsed.source, edits, 4096);
            defer allocator.free(xml);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.InvalidXmlCharacter, prepare(a, &tree, 3, .main_text, &.{0}, 4096));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &tree, 3, .main_text, "long", 1));
}

test "dutmal leaf changes expand empty text and reject ambiguous foreign or nested targets" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:dutmal>";
    const suffix = "</p:dutmal></p:run></p:p></s:sec>";
    const cases = [_]struct { leaf: []const u8, failure: ?anyerror }{
        .{ .leaf = "<p:mainText custom='keep'/><p:subText/>", .failure = null },
        .{ .leaf = "<p:mainText/><p:mainText/>", .failure = error.DuplicateInlineStringText },
        .{ .leaf = "<x:mainText/><p:subText/>", .failure = error.MissingInlineStringText },
        .{ .leaf = "<p:mainText><x:unknown/></p:mainText>", .failure = error.UnsupportedInlineStringContent },
    };
    for (cases) |case| {
        const source = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ prefix, case.leaf, suffix });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        if (case.failure) |failure| {
            try std.testing.expectError(failure, prepare(a, &tree, 3, .main_text, "본문", 4096));
        } else {
            const changes = try prepare(a, &tree, 3, .main_text, "본문", 4096);
            defer a.free(changes);
            const output = try @import("xml_source_writer.zig").write(a, tree.source, changes, 4096);
            defer a.free(output);
            try std.testing.expectEqualStrings(prefix ++ "<p:mainText custom='keep'>본문</p:mainText><p:subText/>" ++ suffix, output);
        }
    }
}

test "dutmal leaf changes update actual main and sub independently without source mutation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var control: ?usize = null;
    for (tree.elements, 0..) |_, index| if (@import("run_anchor.zig").kind(tree, index) == .dutmal) {
        try std.testing.expect(control == null);
        control = index;
    };
    const node = control orelse return error.InvalidDutmalNode;
    const trees = [_]Tree{tree.*};
    var before = try @import("inline_string_controls.zig").inspect(a, &trees, .{});
    defer before.deinit();
    for ([_]Kind{ .main_text, .sub_text }) |kind| {
        const value = "변경😀<&";
        const edits = try prepare(a, tree, node, kind, value, 4_000_000);
        defer a.free(edits);
        const xml = try @import("xml_source_writer.zig").write(a, tree.source, edits, 4_000_000);
        defer a.free(xml);
        var changed = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer changed.deinit(a);
        const after_trees = [_]Tree{changed};
        var after = try @import("inline_string_controls.zig").inspect(a, &after_trees, .{});
        defer after.deinit();
        try std.testing.expectEqualDeep(before.controls[0].attributes, after.controls[0].attributes);
        try std.testing.expectEqualStrings(if (kind == .main_text) value else before.texts[0].value, after.texts[0].value);
        try std.testing.expectEqualStrings(if (kind == .sub_text) value else before.texts[1].value, after.texts[1].value);
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

/// Output borrows inserted text; keep that buffer alive through source writing.
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, control: usize, kind: Kind, inserted: []const u8, limit: usize) ![]Change {
    const leaf = try target(tree, control, kind);
    const element = tree.elements[leaf];
    if (element.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const checked = try @import("../xml/text_writer.zig").encode(a, inserted, limit);
    defer a.free(checked);
    var builder = try collect(a, tree, leaf, limit);
    defer builder.deinit();
    if (std.mem.eql(u8, builder.text.items, inserted)) return a.alloc(Change, 0);
    if (builder.changes.items.len == 0) {
        try builder.changes.append(a, .{ .start = if (element.end_tag == null) element.start_tag.start else element.start_tag.end, .end = element.start_tag.end, .text = inserted, .expand_empty_element = element.end_tag == null });
    } else builder.changes.items[0].text = inserted;
    return builder.changes.toOwnedSlice(a);
}
