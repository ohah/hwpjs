const framing = @import("../record.zig");
const Version = @import("../version.zig").Version;
pub const Header = @import("paragraph_header.zig").Header;
pub const text = @import("text.zig");
pub const Text = text.Text;
pub const Runs = @import("char_runs.zig").Runs;
pub const Segments = @import("line_segments.zig").Segments;
pub const Ranges = @import("range_tags.zig").Ranges;
pub const Metadata = @import("metadata.zig").Metadata;
pub const ControlHeader = @import("control_header.zig").Header;
pub const list_header = @import("list_header.zig");
pub const ListHeader = list_header.Header;
pub const section_def = @import("section_def.zig");
pub const column_def = @import("column_def.zig");
pub const object_common = @import("object_common.zig");
pub const table = @import("table.zig");
pub const Table = table.Table;
pub const Cell = @import("table_cell.zig").Cell;
pub const CellAttributes = @import("cell_attributes.zig").Attributes;
pub const CellExtension = @import("cell_extension.zig").Extension;
pub const Caption = @import("caption.zig").Caption;
pub const PageDefinition = @import("page_def.zig").Definition;
pub const PageBorder = @import("page_border.zig").Border;
pub const note_shape = @import("note_shape.zig");
pub const NoteShape = note_shape.Shape;
pub const Tag = enum(u10) { paragraph_header = 66, paragraph_text = 67, char_runs = 68, line_segments = 69, range_tags = 70, control_header = 71, list_header = 72, page_definition = 73, note_shape = 74, page_border = 75, table = 77 };
pub const Value = union(enum) { header: Header, text: Text, char_runs: Runs, line_segments: Segments, range_tags: Ranges, control_header: ControlHeader, list_header: ListHeader, page_definition: PageDefinition, note_shape: NoteShape, page_border: PageBorder, table: Table, unknown };
pub const Record = struct { framing: framing.Record, value: Value };
/// Payload decoding only. Nested paragraphs keep their original levels.
/// Ownership/order/count/DocInfo references need a separate section assembler.
pub const Iterator = struct {
    records: framing.Iterator,
    version: Version,
    pub fn init(bytes: []const u8, version: Version, options: framing.Options) !Iterator {
        try version.requireSupported();
        return .{ .records = framing.Iterator.init(bytes, options), .version = version };
    }
    pub fn next(self: *Iterator) !?Record {
        var candidate = self.records;
        const r = (try candidate.next()) orelse return null;
        const value: Value = switch (r.tag) {
            @intFromEnum(Tag.paragraph_header) => .{ .header = try Header.parse(r.payload, self.version) },
            @intFromEnum(Tag.paragraph_text) => .{ .text = try Text.parse(r.payload) },
            @intFromEnum(Tag.char_runs) => .{ .char_runs = try Runs.parse(r.payload) },
            @intFromEnum(Tag.line_segments) => .{ .line_segments = try Segments.parse(r.payload) },
            @intFromEnum(Tag.range_tags) => .{ .range_tags = try Ranges.parse(r.payload) },
            @intFromEnum(Tag.control_header) => .{ .control_header = try ControlHeader.parse(r.payload) },
            @intFromEnum(Tag.list_header) => .{ .list_header = try ListHeader.parse(r.payload) },
            @intFromEnum(Tag.page_definition) => .{ .page_definition = try PageDefinition.parse(r.payload) },
            @intFromEnum(Tag.note_shape) => .{ .note_shape = try NoteShape.parse(r.payload) },
            @intFromEnum(Tag.table) => .{ .table = try Table.parse(r.payload, self.version) },
            @intFromEnum(Tag.page_border) => .{ .page_border = try PageBorder.parse(r.payload) },
            else => .unknown,
        };
        self.records = candidate;
        return .{ .framing = r, .value = value };
    }
};
