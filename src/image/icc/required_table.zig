const plan = @import("required_plan.zig");
pub const Selection = struct {
    edition: @import("edition.zig").Edition,
    model: plan.Model,
    measurement_white: plan.MeasurementWhite,
};
pub const Report = @import("required_presence.zig").Report;
/// Header-derived context, explicit model/edition/measurement evidence.
/// No inference from a single tag, no allocation, no payload validity claim.
pub fn inspect(table: *const @import("tag_table.zig").Table, selection: Selection) !Report {
    const identifiers = try @import("header_identifiers.zig").inspect(table.header, selection.edition);
    return @import("required_presence.zig").inspectTags(.{
        .edition = selection.edition,
        .profile_class = identifiers.profile_class,
        .data_space = table.header.data_space,
        .pcs = table.header.pcs,
        .model = selection.model,
        .measurement_white = selection.measurement_white,
    }, table.tags);
}
