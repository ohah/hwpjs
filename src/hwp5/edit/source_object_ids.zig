//! Shared immutable source object reservations; not a model identity allocator.
const std = @import("std");
pub fn fromRecord(record: @import("../record.zig").Record) !?u32 {
    switch (record.tag) {
        71 => {
            const header = try @import("../body/control_header.zig").Header.parse(record.payload);
            const common = @import("../body/object_common.zig");
            const rules = @import("../body/control_rules.zig");
            if (common.supports(header.id) or header.id == rules.form_id) return (try common.parseControl(header)).instance_id;
            if (rules.expectedCode(header.id) == 3) return (try @import("../body/field_start.zig").Properties.parse(header.properties)).instance_id;
            if (rules.expectedCode(header.id) == null) return error.UnsupportedCreatedTableIdSource;
        },
        85 => {
            // Conservative exclusion only; never choose an optional prefix by length.
            if (record.payload.len >= 78) return std.mem.readInt(u32, record.payload[74..78], .little);
        },
        else => {},
    }
    return null;
}
