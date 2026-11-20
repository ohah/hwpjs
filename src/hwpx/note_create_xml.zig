//! New note fragment from explicitly validated fields; no template bytes.
//! Observed official public-UI 2011 structure, not a normative XSD claim.
const std = @import("std");
pub const profile = @import("note_create_profile.zig");
pub fn create(a: std.mem.Allocator, input: profile.Input, resources: *const @import("header_resources.zig").Report, limits: profile.Limits) ![]u8 {
    try profile.validate(input, resources, limits);
    const body = try @import("../xml/text_writer.zig").encode(a, input.body, limits.max_xml_bytes);
    defer a.free(body);
    var encoded: [4][]u8 = undefined;
    var ready: usize = 0;
    defer for (encoded[0..ready]) |value| a.free(value);
    const raw = [_][]const u8{ input.format.number_type, input.format.user_char, input.format.prefix_char, input.format.suffix_char };
    for (raw, &encoded) |value, *output| {
        output.* = try @import("../xml/attribute_writer.zig").encode(a, value, limits.max_xml_bytes);
        ready += 1;
    }
    const tag = if (input.kind == .foot) "footNote" else "endNote";
    const number_type = if (input.kind == .foot) "FOOTNOTE" else "ENDNOTE";
    const xml = try std.fmt.allocPrint(a, "<hp:ctrl xmlns:hp=\"{s}\"><hp:{s} id=\"\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"TOP\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"{d}\" paraPrIDRef=\"{d}\" styleIDRef=\"{d}\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"{d}\"><hp:ctrl><hp:autoNum num=\"{d}\" numType=\"{s}\"><hp:autoNumFormat type=\"{s}\" userChar=\"{s}\" prefixChar=\"{s}\" suffixChar=\"{s}\" supscript=\"{d}\"/></hp:autoNum></hp:ctrl><hp:t>{s}</hp:t></hp:run></hp:p></hp:subList></hp:{s}></hp:ctrl>", .{ @import("document_xml.zig").paragraph_uri, tag, input.paragraph_id, input.resources.paragraph, input.resources.style, input.resources.character, input.number, number_type, encoded[0], encoded[1], encoded[2], encoded[3], @intFromBool(input.format.superscript), body, tag });
    errdefer a.free(xml);
    if (xml.len > limits.max_xml_bytes) return error.LimitExceeded;
    return xml;
}
