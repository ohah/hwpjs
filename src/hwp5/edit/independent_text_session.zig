//! One ordinary-policy request, prepared on selected owned paragraph drafts.
//! Caller keeps the live model/source immutable until the infallible swap phase.
//! Existing Session/History own history, rollback, resource and source lifetimes.
const std = @import("std");
const model = @import("../../model/document.zig");
const independent = @import("../../model/independent_text_edits.zig");
const limits = @import("../../model/text_transaction.zig").limits;
const Context = @import("plain_text_source.zig").OrdinaryContext;
const Owner = @import("../../model/formatting_patch.zig").Owner;
pub const Group = struct { section: usize, paragraph: usize, edits: []const independent.Edit };
const Draft = struct { paragraph: model.Paragraph, changed: bool };

pub fn apply(a: std.mem.Allocator, source: []const []u8, version: @import("../version.zig").Version, document: *model.Document, tables: []const @import("created_table_values.zig").Values, groups: []const Group, char_count: usize) !bool {
    if (source.len != document.sections.len or tables.len != source.len) return error.SourceBindingMismatch;
    if (groups.len > limits.groups) return error.LimitExceeded;
    if (groups.len == 0) return false;
    var seen: std.AutoHashMapUnmanaged(Owner, void) = .empty;
    defer seen.deinit(a);
    try seen.ensureTotalCapacity(a, @intCast(groups.len));
    const selected = try a.alloc(bool, source.len);
    defer a.free(selected);
    @memset(selected, false);
    var selected_count: usize = 0;
    var edit_count: usize = 0;
    var inserted_bytes: usize = 0;
    var before_units: u64 = 0;
    var after_units: u64 = 0;
    for (groups) |group| {
        if (group.section >= document.sections.len) return error.InvalidSection;
        if (group.paragraph >= document.sections[group.section].paragraphs.len) return error.InvalidParagraph;
        if (tables[group.section].entries.len != 0) return error.UnsupportedIndependentCreatedTableHost;
        const found = seen.getOrPutAssumeCapacity(.{ .section = group.section, .paragraph = group.paragraph });
        if (found.found_existing) return error.DuplicateTextTransactionTarget;
        if (!selected[group.section]) {
            selected[group.section] = true;
            selected_count += 1;
        }
        if (group.edits.len > limits.edits_count - edit_count) return error.LimitExceeded;
        edit_count += group.edits.len;
        for (group.edits) |edit| if (edit.expected == null) return error.MissingExpectedText;
        const current = document.sections[group.section].paragraphs[group.paragraph];
        var raw_bytes: usize = 0;
        for (current.tokens) |token| raw_bytes = std.math.add(usize, raw_bytes, token.raw.len) catch return error.LimitExceeded;
        const units: u32 = if (current.tokens.len == 0 and current.declared_units <= 1) 0 else count: {
            if (raw_bytes < 2 or raw_bytes % 2 != 0) return error.UnsupportedParagraphTerminator;
            break :count std.math.cast(u32, raw_bytes / 2 - 1) orelse return error.LimitExceeded;
        };
        const totals = try independent.validate(group.edits, units, .{ .max_edits = limits.edits_count, .max_inserted_bytes = limits.inserted_bytes - inserted_bytes, .max_output_units = limits.text_units });
        inserted_bytes += totals.inserted_bytes;
        before_units += units;
        after_units += totals.output_units;
        if (before_units > limits.text_units or after_units > limits.text_units) return error.LimitExceeded;
    }
    // Match ordinary single-command cross-section permission, once per source.
    // With multiple selected sections, each is unselected for another command.
    for (source, selected) |bytes, is_selected| if (!is_selected or selected_count > 1)
        try @import("text_source_policy.zig").validateUnselectedSection(a, bytes, version);
    const contexts = try a.alloc(?*Context, source.len);
    defer a.free(contexts);
    @memset(contexts, null);
    defer for (contexts) |context| if (context) |value| value.destroy();
    const drafts = try a.alloc(Draft, groups.len);
    defer a.free(drafts);
    var initialized: usize = 0;
    defer for (drafts[0..initialized]) |*draft| draft.paragraph.deinit(a);
    var changed = false;
    for (groups, drafts) |group, *draft| {
        if (contexts[group.section] == null) contexts[group.section] = try Context.create(a, source[group.section], version, char_count);
        draft.paragraph = try @import("../../model/clone.zig").paragraph(a, document.sections[group.section].paragraphs[group.paragraph]);
        draft.changed = false;
        initialized += 1;
        draft.changed = try @import("plain_text.zig").applyIndependentScoped(a, contexts[group.section].?, source[group.section], version, &draft.paragraph, group.edits, char_count, .{});
        changed = changed or draft.changed;
    }
    // Every check/allocation has completed. Each old target is now owned by its
    // draft and released by the same defer; there is no fallible publication.
    for (groups, drafts) |group, *draft| if (draft.changed)
        std.mem.swap(model.Paragraph, &document.sections[group.section].paragraphs[group.paragraph], &draft.paragraph);
    return changed;
}
