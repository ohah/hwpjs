const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const notes_mod = @import("note_bodies.zig");

pub const Options = struct {
    max_text_elements: usize = 2_000_000,
    max_chunks: usize = 4_000_000,
    max_text_bytes: usize = 128 * 1024 * 1024,
};

pub const NoteSummary = struct {
    first_text: ?usize = null,
    last_text: ?usize = null,
    text_elements: usize = 0,
    chunks: usize = 0,
    utf8_bytes: usize = 0,
};

pub const TextElement = struct {
    note_index: usize,
    section_ordinal: usize,
    element_index: usize,
    paragraph_element_index: ?usize,
    next_for_note: ?usize = null,
    first_chunk: ?usize = null,
    last_chunk: ?usize = null,
    chunks: usize = 0,
    utf8_bytes: usize = 0,
};

pub const Chunk = struct {
    text_index: usize,
    section_ordinal: usize,
    parent_element_index: usize,
    bytes: []const u8,
    next_for_text: ?usize = null,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    notes: []const NoteSummary,
    text_elements: []const TextElement,
    chunks: []const Chunk,
    owned_bytes: usize,
    notes_without_text_elements: usize,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Owner = struct {
    note_index: usize,
    paragraph_index: ?usize,
    text_index: ?usize,
};

const Context = struct {
    a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    tree: *const tree_mod.Tree,
    ordinal: usize,
    notes: *std.AutoHashMapUnmanaged(usize, usize),
    texts: *std.AutoHashMapUnmanaged(usize, usize),
    summaries: []NoteSummary,
    text_elements: *std.ArrayList(TextElement),
    chunks: *std.ArrayList(Chunk),
    options: Options,
    owned_bytes: *usize,

    fn owner(self: *const Context, from: ?usize) ?Owner {
        var cursor = from;
        var paragraph: ?usize = null;
        var text_element: ?usize = null;
        while (cursor) |index| {
            if (self.notes.get(index)) |note_index| return .{
                .note_index = note_index,
                .paragraph_index = paragraph,
                .text_index = text_element,
            };
            const element = self.tree.elements[index];
            if (text_element == null and element.is(document_xml.paragraph_uri, "t")) text_element = index;
            if (paragraph == null and element.is(document_xml.paragraph_uri, "p")) paragraph = index;
            cursor = element.parent;
        }
        return null;
    }

    fn onEvent(raw: *anyopaque, event: tree_mod.Tree.OrderedEvent) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        switch (event) {
            .start_element, .empty_element => |index| {
                const element = self.tree.elements[index];
                if (!element.is(document_xml.paragraph_uri, "t")) return;
                const located = self.owner(element.parent) orelse return;
                if (self.text_elements.items.len >= self.options.max_text_elements) return error.LimitExceeded;
                const text_index = self.text_elements.items.len;
                const entry = try self.texts.getOrPut(self.a, index);
                if (entry.found_existing) return error.DuplicateTextElement;
                entry.value_ptr.* = text_index;
                try self.text_elements.append(self.owned_a, .{
                    .note_index = located.note_index,
                    .section_ordinal = self.ordinal,
                    .element_index = index,
                    .paragraph_element_index = located.paragraph_index,
                });
                const summary = &self.summaries[located.note_index];
                if (summary.last_text) |previous| {
                    self.text_elements.items[previous].next_for_note = text_index;
                } else summary.first_text = text_index;
                summary.last_text = text_index;
                summary.text_elements += 1;
            },
            .content => |content| {
                const located = self.owner(content.parent_index) orelse return;
                const text_element_index = located.text_index orelse return;
                const text_index = self.texts.get(text_element_index) orelse return error.InconsistentTextElement;
                if (self.text_elements.items[text_index].note_index != located.note_index) return error.InconsistentTextElement;
                if (self.chunks.items.len >= self.options.max_chunks) return error.LimitExceeded;
                const remaining = self.options.max_text_bytes -| self.owned_bytes.*;
                const bytes = try content.value.toUtf8(self.owned_a, remaining);
                const chunk_index = self.chunks.items.len;
                try self.chunks.append(self.owned_a, .{
                    .text_index = text_index,
                    .section_ordinal = self.ordinal,
                    .parent_element_index = content.parent_index,
                    .bytes = bytes,
                });
                const text_element = &self.text_elements.items[text_index];
                if (text_element.last_chunk) |previous| {
                    self.chunks.items[previous].next_for_text = chunk_index;
                } else text_element.first_chunk = chunk_index;
                text_element.last_chunk = chunk_index;
                text_element.chunks += 1;
                text_element.utf8_bytes += bytes.len;
                const summary = &self.summaries[located.note_index];
                summary.chunks += 1;
                summary.utf8_bytes += bytes.len;
                self.owned_bytes.* += bytes.len;
            },
            .end_element => {},
        }
    }
};

/// Owns normalized XML text chunks under hp:t elements inside the nearest
/// selected 2011 foot/end note. It never synthesizes inline symbols or layout.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, notes: *const notes_mod.Report, options: Options) !Report {
    if (notes.sections != sections.len) return error.InconsistentSectionCount;
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    const summaries = try owned_a.alloc(NoteSummary, notes.notes.len);
    @memset(summaries, .{});
    var texts: std.ArrayList(TextElement) = .empty;
    var chunks: std.ArrayList(Chunk) = .empty;
    var owned_bytes: usize = 0;
    var next_note: usize = 0;
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        var note_map: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        defer note_map.deinit(a);
        var text_map: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        defer text_map.deinit(a);
        var previous_index: ?usize = null;
        while (next_note < notes.notes.len and notes.notes[next_note].section_ordinal == ordinal) : (next_note += 1) {
            const note = notes.notes[next_note];
            if (note.element_index >= tree.elements.len or (previous_index != null and note.element_index <= previous_index.?)) return error.InvalidNoteOrder;
            const element = tree.elements[note.element_index];
            const expected: []const u8 = if (note.kind == .foot) "footNote" else "endNote";
            if (!element.is(document_xml.paragraph_uri, expected) or element.parent != note.parent_element_index) return error.InvalidNoteIndex;
            try note_map.put(a, note.element_index, next_note);
            previous_index = note.element_index;
        }
        var context: Context = .{
            .a = a,
            .owned_a = owned_a,
            .tree = tree,
            .ordinal = ordinal,
            .notes = &note_map,
            .texts = &text_map,
            .summaries = summaries,
            .text_elements = &texts,
            .chunks = &chunks,
            .options = options,
            .owned_bytes = &owned_bytes,
        };
        try tree.visitOrdered(a, .{ .context = &context, .on_event = Context.onEvent });
    }
    if (next_note != notes.notes.len) return error.InvalidNoteOrder;
    var without: usize = 0;
    for (summaries) |summary| without += @intFromBool(summary.text_elements == 0);
    return .{
        .arena = arena,
        .sections = sections.len,
        .notes = summaries,
        .text_elements = try texts.toOwnedSlice(owned_a),
        .chunks = try chunks.toOwnedSlice(owned_a),
        .owned_bytes = owned_bytes,
        .notes_without_text_elements = without,
    };
}
