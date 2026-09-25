const borders = @import("section_page_border.zig");
const resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");
const values = @import("xml_values.zig");

pub const Report = struct {
    borders: usize = 0,
    absent: usize = 0,
    zero: usize = 0,
    resolved: usize = 0,
    absent_table: usize = 0,
    missing_target: usize = 0,
    first_unresolved_id: ?u32 = null,
    first_unresolved_section: ?usize = null,
    first_unresolved_element: ?usize = null,
};

/// Diagnostic only. Zero is counted as an observed ID and also resolved
/// against the resource table; it is not silently treated as a sentinel.
pub fn inspect(border_report: *const borders.Report, table: *const resources.Table) !Report {
    var report: Report = .{};
    for (border_report.items) |*item| {
        if (item.kind != .border) continue;
        report.borders += 1;
        const raw = item.get(.border_fill_id_ref) orelse {
            report.absent += 1;
            continue;
        };
        const id = try values.unsigned32(raw);
        report.zero += @intFromBool(id == 0);
        const outcome = id_references.resolveValue(id, table);
        switch (outcome) {
            .resolved => report.resolved += 1,
            .absent_table => report.absent_table += 1,
            .missing_target => report.missing_target += 1,
            .absent => unreachable,
        }
        if (report.first_unresolved_id == null and outcome != .resolved) {
            report.first_unresolved_id = id;
            report.first_unresolved_section = item.section_ordinal;
            report.first_unresolved_element = item.element_index;
        }
    }
    return report;
}
