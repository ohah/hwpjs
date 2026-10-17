//! Single source for supported chart data container names.
const xml = @import("../xml/root.zig");
const uri = @import("chart_namespace.zig").uri;
pub const Kind = enum { numeric_cache, string_cache, numeric_literal, string_literal, multilevel_cache };

pub fn local(kind: Kind) []const u8 {
    return switch (kind) {
        .numeric_cache => "numCache",
        .string_cache => "strCache",
        .numeric_literal => "numLit",
        .string_literal => "strLit",
        .multilevel_cache => "multiLvlStrCache",
    };
}

pub fn classify(name: xml.namespaces.ExpandedName) ?Kind {
    const std = @import("std");
    if (!std.mem.eql(u8, name.uri, uri)) return null;
    inline for (.{ Kind.numeric_cache, Kind.string_cache, Kind.numeric_literal, Kind.string_literal, Kind.multilevel_cache }) |kind| {
        if (name.local.equals(local(kind), false)) return kind;
    }
    return null;
}
