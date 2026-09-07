const std = @import("std");
const parser = @import("parser.zig");
pub const data = @import("registry_data.zig");
pub const Options = parser.Options;
pub const Report = struct {
    syntax: parser.Report,
    lookups: usize = 0,
    extlang_prefix_checked: bool = false,
    /// Registered singleton, but its authority's internal vocabulary is not validated.
    extension_semantics_deferred: usize = 0,
};
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    var result: Report = .{ .syntax = try parser.inspect(a, bytes, options) };
    const s = &result.syntax;
    if (s.kind == .language) {
        if (!data.contains(.language, s.language)) return error.UnregisteredLanguage;
        result.lookups += 1;
        if (s.extlang_count > 1) return error.InvalidExtendedLanguageCount;
        if (s.extlang_count == 1) {
            const prefix = data.extlangPrefix(s.extlangs) orelse return error.UnregisteredExtlang;
            if (!std.ascii.eqlIgnoreCase(s.language, prefix)) return error.InvalidExtendedLanguagePrefix;
            result.lookups += 1;
            result.extlang_prefix_checked = true;
        }
        if (s.script.len != 0) {
            if (!data.contains(.script, s.script)) return error.UnregisteredScript;
            result.lookups += 1;
        }
        if (s.region.len != 0) {
            if (!data.contains(.region, s.region)) return error.UnregisteredRegion;
            result.lookups += 1;
        }
        var variants = std.mem.tokenizeScalar(u8, s.variants, '-');
        while (variants.next()) |v| {
            if (!data.contains(.variant, v)) return error.UnregisteredVariant;
            result.lookups += 1;
        }
        var extensions = std.mem.tokenizeScalar(u8, s.extensions, '-');
        while (extensions.next()) |v| if (v.len == 1) {
            if (!data.contains(.extension, v)) return error.UnregisteredExtension;
            result.lookups += 1;
            result.extension_semantics_deferred += 1;
        };
    }
    s.registry_validated = true;
    return result;
}
