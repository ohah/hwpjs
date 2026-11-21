//! Own deterministic test producer: normal blank factory plus typed known records/XML.
//! This is not a user-facing restart insertion operation or an opaque file template.
const std = @import("std");
pub fn h5(a: std.mem.Allocator, sections: u16) ![]u8 {
    if (sections != 1 and sections != 2) return error.InvalidSectionCount;
    const blank = try @import("new_document/hwp5.zig").create(a);
    defer a.free(blank);
    var source = try @import("hwp5/text_source.zig").Source.open(a, blank);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const count = try @import("hwp5/docinfo/section_count.zig").locate(info, source.header.version());
    std.mem.writeInt(u16, info[count.payload_offset..][0..2], sections, .little);
    const body = try source.decodeSection(a, 0);
    defer a.free(body);
    const restart = try @import("hwp5/edit/page_restart_edit_fixture.zig").make(a, 7, 0, &.{});
    defer a.free(restart);
    const joined = try std.mem.concat(a, u8, &.{ body, restart });
    defer a.free(joined);
    const header = try source.file.readStream(a, "/FileHeader");
    return @import("hwp5/test_section_count_fixture.zig").build(a, header, info, joined, if (sections == 1) &.{"Section0"} else &.{ "Section0", "Section1" });
}
pub fn h5Control(a: std.mem.Allocator, session: *const @import("hwp5/edit/style_preservation.zig").Session, section: usize) !usize {
    const rows = try session.pageControlSources(a, section);
    defer a.free(rows);
    var found: ?usize = null;
    for (rows) |row| if (row.kind == .restart) {
        if (found != null) return error.AmbiguousPageRestart;
        found = row.control_node;
    };
    return found orelse error.MissingPageRestart;
}
pub fn hx(a: std.mem.Allocator) ![]u8 {
    const blank = try @import("new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var session = try @import("hwpx/editor_session.zig").open(a, blank, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    const root = tree.elements[0].end_tag orelse return error.InvalidPartKind;
    const paragraph = "<hp:p id='1' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:t>앞😀</hp:t><hp:ctrl><hp:newNum numType='PAGE' num='7'/></hp:ctrl><hp:t>뒤</hp:t></hp:run></hp:p>";
    const xml = try @import("hwpx/xml_source_writer.zig").write(a, tree.source, &.{.{ .start = root.start, .end = root.start, .text = "", .serialized_xml = paragraph }}, 4_000_000);
    defer a.free(xml);
    return @import("zip/replace_writer.zig").write(a, blank, &.{.{ .entry_index = session.sections[0].entry_index, .bytes = xml }}, .{});
}
pub fn hxControl(session: *const @import("hwpx/editor_session.zig").Session) !usize {
    for (session.sections[0].tree.elements, 0..) |element, index| if (element.is(@import("hwpx/document_xml.zig").paragraph_uri, "newNum")) return index;
    return error.MissingPageRestart;
}
