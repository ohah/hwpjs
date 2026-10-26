//! One actual file -> owned decoded drafts only. Never rewrites FileHeader/CFB.
const std = @import("std");
const docinfo = @import("docinfo_migration_draft.zig");
const sections = @import("drawing_sections_migration.zig");
pub const Options = struct {
    docinfo: docinfo.Defaults,
    drawings: sections.Values,
    current_and_reserved: []const u32 = &.{},
    max_ids: usize = 100000,
    max_decoded_bytes: usize = 32 * 1024 * 1024,
    max_output_bytes: usize = 32 * 1024 * 1024,
};
pub const Draft = struct {
    docinfo: docinfo.Draft,
    body: sections.Draft,
    opaque_section_bytes: usize,
    complete_document: bool = false,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.docinfo.deinit(a);
        self.body.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, input: []const u8, options: Options) !Draft {
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const from = source.header.version();
    const to: @import("../version.zig").Version = .{ .raw = 0x05000300 };
    if (from.raw != 0x05000107) return error.UnsupportedDrawingMigrationTarget;
    if (source.section_count > options.max_ids) return error.LimitExceeded;
    const info = try source.decodeDocInfo(a, options.max_decoded_bytes);
    defer a.free(info);
    const raw = try a.alloc([]const u8, source.section_count);
    var decoded: usize = 0;
    defer {
        for (raw[0..decoded]) |bytes| a.free(bytes);
        a.free(raw);
    }
    var total = info.len;
    var opaque_bytes: usize = 0;
    for (raw, 0..) |*bytes, index| {
        bytes.* = try source.decodeSection(a, index);
        decoded += 1;
        if (total > options.max_decoded_bytes or bytes.len > options.max_decoded_bytes - total) return error.LimitExceeded;
        total += bytes.len;
        var records = @import("../record.zig").Iterator.init(bytes.*, .{});
        while (try records.next()) |record| if (record.tag == 71) {
            const control = try @import("../body/control_header.zig").Header.parse(record.payload);
            if (control.id == @import("../body/control_rules.zig").section_id) {
                const definition = try @import("../body/section_def.zig").Definition.parse(control.properties, from);
                opaque_bytes += definition.extra.len;
            }
        };
    }
    var prepared_info = try docinfo.prepare(a, info, from, to, options.docinfo, options.max_output_bytes);
    errdefer prepared_info.deinit(a);
    if ((try @import("../docinfo/section_count.zig").locate(prepared_info.bytes, to)).value != raw.len) return error.SourceBindingMismatch;
    const prepared_body = try sections.prepare(a, raw, from, to, options.current_and_reserved, options.drawings, options.max_ids, options.max_output_bytes - prepared_info.bytes.len);
    return .{ .docinfo = prepared_info, .body = prepared_body, .opaque_section_bytes = opaque_bytes };
}
