//! Explicit native generation inputs, not XML-id owner authority or defaults.
pub const Resources = struct { paragraph: u32, character: u32, style: u32 };
pub const Format = struct {
    number_type: []const u8,
    user_char: []const u8,
    prefix_char: []const u8,
    suffix_char: []const u8,
    superscript: bool,
};
pub const Input = struct {
    kind: @import("note_bodies.zig").Kind,
    paragraph_id: u32,
    resources: Resources,
    number: i32,
    format: Format,
    body: []const u8,
};
pub const Limits = struct { max_text_bytes: usize = 1024 * 1024, max_xml_bytes: usize = 4 * 1024 * 1024, max_format_bytes: usize = 4096 };
pub fn validate(input: Input, header_resources: *const @import("header_resources.zig").Report, limits: Limits) !void {
    if (input.number <= 0) return error.InvalidNoteCreateNumber;
    if (input.body.len > limits.max_text_bytes) return error.LimitExceeded;
    if (!@import("numbering_values.zig").numberTypeKnown(input.format.number_type)) return error.InvalidNoteCreateNumberFormat;
    for ([_][]const u8{ input.format.number_type, input.format.user_char, input.format.prefix_char, input.format.suffix_char }) |value| {
        if (value.len > limits.max_format_bytes) return error.LimitExceeded;
    }
    if (!header_resources.table(.para_shape).hasId(input.resources.paragraph)) return error.InvalidParagraphShapeReference;
    if (!header_resources.table(.char_shape).hasId(input.resources.character)) return error.InvalidCharacterShapeReference;
    if (!header_resources.table(.style).hasId(input.resources.style)) return error.InvalidStyleReference;
    // Header inventory is an already validated Native read, never a resource-id
    // range or array index. Session/serial/paragraph-id allocation comes later.
}
