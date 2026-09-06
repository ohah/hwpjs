const std = @import("std");
pub const Header = @import("../file_header.zig").Header;
const resources = @import("../docinfo/resources.zig");
const sources = @import("../parameters/sources.zig");
pub const Section = struct { index: u16, bytes: []const u8 };
pub const Input = struct { header: []const u8, doc_info: []const u8, sections: []const Section };
pub const Options = struct {
    ole_layout: @import("../body/ole.zig").Layout = .observed26,
    equation_layout: @import("../body/equation.zig").Layout = .version_only,
    note_layout: @import("../body/note_control.zig").Layout = .observed12,
    overlap_layout: @import("../body/char_overlap.zig").Layout = .full,
    hide_layout: @import("../body/page_visibility.zig").HideLayout = .observed32,
    list_layout: @import("../body/list_header.zig").Layout,
    zone_layout: @import("../body/table_zone.zig").Layout,
    parameters: @import("../parameters/types.zig").Options,
    framing: @import("../record.zig").Options = .{},
    max_sections: usize = 4096,
    max_total_bytes: usize = 64 * 1024 * 1024,
    max_total_records: usize = 1000000,
    pub fn validate(self: Options) !void {
        try self.parameters.validate();
        if (self.max_sections == 0 or self.max_total_bytes == 0 or self.max_total_records == 0) return error.InvalidDocumentLimit;
    }
};
pub fn parameterOptions(options: Options, count: usize) sources.Options {
    return .{ .parameters = options.parameters, .list_layout = options.list_layout, .bin_data_count = count, .framing = options.framing };
}
pub const DocInfo = struct {
    properties: @import("../docinfo/properties.zig").Properties,
    resources: resources.Report,
    references: @import("../docinfo/references.zig").Report,
    parameters: sources.Report,
    records: usize,
};
pub const Lists = struct { groups: usize = 0, paragraphs: usize = 0, intervening_records: usize = 0 };
pub const SectionReport = struct {
    shapes: @import("../body/shape_validation.zig").Report = .{},
    ole: @import("../body/ole_validation.zig").Report = .{},
    equations: @import("../body/equation_validation.zig").Report = .{},
    notes: @import("../body/note_validation.zig").Report = .{},
    hidden_comments: @import("../body/hidden_comment.zig").Report = .{},
    ruby: @import("../body/ruby_validation.zig").Report = .{},
    fields: @import("../body/field_validation.zig").Report = .{},
    observed_field_links: usize = 0,
    char_overlap: @import("../body/char_overlap_validation.zig").Report = .{},
    bookmarks: @import("../body/bookmark.zig").Report = .{},
    page_visibility: @import("../body/page_visibility_validation.zig").Report = .{},
    index_marks: @import("../body/index_mark_validation.zig").Report = .{},
    page_number: @import("../body/page_number_validation.zig").Report = .{},
    number_controls: @import("../body/number_control_validation.zig").Report = .{},
    header_footer: @import("../body/header_footer_validation.zig").Report = .{},
    records: usize,
    paragraphs: @import("../body/paragraphs.zig").Report,
    definition: @import("../body/section_validation.zig").Report,
    control_types: @import("../body/control_type_validation.zig").Report,
    lists: Lists,
    tables: @import("../body/table_validation.zig").Report,
    parameters: sources.Report,
    object_properties: usize,
};
/// All registered checks passed, NOT proof of full HWP support.
/// Owns sections only; DocInfo property/mapping slices still borrow input.doc_info.
pub const Report = struct {
    header: Header,
    doc_info: DocInfo,
    sections: []SectionReport,
    total_bytes: usize,
    total_records: usize,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.sections);
        self.* = undefined;
    }
};
