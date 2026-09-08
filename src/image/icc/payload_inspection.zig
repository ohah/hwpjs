const std = @import("std");
pub const Options = struct {
    edition: @import("edition.zig").Edition,
    /// Per-descriptor work budget; shared tag data is charged for each signature.
    max_payload_bytes: usize = 64 * 1024 * 1024,
    max_localized_records: usize = 100000,
    max_unicode_bytes: usize = 64 * 1024 * 1024,
    /// Explicit interpretation; false preserves raw v2 Unicode without scanning.
    v2_unicode_utf16be: bool = false,
};
pub const Report = struct {
    tags: usize = 0,
    payload_bytes: usize = 0,
    xyz: usize = 0,
    trc: usize = 0,
    localized: usize = 0,
    adaptation: usize = 0,
    unhandled: usize = 0,
    unsupported_edition: usize = 0,
    xyz_context_deferred: usize = 0,
    luminance_unused_nonzero: usize = 0,
    localized_records: usize = 0,
    unicode_bytes: usize = 0,
    localized_extensions_deferred: usize = 0,
    v2_description: usize = 0,
    v2_copyright: usize = 0,
    v2_unicode_bytes_deferred: usize = 0,
    v2_script_bytes_deferred: usize = 0,
    v2_trailing_bytes_deferred: usize = 0,
    v2_unicode_descriptions_checked: usize = 0,
    v2_unicode_utf16be_selected: bool = false,
    v2_unicode_scalars: usize = 0,
    v2_unicode_nul_scalars: usize = 0,
    v2_unicode_bom_scalars: usize = 0,
    /// Aggregate support is partial even when every signature is recognized.
    semantics_deferred: bool = true,
};
/// Requires a parsed table; borrows all input and returns scalar-only evidence.
pub fn inspect(a: std.mem.Allocator, table: *const @import("tag_table.zig").Table, options: Options) !Report {
    const ids = try @import("header_identifiers.zig").inspect(table.header, options.edition);
    var r: Report = .{ .v2_unicode_utf16be_selected = options.v2_unicode_utf16be };
    for (table.tags) |tag| {
        if (tag.data.len > options.max_payload_bytes - r.payload_bytes) return error.LimitExceeded;
        const value = try @import("tag_payload.zig").parse(tag.signature, tag.data, options.edition, .{
            .max_bytes = options.max_payload_bytes - r.payload_bytes,
            .max_records = options.max_localized_records - r.localized_records,
        });
        r.tags += 1;
        r.payload_bytes += tag.data.len;
        switch (value) {
            .xyz => |point| {
                r.xyz += 1;
                if (options.edition == .v4_2022) {
                    const evidence = try @import("xyz_tag_values.zig").inspectV4(ids.profile_class, point);
                    r.xyz_context_deferred += @intFromBool(evidence.context_deferred);
                    r.luminance_unused_nonzero += @intFromBool(evidence.luminance_unused_nonzero);
                } else r.xyz_context_deferred += 1;
            },
            .trc => r.trc += 1,
            .adaptation => r.adaptation += 1,
            .description_v2 => |text| {
                r.v2_description += 1;
                if (options.v2_unicode_utf16be) {
                    const unicode = try @import("description_unicode.zig").inspectUtf16BE(text, options.max_unicode_bytes - r.unicode_bytes);
                    r.v2_unicode_descriptions_checked += 1;
                    r.unicode_bytes += unicode.inspected_bytes;
                    r.v2_unicode_scalars += unicode.text.scalars;
                    r.v2_unicode_nul_scalars += unicode.text.nul_scalars;
                    r.v2_unicode_bom_scalars += unicode.text.bom_scalars;
                } else r.v2_unicode_bytes_deferred += text.unicode.len;
                r.v2_script_bytes_deferred += text.script.len + text.script_unused.len;
                r.v2_trailing_bytes_deferred += text.trailing.len;
            },
            .copyright_v2 => r.v2_copyright += 1,
            .localized => |text| {
                const unicode = try @import("mluc_unicode.zig").inspect(a, text.strings, .{
                    .max_records = options.max_localized_records - r.localized_records,
                    .max_unique_bytes = options.max_unicode_bytes - r.unicode_bytes,
                });
                r.localized += 1;
                r.localized_records += unicode.records;
                r.unicode_bytes += unicode.inspected_bytes;
                r.localized_extensions_deferred += @intFromBool(text.extensions_deferred);
            },
            .unhandled => r.unhandled += 1,
            .unsupported_edition => r.unsupported_edition += 1,
        }
    }
    return r;
}
