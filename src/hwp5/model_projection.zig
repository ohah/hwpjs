//! HWP5 decoded Section records -> owned, deliberately partial document model.
//! Record framing, paragraph ownership, token syntax and run parsing stay in
//! their existing modules; this adapter only copies selected values.
const std = @import("std");
const model = @import("../model/document.zig");
const Tree = @import("body/tree.zig").Tree;
const children = @import("body/paragraph_children.zig");
const Runs = @import("body/char_runs.zig").Runs;
const Version = @import("version.zig").Version;
const Source = @import("text_source.zig").Source;
const max_sections = 1024;
const max_decoded_bytes = 64 * 1024 * 1024;
const max_records = 1_000_000;

/// Complete file boundary, but only a partial read-only semantic projection.
pub fn fromFile(a: std.mem.Allocator, input: []const u8) !model.Document {
    var source = try Source.open(a, input);
    defer source.deinit();
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var sections: std.ArrayList([]const u8) = .empty;
    var total: usize = 0;
    for (0..source.section_count) |index| {
        const decoded = try source.decodeSection(scratch, index);
        total = std.math.add(usize, total, decoded.len) catch return error.LimitExceeded;
        if (total > max_decoded_bytes) return error.LimitExceeded;
        try sections.append(scratch, decoded);
    }
    return fromDecodedSections(a, source.header.version(), sections.items);
}

pub fn fromDecodedSections(a: std.mem.Allocator, version: Version, sections: []const []const u8) !model.Document {
    try version.requireSupported();
    if (sections.len == 0) return error.InvalidSectionCount;
    if (sections.len > max_sections) return error.LimitExceeded;
    var result: std.ArrayList(model.Section) = .empty;
    errdefer {
        for (result.items) |*section| section.deinit(a);
        result.deinit(a);
    }
    var total_bytes: usize = 0;
    var remaining_records: usize = max_records;
    for (sections) |bytes| {
        total_bytes = std.math.add(usize, total_bytes, bytes.len) catch return error.LimitExceeded;
        if (total_bytes > max_decoded_bytes or remaining_records == 0) return error.LimitExceeded;
        var section = try projectSection(a, version, bytes, remaining_records);
        errdefer section.deinit(a);
        remaining_records -= section.source_record_count;
        try result.append(a, section);
    }
    return .{ .format = .hwp5, .sections = try result.toOwnedSlice(a) };
}

fn projectSection(a: std.mem.Allocator, version: Version, bytes: []const u8, record_limit: usize) !model.Section {
    var tree = try Tree.parseTextPreview(a, bytes, version, .{ .max_records = record_limit });
    defer tree.deinit(a);
    var paragraphs: std.ArrayList(model.Paragraph) = .empty;
    errdefer {
        for (paragraphs.items) |*paragraph| paragraph.deinit(a);
        paragraphs.deinit(a);
    }
    for (tree.nodes, 0..) |node, node_index| {
        if (node.record.value != .header) continue;
        var paragraph = try projectParagraph(a, tree, node_index);
        errdefer paragraph.deinit(a);
        try paragraphs.append(a, paragraph);
    }
    return .{ .paragraphs = try paragraphs.toOwnedSlice(a), .source_record_count = tree.nodes.len };
}

fn projectParagraph(a: std.mem.Allocator, tree: Tree, node_index: usize) !model.Paragraph {
    const node = tree.nodes[node_index];
    const header = node.record.value.header;
    const parts = try children.collect(tree, node_index);
    var tokens: std.ArrayList(model.Token) = .empty;
    errdefer {
        for (tokens.items) |token| a.free(token.raw);
        tokens.deinit(a);
    }
    if (parts.text_node) |text_node| {
        const value = tree.nodes[text_node].record.value.text;
        try value.validateCount(header);
        var it = value.tokens();
        while (try it.next()) |token| {
            const raw = try a.dupe(u8, token.raw);
            errdefer a.free(raw);
            try tokens.append(a, .{
                .start_unit = std.math.cast(u32, token.start_unit) orelse return error.LimitExceeded,
                .kind = if (token.value == .control) .control else .text,
                .encoding = .utf16le,
                .raw = raw,
            });
        }
    }
    const owned_tokens = try tokens.toOwnedSlice(a);
    errdefer {
        for (owned_tokens) |token| a.free(token.raw);
        a.free(owned_tokens);
    }

    var run_records: ?Runs = null;
    var deferred: usize = 0;
    var child = node_index + 1;
    while (child < node.subtree_end) {
        const entry = tree.nodes[child];
        if (entry.record.framing.tag == 68) {
            if (run_records != null) return error.DuplicateParagraphRecord;
            run_records = try Runs.parse(entry.record.framing.payload);
        } else if (parts.text_node == null or child != parts.text_node.?) {
            deferred += 1;
        }
        child = entry.subtree_end;
    }
    const run_count = if (run_records) |runs| runs.count() else 0;
    if (run_count != header.char_shape_count) return error.ParagraphMetadataCountMismatch;
    const owned_runs = try a.alloc(model.CharacterRun, run_count);
    errdefer a.free(owned_runs);
    var previous: u32 = 0;
    if (run_records) |runs| for (owned_runs, 0..) |*slot, index| {
        const run = runs.get(index).?;
        if ((index == 0 and run.start != 0) or run.start < previous or run.start > header.characterUnits()) return error.InvalidCharRunPosition;
        slot.* = .{ .start_unit = run.start, .char_shape_id = run.char_shape_id };
        previous = run.start;
    };
    return .{
        .source_node = std.math.cast(u32, node_index) orelse return error.LimitExceeded,
        .parent_node = if (node.parent) |parent| std.math.cast(u32, parent) orelse return error.LimitExceeded else null,
        .declared_units = header.characterUnits(),
        .text_present = parts.text_node != null,
        .para_shape_id = header.para_shape_id,
        .style_id = header.style_id,
        .tokens = owned_tokens,
        .character_runs = owned_runs,
        .deferred_direct_records = deferred,
    };
}
