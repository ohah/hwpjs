//! Experimental proof: one editable model with an immutable HWP5 sidecar.
//! Controlled style references and plain-text splices; no layout engine.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
const projection = @import("../model_projection.zig");
const model = @import("../../model/document.zig");
const framing = @import("../record.zig");
const Header = @import("../body/paragraph_header.zig").Header;
const Tag = @import("../body/reader.zig").Tag;
const cfb = @import("../../cfb/reader.zig");
pub const TextSplice = @import("plain_text.zig").Splice;
pub const CharacterFormat = @import("character_format.zig").Edit;
const max_bytes = 64 * 1024 * 1024;
const max_stream = 32 * 1024 * 1024;

pub const ParagraphInfo = struct { source_node: u32, parent_node: ?u32, style_id: u8 };
pub const Command = union(enum) {
    set_style: struct { section: usize, paragraph: usize, style_id: u8 },
    insert_text: struct { section: usize, paragraph: usize, utf8: []const u8 },
    delete_paragraph: struct { section: usize, paragraph: usize },
    splice_text: TextSplice,
    set_character_format: CharacterFormat,
};
pub const SaveOptions = struct {
    /// Byte-preservation experiments only; does not certify Hancom layout.
    allow_stale_layout: bool = false,
    max_output_bytes: usize = max_bytes,
};
pub const Saved = struct { bytes: []u8, layout_requires_reflow: bool };

// Allocated once; the public opaque pointer prevents direct model/sidecar writes.
const State = struct {
    allocator: std.mem.Allocator,
    source: Source,
    decoded: [][]u8,
    document: model.Document,
    style_offsets: [][]usize,
    style_count: usize,
    char_count: usize,

    fn deinit(self: *State) void {
        const a = self.allocator;
        for (self.style_offsets) |offsets| a.free(offsets);
        a.free(self.style_offsets);
        self.document.deinit(a);
        for (self.decoded) |bytes| a.free(bytes);
        a.free(self.decoded);
        self.source.deinit();
    }
};

pub const Session = opaque {
    pub fn open(a: std.mem.Allocator, input: []const u8) !*Session {
        var source = try Source.open(a, input);
        errdefer source.deinit();
        // Reader repairs are useful for preview, but not an implicit save policy.
        if (!std.mem.eql(u8, input, source.file.bytes)) return error.RepairedSourceUnsupported;
        const info = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), max_stream);
        defer a.free(info);
        const resources = try @import("../docinfo/resources.zig").inspect(info, source.header.version(), .{});
        try resources.validateKnownCounts();
        const style_count = resources.count(.style);

        const decoded = try a.alloc([]u8, source.section_count);
        errdefer a.free(decoded);
        var decoded_count: usize = 0;
        errdefer for (decoded[0..decoded_count]) |bytes| a.free(bytes);
        var remaining: usize = max_bytes;
        for (decoded, 0..) |*bytes, index| {
            bytes.* = try source.decodeSection(a, index);
            decoded_count += 1;
            if (bytes.len > remaining) return error.LimitExceeded;
            remaining -= bytes.len;
        }
        var document = try projection.fromDecodedSections(a, source.header.version(), decoded);
        errdefer document.deinit(a);
        const offsets = try a.alloc([]usize, decoded.len);
        errdefer a.free(offsets);
        var offset_count: usize = 0;
        errdefer for (offsets[0..offset_count]) |values| a.free(values);
        for (decoded, document.sections, offsets) |bytes, section, *values| {
            values.* = try a.alloc(usize, section.paragraphs.len);
            offset_count += 1;
            var it = framing.Iterator.init(bytes, .{});
            var node: usize = 0;
            var paragraph_index: usize = 0;
            while (try it.next()) |record| : (node += 1) {
                if (record.tag != @intFromEnum(Tag.paragraph_header)) continue;
                if (paragraph_index >= section.paragraphs.len) return error.SourceBindingMismatch;
                const p = section.paragraphs[paragraph_index];
                if (p.source_node != node) return error.SourceBindingMismatch;
                if (p.style_id >= style_count) return error.InvalidStyleReference;
                const parsed = try Header.parse(record.payload, source.header.version());
                if (parsed.style_id != p.style_id) return error.SourceBindingMismatch;
                values.*[paragraph_index] = record.offset + (record.raw.len - record.payload.len) + Header.style_id_offset;
                paragraph_index += 1;
            }
            if (paragraph_index != section.paragraphs.len) return error.SourceBindingMismatch;
        }
        const owned = try a.create(State);
        owned.* = .{ .allocator = a, .source = source, .decoded = decoded, .document = document, .style_offsets = offsets, .style_count = style_count, .char_count = resources.count(.char_shape) };
        return @ptrCast(owned);
    }

    pub fn close(self: *Session) void {
        const state = self.getState();
        const a = state.allocator;
        state.deinit();
        a.destroy(state);
    }

    pub fn sectionCount(self: *const Session) usize {
        return self.stateConst().document.sections.len;
    }

    pub fn paragraphCount(self: *const Session, section: usize) !usize {
        const state = self.stateConst();
        if (section >= state.document.sections.len) return error.InvalidSection;
        return state.document.sections[section].paragraphs.len;
    }

    pub fn paragraph(self: *const Session, section: usize, index: usize) !ParagraphInfo {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        const p = self.stateConst().document.sections[section].paragraphs[index];
        return .{ .source_node = p.source_node, .parent_node = p.parent_node, .style_id = p.style_id };
    }

    /// Owned UTF-16LE token bytes, including the original paragraph terminator.
    pub fn copyText(self: *const Session, a: std.mem.Allocator, section: usize, index: usize) ![]u8 {
        if (index >= try self.paragraphCount(section)) return error.InvalidParagraph;
        return @import("plain_text.zig").textBytes(a, self.stateConst().document.sections[section].paragraphs[index]);
    }

    pub fn apply(self: *Session, command: Command) !void {
        switch (command) {
            .set_style => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                if (edit.style_id >= state.style_count) return error.InvalidStyleReference;
                state.document.sections[edit.section].paragraphs[edit.paragraph].style_id = edit.style_id;
            },
            .splice_text => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                // Other sections can also contain opaque references into the target.
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("plain_text_source.zig").validateSection(bytes);
                }
                try @import("plain_text.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section].paragraphs[edit.paragraph], edit, state.char_count);
            },
            .set_character_format => |edit| {
                if (edit.paragraph >= try self.paragraphCount(edit.section)) return error.InvalidParagraph;
                const state = self.getState();
                for (state.decoded, 0..) |bytes, index| {
                    if (index != edit.section) try @import("plain_text_source.zig").validateSection(bytes);
                }
                try @import("character_format.zig").apply(state.allocator, state.decoded[edit.section], state.source.header.version(), &state.document.sections[edit.section].paragraphs[edit.paragraph], edit, state.char_count);
            },
            // No promise to relocate unknown cross-references after structure edits.
            .insert_text, .delete_paragraph => return error.UnsupportedStructuralEdit,
        }
    }

    pub fn save(self: *const Session, a: std.mem.Allocator, options: SaveOptions) !Saved {
        const state = self.stateConst();
        var changed = false;
        for (state.document.sections, 0..) |section, index| {
            changed = changed or sectionChanged(state, index, section);
        }
        if (!changed) {
            if (state.source.file.bytes.len > options.max_output_bytes) return error.LimitExceeded;
            return .{ .bytes = try a.dupe(u8, state.source.file.bytes), .layout_requires_reflow = false };
        }
        if (!options.allow_stale_layout) return error.LayoutReflowRequired;
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const scratch = arena.allocator();
        var replacements: std.ArrayList(cfb.stream_replace.Replacement) = .empty;
        for (state.document.sections, 0..) |section, index| {
            if (!sectionChanged(state, index, section)) continue;
            const decoded = try @import("text_section_writer.zig").write(scratch, state.decoded[index], section, max_stream);
            const encoded = if (state.source.header.has(.compressed))
                try @import("../../compression/raw_deflate.zig").encodeStored(scratch, decoded, max_stream)
            else
                decoded;
            try replacements.append(scratch, .{ .path = try std.fmt.allocPrint(scratch, "/BodyText/Section{d}", .{index}), .content = encoded });
        }
        return .{
            .bytes = try cfb.stream_replace.rebuildManyExact(a, &state.source.file, replacements.items, .{ .max_output_bytes = options.max_output_bytes }),
            .layout_requires_reflow = true,
        };
    }

    fn getState(self: *Session) *State {
        return @ptrCast(@alignCast(self));
    }
    fn stateConst(self: *const Session) *const State {
        return @ptrCast(@alignCast(self));
    }
};

fn sectionChanged(state: *const State, index: usize, section: model.Section) bool {
    for (section.paragraphs, state.style_offsets[index]) |p, offset| {
        if (p.style_id != state.decoded[index][offset] or p.range_tags != null) return true;
    }
    return false;
}
