const definitions = @import("section_definition.zig");
const resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");
const values = @import("xml_values.zig");

pub const Counts = struct {
    absent: usize = 0,
    zero: usize = 0,
    resolved: usize = 0,
    absent_table: usize = 0,
    missing_target: usize = 0,
    first_unresolved_id: ?u32 = null,
    first_unresolved_section: ?usize = null,
    first_unresolved_element: ?usize = null,
};

pub const Report = struct {
    outline: Counts = .{},
    memo: Counts = .{},
};

fn note(counts: *Counts, raw: ?[]const u8, table: *const resources.Table, definition: *const definitions.Definition) !void {
    const value = raw orelse {
        counts.absent += 1;
        return;
    };
    const id = try values.unsigned32(value);
    // Zero is preserved as an explicit value. The official model does not
    // establish whether it is a sentinel or a resource ID in every version.
    if (id == 0) {
        counts.zero += 1;
        return;
    }
    switch (id_references.resolveValue(id, table)) {
        .resolved => {
            counts.resolved += 1;
            return;
        },
        .absent_table => counts.absent_table += 1,
        .missing_target => counts.missing_target += 1,
        .absent => unreachable,
    }
    if (counts.first_unresolved_id == null) {
        counts.first_unresolved_id = id;
        counts.first_unresolved_section = definition.section_ordinal;
        counts.first_unresolved_element = definition.element_index;
    }
}

/// Diagnostic cross-reference only; unresolved IDs do not reject a document.
pub fn inspect(definition_report: *const definitions.Report, resource_report: *const resources.Report) !Report {
    var report: Report = .{};
    for (definition_report.definitions) |*definition| {
        try note(&report.outline, definition.get(.outline_shape_id_ref), resource_report.table(.numbering), definition);
        try note(&report.memo, definition.get(.memo_shape_id_ref), resource_report.table(.memo_shape), definition);
    }
    return report;
}
