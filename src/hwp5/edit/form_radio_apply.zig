//! Plan from current values, prepare every changed section, then commit together.
const std = @import("std");
const model = @import("../../model/document.zig");
const plan = @import("form_radio_plan.zig");
const values = @import("../../model/form_values.zig");
const semantics = @import("../body/form_semantics.zig");
pub const Edit = struct { section: usize, form_node: u32 };
const Binding = struct { original: []const u8, original_state: u8 };
fn state(bytes: []const u8) u8 {
    return switch (semantics.choiceObserved(bytes, .off)) {
        .unchecked => 0,
        .checked => 1,
        else => 255,
    };
}
const Context = struct {
    sources: []const []const u8,
    version: @import("../version.zig").Version,
    bindings: []const Binding,
    by_identity: std.AutoHashMapUnmanaged(plan.Identity, usize),
    changes: []const plan.Change,
    limit: usize,
    fn prepare(a: std.mem.Allocator, drafts: []@import("../../model/transaction.zig").SectionDraft, self: @This()) !void {
        for (drafts) |*draft| {
            for (self.changes) |change| {
                if (change.identity.section != draft.index) continue;
                const binding = self.bindings[self.by_identity.get(change.identity) orelse return error.SourceBindingMismatch];
                const canonical = [_]u8{ '0' + change.state, 0 };
                const next: []const u8 = if (change.state == binding.original_state) binding.original else &canonical;
                try values.upsertField(a, &draft.section.form_values, change.identity.node, .value, next, binding.original, self.limit);
            }
            const current = try @import("form_current_section.zig").writeAll(a, self.sources[draft.index], self.version, draft.section.form_values orelse &.{}, self.limit);
            defer a.free(current);
        }
    }
};
pub fn apply(a: std.mem.Allocator, sources: []const []const u8, version: @import("../version.zig").Version, sections: []model.Section, edit: Edit, limit: usize) !void {
    if (edit.section >= sections.len) return error.InvalidSection;
    if (sources.len != sections.len) return error.SourceBindingMismatch;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var bindings: std.ArrayList(Binding) = .empty;
    var members: std.ArrayList(plan.Member) = .empty;
    var by_identity: std.AutoHashMapUnmanaged(plan.Identity, usize) = .empty;
    // Scratch Trees/links/maps borrow immutable sources and die with this arena.
    for (sources, sections, 0..) |source, section, section_index| {
        if (source.len > limit) return error.LimitExceeded;
        try @import("source_policy.zig").validateFieldTransaction(scratch, source, version);
        const tree = try @import("source_tree.zig").parse(scratch, source, version, .{});
        const forms = try @import("../body/form_links.zig").collectObservedUnits(scratch, tree, .{});
        const owners = try @import("current_paragraph_sources.zig").build(scratch, section.paragraphs);
        for (forms.forms.forms, 0..) |form, index| {
            if (form.envelope.kind() != .radio_button) continue;
            if (members.items.len >= 100_000) return error.LimitExceeded;
            const report = try @import("../body/form_schema.zig").inspectObserved(form.properties, .radio_button);
            const group = report.get(form.properties, .radio_group_name) orelse return error.MissingRadioGroupName;
            const original = report.get(form.properties, .value) orelse return error.MissingFormProperty;
            const paragraph = owners.get(@intCast(forms.links[index].paragraph_node)) orelse return error.MissingCurrentFormOwner;
            _ = try @import("current_control_anchor.zig").position(forms.links, index, section.paragraphs[paragraph]);
            const current = values.find(section.form_values orelse &.{}, @intCast(form.object_node));
            if (current) |value| if (value.field != .value) return error.SourceBindingMismatch;
            const member: plan.Member = .{
                .identity = .{ .section = @intCast(section_index), .node = @intCast(form.object_node) },
                // Native selection contract: named groups span the document.
                .scope = 0,
                .group = group.value,
                .state = state(if (current) |value| value.text else original.value),
                .enabled = semantics.flagObserved(form.properties, report, .enabled) == .on,
                .editable = semantics.flagObserved(form.properties, report, .editable) == .on,
            };
            const entry = try by_identity.getOrPut(scratch, member.identity);
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = bindings.items.len;
            try bindings.append(scratch, .{ .original = original.value, .original_state = state(original.value) });
            try members.append(scratch, member);
        }
    }
    const changes = try plan.select(scratch, members.items, .{ .section = @intCast(edit.section), .node = edit.form_node }, 100_000);
    if (changes.len == 0) return;
    const touched = try scratch.alloc(bool, sections.len);
    @memset(touched, false);
    for (changes) |change| touched[change.identity.section] = true;
    var indices: std.ArrayList(usize) = .empty;
    for (touched, 0..) |yes, index| if (yes) {
        try indices.append(scratch, index);
    };
    try @import("../../model/transaction.zig").applyMany(a, sections, indices.items, Context{ .sources = sources, .version = version, .bindings = bindings.items, .by_identity = by_identity, .changes = changes, .limit = limit }, Context.prepare);
}
