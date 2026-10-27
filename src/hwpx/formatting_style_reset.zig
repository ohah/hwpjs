//! 실제 문단 style의 원본 참조를 확인합니다. ID0/default font를 추정하지 않습니다.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const head = @import("document_xml.zig").head_uri;
pub fn read(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, owner: m.Owner) !m.ResetResources {
    const identity = try styleIdentity(a, session, owner);
    var context = try @import("formatting_preflight.zig").Context.init(a, session);
    defer context.deinit();
    return readIdentity(a, &context, identity);
}
/// source 소유자 검증은 그대로 수행하고, 현재 요청의 parsed header만 빌린다.
pub fn readWithContext(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, owner: m.Owner, context: *@import("formatting_preflight.zig").Context) !m.ResetResources {
    return readIdentity(a, context, try styleIdentity(a, session, owner));
}
fn readIdentity(a: std.mem.Allocator, context: *@import("formatting_preflight.zig").Context, identity: u32) !m.ResetResources {
    var found: ?usize = null;
    for (context.tree.elements, 0..) |element, index| {
        if (!element.is(head, "style")) continue;
        const parent = element.parent orelse continue;
        if (!context.tree.elements[parent].is(head, "styles")) continue;
        const id = (try context.tree.attributeValue(a, index, "", "id")) orelse return error.MissingResetStyle;
        if (try @import("table_xml_fields.zig").unsigned(a, id, 4096) != identity) continue;
        if (found != null) return error.DuplicateResetStyle;
        found = index;
    }
    const node = found orelse return error.MissingResetStyle;
    const kind = (try context.tree.attributeValue(a, node, "", "type")) orelse return error.MissingResetStyle;
    const token = try kind.toUtf8(a, 4096);
    defer a.free(token);
    if (!std.mem.eql(u8, token, "PARA")) return error.UnsupportedResetStyle;
    var result: m.ResetResources = .{ .style_id = identity };
    if (try context.tree.attributeValue(a, node, "", "charPrIDRef")) |ref| {
        const id = try @import("table_xml_fields.zig").unsigned(a, ref, 4096);
        _ = try @import("formatting_preflight.zig").node(a, &context.tree, "charPr", id);
        result.character = id;
    }
    if (try context.tree.attributeValue(a, node, "", "paraPrIDRef")) |ref| {
        const id = try @import("table_xml_fields.zig").unsigned(a, ref, 4096);
        _ = try @import("formatting_preflight.zig").node(a, &context.tree, "paraPr", id);
        result.paragraph = id;
    }
    return result;
}

fn styleIdentity(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, owner: m.Owner) !u32 {
    if (owner.section >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[owner.section];
    if (owner.paragraph < section.first_paragraph or owner.paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    const paragraph = view.paragraphs[owner.paragraph - section.first_paragraph];
    if (paragraph.source_ordinal == null) return error.UnsupportedFormattingOwner;
    const raw = (try section.tree.attributeValue(a, paragraph.template_element, "", "styleIDRef")) orelse return error.MissingResetStyle;
    return @import("table_xml_fields.zig").unsigned(a, raw, 4096);
}
