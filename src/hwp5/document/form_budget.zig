const forms = @import("../body/form_validation.zig");
/// Consume validated usage atomically. Shared by sections and additional views.
pub fn consume(selection: *?forms.Options, used: forms.Report) !void {
    if (selection.*) |*budget| {
        if (used.inspected_forms > budget.max_forms or used.property_bytes > budget.properties.max_input_bytes or used.property_nodes > budget.properties.max_nodes) return error.LimitExceeded;
        budget.max_forms -= used.inspected_forms;
        budget.properties.max_input_bytes -= used.property_bytes;
        budget.properties.max_nodes -= used.property_nodes;
    }
}
