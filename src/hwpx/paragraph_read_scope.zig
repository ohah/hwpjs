//! Move init's result into its final storage BEFORE attach. Do not move while attached.
//! Native ABI edits are blocked. Direct Zig mutations must advance mutation_serial
//! (managed Session edits do so); arbitrary untracked field writes are outside this lease.
const std = @import("std");
const editor = @import("editor_session.zig");
const display = @import("display_current_paragraphs.zig");

pub const Scope = struct {
    session: *editor.Session,
    forms: @import("form_read_context.zig").Context,
    headers: @import("header_read_context.zig").Context,
    allocator: std.mem.Allocator,
    section: *editor.Section,
    view: display.View,
    cache: @import("paragraph_query_cache.zig").Cache,

    pub fn init(session: *editor.Session, section: usize) !Scope {
        if (section >= session.sections.len) return error.InvalidSectionIndex;
        if (session.form_read_context != null or session.sections[section].paragraph_query_cache != null) return error.ReadObservationScopeActive;
        const view = try display.readUncached(session.allocator, &session.sections[section], session.options);
        return .{ .session = session, .forms = @import("form_read_context.zig").Context.init(session, section), .headers = @import("header_read_context.zig").Context.init(session), .allocator = session.allocator, .section = &session.sections[section], .view = view, .cache = .{
            .owner = &session.sections[section],
            .paragraphs = view.paragraphs,
            .mutation_serial = &session.mutation_serial,
            .captured_serial = session.mutation_serial,
        } };
    }

    pub fn attach(self: *Scope) !void {
        if (self.session.form_read_context != null or self.section.paragraph_query_cache != null) return error.ReadObservationScopeActive;
        if (!self.cache.valid()) return error.StaleParagraphReadScope;
        self.section.paragraph_query_cache = &self.cache;
        self.session.form_read_context = &self.forms;
        if (self.session.header_read_context == null) self.session.header_read_context = &self.headers;
    }

    /// Session and its Section must outlive this call. Clear only our own lease.
    pub fn deinit(self: *Scope) void {
        if (self.session.form_read_context == &self.forms) self.session.form_read_context = null;
        self.forms.deinit();
        if (self.session.header_read_context == &self.headers) self.session.header_read_context = null;
        self.headers.deinit();
        if (self.section.paragraph_query_cache == &self.cache) self.section.paragraph_query_cache = null;
        self.view.deinit(self.allocator);
        self.* = undefined;
    }
};
