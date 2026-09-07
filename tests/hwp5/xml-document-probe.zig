const std = @import("std");
const core = @import("hwpjs");
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, validate_namespaces: bool) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const encoding: ?core.xml.input.Encoding = switch (try r.readInt(u8)) {
        0 => null,
        1 => .utf8,
        2 => .utf16le,
        3 => .utf16be,
        else => return error.InvalidXmlEncoding,
    };
    var options: core.xml.document.Options = .{};
    options.validate_namespaces = validate_namespaces;
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
    if (validate_namespaces) {
        options.namespaces.max_bindings = try r.readInt(u32);
        options.namespaces.max_uri_bytes = try r.readInt(u32);
    }
    const report = try core.xml.document.inspect(a, bytes[r.offset..], options);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try @import("xml-report-probe.zig").append(a, &out, report);
    return out.toOwnedSlice(a);
}
