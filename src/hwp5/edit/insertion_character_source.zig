//! Read-only proof for an empty insertion position in the current paragraph.
//! No synthetic text/run and no fallback resource ID.
const model = @import("../../model/document.zig");
pub fn knownEmpty(p: model.Paragraph, bytes: []const u8) bool {
    if (p.tokens.len == 0) return bytes.len == 0 and p.declared_units <= 1;
    return p.text_present and p.declared_units == 1 and p.tokens.len == 1 and
        p.tokens[0].kind == .control and p.tokens[0].encoding == .utf16le and
        p.tokens[0].start_unit == 0 and bytes.len == 2 and bytes[0] == 13 and bytes[1] == 0;
}
