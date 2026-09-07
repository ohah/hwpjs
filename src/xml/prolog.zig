const input_module = @import("input.zig");
const encoding = @import("encoding.zig");
const decl = @import("declaration.zig");
pub const Options = struct {
    external_encoding: ?encoding.Encoding = null,
    input: input_module.Options = .{},
    max_declaration_bytes: usize = 4096,
};
pub const Prolog = struct { input: input_module.Input, declaration: ?decl.Declaration, bom_bytes: usize };
/// Encoding signature + optional document XMLDecl only; does not validate the
/// remaining XML grammar. The returned Input continues with the same global budget.
pub fn open(bytes: []const u8, options: Options) !Prolog {
    if (bytes.len > options.input.max_bytes) return error.LimitExceeded;
    const selected = try encoding.select(bytes, options.external_encoding);
    var input = try input_module.Input.init(bytes, selected.encoding, options.input);
    input.offset = selected.bom_bytes; // Signature is not a content character.
    const declaration = try decl.parse(&input, options.max_declaration_bytes);
    const name = if (declaration) |d| d.encoding else null;
    if (selected.declaration_required and name == null) return error.MissingXmlEncodingDeclaration;
    if (name) |value| {
        if (value.equals("UTF-16", true)) {
            if (selected.encoding == .utf8) return error.XmlEncodingMismatch;
            if (selected.bom_bytes == 0) return error.MissingXmlByteOrderMark;
        } else {
            const declared: encoding.Encoding = if (value.equals("UTF-8", true)) .utf8 else if (value.equals("UTF-16LE", true)) .utf16le else if (value.equals("UTF-16BE", true)) .utf16be else return error.UnsupportedXmlEncoding;
            if (declared != selected.encoding) return error.XmlEncodingMismatch;
        }
    }
    return .{ .input = input, .declaration = declaration, .bom_bytes = selected.bom_bytes };
}
