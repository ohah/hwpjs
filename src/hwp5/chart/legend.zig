const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const requireType = @import("type_checks.zig").require;
const fonts = @import("font.zig");
const sections = @import("chart_section.zig");
const ids = @import("object_ids.zig");
pub const Legend = struct { object_id: u32, font: fonts.Font, raw: [10]u8, section: sections.Section, end: usize };

/// Selected inline Legend v1 with resolved String references and empty Picture.
/// Borrows string source(s); copies raw fields. Failure preserves reader but
/// requires disposal of both caller-owned tables, which may have changed.
pub fn readObservedV1(reader: *Reader, types: *Types, objects: *Objects, max_name_bytes: usize) !Legend {
    var next = reader.*;
    const id = try ids.readInline(&next);
    try objects.registerOther(id);
    try requireType(types, &next, "VtChartLegend\x00", 1);
    const font = try fonts.readObservedWithObjects(&next, types, objects, max_name_bytes);
    const raw = (try next.take(10))[0..10].*;
    const section = try sections.readObservedV1(&next, types);
    for (section.backdrop.object_ids) |object_id| try objects.registerOther(object_id);
    reader.* = next;
    return .{ .object_id = id, .font = font, .raw = raw, .section = section, .end = next.offset };
}
