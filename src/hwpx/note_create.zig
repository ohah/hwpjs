//! Detached package creation; only History publishes the prepared candidate.
//! Every serialization stage reopens its actual physical paragraph ownership.
const std = @import("std");
const editor = @import("editor_session.zig");
const inline_insert = @import("inline_object_insert.zig");
const profile = @import("note_create_profile.zig");
pub const Request = struct {
    lease: @import("note_create_owner.zig").Lease,
    target: inline_insert.Target,
    kind: @import("note_bodies.zig").Kind,
    resources: profile.Resources,
    format: profile.Format,
    body: []const u8,
    initial_policies: []const @import("note_create_policy.zig").Initial = &.{},
    /// Caller-owned provenance output. History writes it only after commit.
    receipt_out: ?*@import("note_create_caret.zig").Receipt = null,
};
pub const Prepared = struct {
    bytes: []u8,
    receipt: @import("note_create_caret.zig").Receipt,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};
fn paragraph(session: *const editor.Session, target: inline_insert.Target) !usize {
    if (target.section >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[target.section];
    var view = try @import("display_current_paragraphs.zig").read(session.allocator, section, session.options);
    defer view.deinit(session.allocator);
    if (target.paragraph < section.first_paragraph or target.paragraph - section.first_paragraph >= view.paragraphs.len) return error.InvalidParagraphIndex;
    const p = view.paragraphs[target.paragraph - section.first_paragraph];
    if (p.generated_id != null or p.source_ordinal == null or p.pieces != null) return error.SourceBindingMismatch;
    try @import("inline_object_owner.zig").validate(session.allocator, &section.tree, p.template_element);
    const text = try session.anchorText(target.section, target.paragraph);
    defer session.allocator.free(text);
    if (!std.mem.eql(u8, text, target.expected_text)) return error.InlineObjectTextMismatch;
    return p.template_element;
}
const GuardContext = struct {
    protection: *@import("note_source_protection.zig").Context,
    section: usize,
    fn check(raw: *anyopaque, node: usize, start: usize, end: usize) anyerror!void {
        const self: *@This() = @ptrCast(@alignCast(raw));
        try self.protection.insertion(self.section, node, start, end);
    }
};
/// `target` is the internal resolver's saved physical target, not public wire.
/// No live session, pending-cell value or History stack is changed here.
pub fn prepare(a: std.mem.Allocator, before: []const u8, target: inline_insert.Target, request: Request, options: editor.Options) !Prepared {
    if (target.owner != null or target.physical_paragraph == null or target.section != request.target.section or before.len > options.max_input_bytes) return error.InvalidNoteCreateOwner;
    var saved = try editor.open(a, before, options);
    defer saved.deinit();
    if (try paragraph(&saved, target) != target.physical_paragraph.?) return error.SourceBindingMismatch;
    var original_doc = try @import("package.zig").inspectDocument(a, before, .{});
    defer original_doc.deinit(a);
    try @import("file_transform_security.zig").validate(a, &original_doc, options.max_xml_bytes);
    const policy_bytes = try @import("note_create_policy.zig").install(a, &saved, before, request.kind, request.initial_policies);
    defer a.free(policy_bytes);
    var policy_session = try editor.open(a, policy_bytes, options);
    defer policy_session.deinit();
    // Policy initialization adds no paragraphs. Bind again; never reuse a node
    // number across a source rewrite even when the current ordinal is stable.
    _ = try paragraph(&policy_session, target);
    var plan = try @import("note_create_numbering.zig").prepare(a, &policy_session, target, request.kind);
    defer plan.deinit(a);
    const numbered = try @import("note_number_update_write.zig").package(a, &policy_session, policy_bytes, null, &.{}, plan.updates);
    defer a.free(numbered);
    var current = try editor.open(a, numbered, options);
    defer current.deinit();
    const node = try paragraph(&current, target);
    const tree = &current.sections[target.section].tree;
    try @import("source_grid_line_cache.zig").validate(a, tree, node);
    const exterior = try @import("field_source_outside_positions.zig").prepareAction(&current, target.section, target.paragraph, target.unit, target.unit, .splice);
    if (exterior) |positions| a.free(positions);
    var protection = try @import("note_source_protection.zig").Context.init(&current);
    defer protection.deinit();
    try protection.createResources(request.resources);
    var doc = try @import("package.zig").inspectDocument(a, numbered, .{});
    defer doc.deinit(a);
    var resources = try doc.inspectHeaderResources(a, .{ .resources = .{ .max_xml_bytes = options.max_xml_bytes } });
    defer resources.deinit(a);
    // IDs are issued against every physical XML/HPF part, including orphans and
    // all now-serialized pending generated cells; XML note/subList ids stay empty.
    const ids = try inline_insert.nextPackageIds(a, &doc, 1, options.max_xml_bytes, options.max_output_bytes);
    defer a.free(ids);
    const fragment = try @import("note_create_xml.zig").create(a, .{ .kind = request.kind, .paragraph_id = ids[0], .resources = request.resources, .number = plan.number, .format = request.format, .body = request.body }, &resources, .{ .max_xml_bytes = options.max_xml_bytes });
    defer a.free(fragment);
    var guard: GuardContext = .{ .protection = &protection, .section = target.section };
    const changed = try @import("inline_object_anchor_insert.zig").writeChecked(a, tree, node, target.unit, target.expected_text, fragment, options.max_xml_bytes, .{ .context = &guard, .check = GuardContext.check });
    defer a.free(changed);
    const bytes = try @import("../zip/replace_writer.zig").write(a, numbered, &.{.{ .entry_index = current.sections[target.section].entry_index, .bytes = changed }}, .{ .max_output_bytes = options.max_output_bytes });
    errdefer a.free(bytes);
    const receipt: @import("note_create_caret.zig").Receipt = .{ .section = target.section, .paragraph_id = ids[0], .number = plan.number, .kind = request.kind };
    var reopened = try editor.open(a, bytes, options);
    defer reopened.deinit();
    const caret = try @import("note_create_caret.zig").observe(&reopened, receipt, 0);
    const text = try @import("note_body_plain_text.zig").read(a, &reopened, target.section, caret.paragraph);
    defer a.free(text);
    if (!std.mem.eql(u8, text, request.body)) return error.InvalidNoteCreateResult;
    return .{ .bytes = bytes, .receipt = receipt };
}
