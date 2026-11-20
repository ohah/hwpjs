//! Number-only edits and explicit initial source changes share one scoped cache writer.
const std = @import("std");
const editor = @import("editor_session.zig");
const writer = @import("xml_source_writer.zig");
const numbering = @import("note_delete_numbering.zig");
pub fn package(a: std.mem.Allocator, session: *const editor.Session, before: []const u8, section_index: ?usize, initial: []const writer.Change, updates: []const numbering.Update) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const changes = try scratch.alloc(std.ArrayList(writer.Change), session.sections.len);
    @memset(changes, .empty);
    if (section_index) |section| try changes[section].appendSlice(scratch, initial);
    var caches: std.AutoHashMap(struct { section: usize, node: usize }, void) = .init(scratch);
    for (updates) |update| {
        const tree = &session.sections[update.section].tree;
        const tag = try numbering.writeTag(scratch, tree, update, session.options.max_xml_bytes);
        const span = tree.elements[update.number_node].start_tag;
        try changes[update.section].append(scratch, .{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag });
        var cache: ?usize = null;
        var child = tree.elements[update.paragraph_node].first_child;
        while (child) |node| : (child = tree.elements[node].next_sibling) {
            if (!tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "linesegarray")) continue;
            if (cache != null) return error.UnsupportedPageLayoutCache;
            cache = node;
            try @import("page_settings_layout_cache.zig").validateSubtree(a, tree, .{ .root_node = node });
            const entry = try caches.getOrPut(.{ .section = update.section, .node = node });
            if (entry.found_existing) continue;
            try changes[update.section].append(scratch, .{ .start = tree.elements[node].start_tag.start, .end = tree.elements[node].end, .text = "", .serialized_xml = "" });
        }
    }
    var replacements: std.ArrayList(@import("../zip/replace_writer.zig").Replacement) = .empty;
    for (changes, session.sections) |*part_changes, section| {
        if (part_changes.items.len == 0) continue;
        std.mem.sort(writer.Change, part_changes.items, {}, struct {
            fn less(_: void, left: writer.Change, right: writer.Change) bool {
                return left.start < right.start;
            }
        }.less);
        const xml = try writer.write(scratch, section.tree.source, part_changes.items, session.options.max_xml_bytes);
        try replacements.append(scratch, .{ .entry_index = section.entry_index, .bytes = xml });
    }
    return @import("../zip/replace_writer.zig").write(a, before, replacements.items, .{ .max_output_bytes = session.options.max_output_bytes });
}
