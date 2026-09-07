const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const encoding: ?core.xml.input.Encoding = switch (try r.readInt(u8)) {
        0 => null,
        1 => .utf8,
        2 => .utf16le,
        3 => .utf16be,
        else => return error.InvalidXmlEncoding,
    };
    var options: core.xml.document.Options = .{};
    options.prolog.external_encoding = encoding;
    options.prolog.input.max_characters = limit;
    options.prolog.input.max_bytes = try r.readInt(u32);
    options.max_markup_bytes = try r.readInt(u32);
    options.max_text_bytes = try r.readInt(u32);
    options.max_elements = try r.readInt(u32);
    options.max_depth = try r.readInt(u32);
    options.max_events = try r.readInt(u32);
    options.max_attributes = try r.readInt(u32);
    options.max_references = try r.readInt(u32);
    options.tags.max_bytes = try r.readInt(u32);
    options.tags.max_name_bytes = try r.readInt(u32);
    options.prolog.max_declaration_bytes = try r.readInt(u32);
    const report = try core.xml.document.inspect(a, bytes[r.offset..], options);
    const fields = [_]usize{ report.bytes, report.characters, report.events, report.elements, report.end_tags, report.attributes, report.references, report.text_scalars, report.comments, report.cdata, report.processing_instructions, report.max_depth, @intFromBool(report.namespaces_validated) };
    const out = try a.alloc(u8, fields.len * 4);
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    return out;
}
