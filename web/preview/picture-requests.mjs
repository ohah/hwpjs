export function createPictureRequests(post, timeoutMs = 30000) {
  let sequence = 0;
  const pending = new Map();
  return {
    read(section, pictureNode) {
      const origin = `picture:${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(origin); reject(new Error("PictureReadTimeout")); }, timeoutMs);
        pending.set(origin, { resolve, reject, timer });
        try { post({ kind: "picture-bytes", section, pictureNode, origin }); }
        catch (error) { clearTimeout(timer); pending.delete(origin); reject(error); }
      });
    },
    message(message) {
      if (!String(message.origin ?? "").startsWith("picture:")) return false;
      const request = pending.get(message.origin);
      if (request) {
        pending.delete(message.origin); clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error));
        else if (message.kind !== "picture-bytes" || !(message.bytes instanceof Uint8Array)) request.reject(new Error("InvalidPictureReply"));
        else request.resolve(message.bytes);
      }
      return true;
    },
    reset() { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("PictureDocumentChanged")); } pending.clear(); },
  };
}
