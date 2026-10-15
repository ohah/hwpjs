//! Bounded native edit history. No display text or serialized ZIP snapshots.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoints = @import("editor_checkpoint.zig");
const Stacks = @import("../model/history_stack.zig").Stack(checkpoints.Checkpoint, release);

pub const Command = struct {
    kind: enum { plain, anchored, field, split, merge, format, character_properties, character_font_name, cell_size, paragraph_format, paragraph_alignment, paragraph_margins, paragraph_spacing, split_anchored, formula_definition, picture_dimensions, picture_resize, check_box_state, created_table_stage, created_cell_text, formula_result_override, formula_result_splice, dutmal_text } = .plain,
    section: usize = 0,
    paragraph: usize,
    right_paragraph: ?usize = null,
    start: u32,
    deleted: u32,
    inserted: []const u8,
    begin_element: usize = 0,
    char_shape_id: u32 = 0,
    character_properties: @import("../model/document.zig").CharacterPropertyPatch = .{},
    font_language: @import("font_faces.zig").Language = .hangul,
    font_name: []const u8 = "",
    paragraph_shape_id: u32 = 0,
    paragraph_alignment: @import("paragraph_resource_clone.zig").Alignment = .LEFT,
    paragraph_margins: @import("paragraph_margin_patch.zig").Patch = .{},
    paragraph_spacing: @import("paragraph_spacing_patch.zig").Spacing = .{ .kind = 0, .value = 160 },
    list_node: usize = 0,
    cell_size: @import("table_cell_size_write.zig").Size = .{ .width = 0, .height = 0 },
    picture_node: usize = 0,
    picture_dimensions: @import("picture_dimension_write.zig").Update = .{},
    picture_size: [2]u32 = .{ 0, 0 },
    form_node: usize = 0,
    checkbox_state: @import("form_checkbox_state_session.zig").State = .unchecked,
    created_table: ?*const @import("../model/created_table.zig").Table = null,
    created_table_identity: u64 = 0,
    created_cell: [2]u32 = .{ 0, 0 },
    dutmal_node: usize = 0,
    dutmal_kind: @import("dutmal_text_session.zig").Kind = .main_text,
};
pub const History = struct {
    allocator: std.mem.Allocator,
    source_pointer: [*]const u8,
    max_checkpoint_bytes: usize,
    stack: Stacks,

    pub fn init(session: *const editor.Session, max_entries: usize, max_checkpoint_bytes: usize) !History {
        if (max_entries == 0 or max_checkpoint_bytes == 0) return error.LimitExceeded;
        _ = std.math.mul(usize, max_entries, max_checkpoint_bytes) catch return error.LimitExceeded;
        return .{ .allocator = session.allocator, .source_pointer = session.source.ptr, .max_checkpoint_bytes = max_checkpoint_bytes, .stack = try Stacks.init(session.allocator, max_entries) };
    }
    pub fn deinit(self: *History) void {
        self.stack.deinit();
        self.* = undefined;
    }
    fn bind(self: *const History, session: *const editor.Session) !void {
        if (self.source_pointer != session.source.ptr or self.allocator.ptr != session.allocator.ptr or self.allocator.vtable != session.allocator.vtable) return error.SourceBindingMismatch;
    }
    pub fn apply(self: *History, session: *editor.Session, command: Command) !bool {
        return self.applyBatch(session, &.{command});
    }
    pub fn applyBatch(self: *History, session: *editor.Session, commands: []const Command) !bool {
        try self.bind(session);
        var before = try checkpoints.capture(session, self.max_checkpoint_bytes);
        var transferred = false;
        defer if (!transferred) before.deinit();
        try self.stack.prepare();
        var changed = false;
        const property_batch = commands.len > 1 and for (commands) |command| {
            if (command.kind != .character_properties) break false;
        } else true;
        for (commands) |command| {
            const applied = (if (property_batch) applyDeferredProperty(session, command) else applyCommand(session, command)) catch |err| {
                try before.rollback(session);
                return err;
            };
            changed = applied or changed;
        }
        if (!changed) return false;
        if (property_batch) {
            const saved = session.save() catch |err| {
                try before.rollback(session);
                return err;
            };
            session.allocator.free(saved);
        }
        _ = checkpoints.size(session, self.max_checkpoint_bytes) catch |err| {
            try before.rollback(session);
            return err;
        };
        self.stack.commit(before);
        transferred = true;
        return true;
    }
    fn applyDeferredProperty(session: *editor.Session, command: Command) !bool {
        if (command.inserted.len != 0) return error.InvalidFormatCommand;
        const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
        return @import("character_property_session.zig").applyDeferredSave(session, command.section, command.paragraph, command.start, end, command.character_properties);
    }
    fn applyCommand(session: *editor.Session, command: Command) !bool {
        return switch (command.kind) {
            .created_cell_text => block: {
                if (command.start != 0 or command.deleted != 0) return error.InvalidCreatedTableCommand;
                break :block try @import("created_cell_text_session.zig").set(session, command.section, command.created_table_identity, command.created_cell[0], command.created_cell[1], command.inserted);
            },
            .created_table_stage => block: {
                if (command.deleted != 0 or command.inserted.len != 0) return error.InvalidCreatedTableCommand;
                break :block try @import("created_table_session.zig").stage(session, command.section, command.paragraph, command.start, command.created_table orelse return error.InvalidCreatedTableCommand);
            },
            .character_font_name => block: {
                if (command.inserted.len != 0) return error.InvalidFormatCommand;
                const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
                break :block try session.setCharacterFontName(command.section, command.paragraph, command.start, end, command.font_language, command.font_name);
            },
            .formula_definition => block: {
                if (command.start != 0 or command.deleted != 0) return error.InvalidFormulaDefinitionCommand;
                break :block try session.setFormulaDefinition(command.section, command.begin_element, command.inserted);
            },
            .formula_result_override => block: {
                if (command.start != 0 or command.deleted != 0) return error.InvalidFormulaResultCommand;
                break :block try session.setManualFormulaResult(command.section, command.begin_element, command.inserted);
            },
            .formula_result_splice => try session.spliceManualFormulaResult(command.section, command.begin_element, command.start, command.deleted, command.inserted),
            .character_properties => block: {
                if (command.inserted.len != 0) return error.InvalidFormatCommand;
                const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
                break :block try session.setCharacterProperties(command.section, command.paragraph, command.start, end, command.character_properties);
            },
            .paragraph_spacing => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidParagraphFormatCommand;
                break :block try session.setParagraphSpacing(command.section, command.paragraph, command.paragraph_spacing);
            },
            .paragraph_margins => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidParagraphFormatCommand;
                break :block try session.setParagraphMargins(command.section, command.paragraph, command.paragraph_margins);
            },
            .paragraph_alignment => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidParagraphFormatCommand;
                break :block try session.setParagraphAlignment(command.section, command.paragraph, command.paragraph_alignment);
            },
            .paragraph_format => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidParagraphFormatCommand;
                break :block try session.setParagraphFormat(command.section, command.paragraph, command.paragraph_shape_id);
            },
            .cell_size => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidCellSizeCommand;
                break :block try session.setCellSizeForList(command.section, command.list_node, command.cell_size);
            },
            .picture_dimensions => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidPictureDimensionCommand;
                break :block try session.setPictureDimensions(command.section, command.picture_node, command.picture_dimensions);
            },
            .check_box_state => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidFormStateCommand;
                break :block try session.setCheckBoxState(command.section, command.form_node, command.checkbox_state);
            },
            .picture_resize => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidPictureResizeCommand;
                break :block try session.resizePicture(command.section, command.picture_node, command.picture_size);
            },
            .dutmal_text => block: {
                if (command.start != 0 or command.deleted != 0) return error.InvalidDutmalTextCommand;
                break :block try session.setDutmalText(command.section, command.dutmal_node, command.dutmal_kind, command.inserted);
            },
            .format => block: {
                if (command.inserted.len != 0) return error.InvalidFormatCommand;
                const end = std.math.add(u32, command.start, command.deleted) catch return error.InvalidTextPosition;
                break :block try session.setCharacterFormat(command.section, command.paragraph, command.start, end, command.char_shape_id);
            },
            .plain => try session.splice(command.section, command.paragraph, command.start, command.deleted, command.inserted),
            .anchored => try session.spliceAnchored(command.section, command.paragraph, command.start, command.deleted, command.inserted),
            .field => try session.spliceFieldLabel(command.section, command.paragraph, command.begin_element, command.start, command.deleted, command.inserted),
            .split, .split_anchored => block: {
                if (command.inserted.len != 0) return error.InvalidStructureCommand;
                if (command.kind == .split_anchored) break :block try session.splitParagraphAnchored(command.section, command.paragraph, command.start, command.deleted);
                break :block try session.splitParagraph(command.section, command.paragraph, command.start, command.deleted);
            },
            .merge => block: {
                if (command.start != 0 or command.deleted != 0 or command.inserted.len != 0) return error.InvalidStructureCommand;
                break :block if (command.right_paragraph) |right| try session.mergeParagraphPair(command.section, command.paragraph, right) else try session.mergeParagraph(command.section, command.paragraph);
            },
        };
    }
    pub fn undo(self: *History, session: *editor.Session) !bool {
        try self.bind(session);
        return self.stack.move(false, session, exchange);
    }
    pub fn redo(self: *History, session: *editor.Session) !bool {
        try self.bind(session);
        return self.stack.move(true, session, exchange);
    }
};
fn release(checkpoint: *checkpoints.Checkpoint) void {
    checkpoint.deinit();
}
fn exchange(checkpoint: *checkpoints.Checkpoint, session: *editor.Session) !void {
    try checkpoint.exchange(session);
}
