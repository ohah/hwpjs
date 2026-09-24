const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");

/// Names registered for CT direct children by the pinned Hancom model.
/// The 2011 XSD spelling `hyphen` is deliberately not folded into `hypen`.
pub const ModelKind = enum(u8) {
    markpen_begin,
    markpen_end,
    title_mark,
    tab,
    line_break,
    hypen,
    nb_space,
    fw_space,
    chval,
    insert_begin,
    insert_end,
    delete_begin,
    delete_end,
    unknownch,
};

const names = [_][]const u8{
    "markpenBegin", "markpenEnd",  "titleMark", "tab",         "lineBreak", "hypen",     "nbSpace", "fwSpace",
    "chval",        "insertBegin", "insertEnd", "deleteBegin", "deleteEnd", "unknownch",
};

comptime {
    if (names.len != @typeInfo(ModelKind).@"enum".fields.len) @compileError("text model name list and kind enum differ");
}

pub fn modelKind(tag: xml.tags.Tag, scope: *const xml.namespaces.State) !?ModelKind {
    const name = try scope.expandElement(tag.name);
    if (!std.mem.eql(u8, name.uri, document_xml.paragraph_uri)) return null;
    for (names, 0..) |candidate, i| {
        if (name.local.equals(candidate, false)) return @enumFromInt(i);
    }
    return null;
}
