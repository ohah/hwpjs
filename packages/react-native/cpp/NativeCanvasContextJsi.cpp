#include "NativeCanvasContextJsi.h"
#include "NativeCanvasAbi.h"
#include <cmath>
#include <exception>
#include <cstring>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
#ifdef HWPJS_NATIVE_CANVAS_TEST_FAULTS
#include "NativeCanvasFaultProbe.h"
#else
static void canvasFault(const char *) {}
#endif

namespace hwpjs {
namespace jsi = facebook::jsi;
namespace {
constexpr size_t limit = 64 * 1024 * 1024;
enum class Operation { Open, Read, Splice, Save, History, State, Snapshot, SnapshotWindow, RenderSources, PictureBytes, HistoryConfigure, HistoryStats, Close, Dispose };
struct TokenAuthority {};
class TokenHandle final : public jsi::HostObject {
 public:
  TokenHandle(HwpNativeToken value, std::shared_ptr<TokenAuthority> authority)
      : value(value), authority(std::move(authority)) {}
  jsi::Value get(jsi::Runtime &rt, const jsi::PropNameID &name) override {
    const auto key = name.utf8(rt);
    if (key == "slot") return static_cast<double>(value.slot);
    if (key == "generation") return static_cast<double>(value.generation);
    return jsi::Value::undefined();
  }
  std::vector<jsi::PropNameID> getPropertyNames(jsi::Runtime &rt) override {
    std::vector<jsi::PropNameID> names;
    names.push_back(jsi::PropNameID::forAscii(rt, "slot"));
    names.push_back(jsi::PropNameID::forAscii(rt, "generation"));
    return names;
  }
  HwpNativeToken value;
  std::shared_ptr<TokenAuthority> authority;
};
struct Packet {
  Operation op;
  std::string kind;
  HwpNativeToken token{};
  uint32_t format = 0, expected = 0, section = 0, paragraph = 0, start = 0, deleted = 0;
  uint32_t flag = 0;
  std::vector<uint8_t> bytes;
};
struct Result {
  std::string kind, error;
  const char *failure = nullptr;
  HwpNativeStatus status = HWP_NATIVE_OK;
  HwpNativeToken token{};
  HwpNativeState state{};
  HwpNativeBuffer buffer{};
  bool hasToken = false, hasState = false, hasBytes = false;
  std::vector<uint8_t> bytes;
};
uint32_t integer(jsi::Runtime &rt, const jsi::Object &o, const char *key) {
  auto v = o.getProperty(rt, key);
  if (!v.isNumber() || !std::isfinite(v.getNumber()) || v.getNumber() < 0 ||
      v.getNumber() > UINT32_MAX || std::floor(v.getNumber()) != v.getNumber()) {
    throw jsi::JSError(rt, std::string("NativeInvalidUInt32:") + key);
  }
  return static_cast<uint32_t>(v.getNumber());
}
std::vector<uint8_t> copiedBytes(jsi::Runtime &rt, const jsi::Object &packet) {
  auto v = packet.getProperty(rt, "bytes");
  if (!v.isObject()) throw jsi::JSError(rt, "NativeExpectedBytes");
  auto o = v.asObject(rt);
  if (o.isArrayBuffer(rt)) {
    auto b = o.getArrayBuffer(rt);
    if (b.size(rt) > limit) throw jsi::JSError(rt, "NativeLimitExceeded");
    const auto *p = b.data(rt);
    return b.size(rt) == 0 ? std::vector<uint8_t>{} : std::vector<uint8_t>(p, p + b.size(rt));
  }
  auto b = o.getProperty(rt, "buffer");
  if (!b.isObject() || !b.asObject(rt).isArrayBuffer(rt)) throw jsi::JSError(rt, "NativeExpectedArrayBufferView");
  auto buffer = b.asObject(rt).getArrayBuffer(rt);
  const auto offset = integer(rt, o, "byteOffset"), length = integer(rt, o, "byteLength");
  if (length > limit || offset > buffer.size(rt) || length > buffer.size(rt) - offset) throw jsi::JSError(rt, "NativeInvalidByteRange");
  if (length == 0) return {};
  const auto *p = buffer.data(rt) + offset;
  return {p, p + length};
}
Packet parse(jsi::Runtime &rt, const jsi::Value &value, const std::shared_ptr<TokenAuthority> &authority) {
  if (!value.isObject()) throw jsi::JSError(rt, "NativeExpectedPacket");
  auto o = value.asObject(rt);
  auto kind = o.getProperty(rt, "kind");
  if (!kind.isString()) throw jsi::JSError(rt, "NativeExpectedPacketKind");
  Packet p{};
  p.kind = kind.asString(rt).utf8(rt);
  if (p.kind == "open") {
    p.op = Operation::Open; p.format = integer(rt, o, "format"); p.bytes = copiedBytes(rt, o);
    if (p.format != HWP_NATIVE_HWP5 && p.format != HWP_NATIVE_HWPX) throw jsi::JSError(rt, "NativeInvalidFormat");
    return p;
  }
  auto token = o.getProperty(rt, "token");
  if (!token.isObject()) throw jsi::JSError(rt, "NativeExpectedToken");
  auto t = token.asObject(rt);
  if (!t.isHostObject<TokenHandle>(rt)) throw jsi::JSError(rt, "NativeInvalidTokenCapability");
  auto handle = t.getHostObject<TokenHandle>(rt);
  if (handle->authority != authority) throw jsi::JSError(rt, "NativeTokenFromDifferentService");
  p.token = handle->value;
  if (p.kind == "read" || p.kind == "splice") {
    p.section = integer(rt, o, "section"); p.paragraph = integer(rt, o, "paragraph");
  }
  if (p.kind == "read") p.op = Operation::Read;
  else if (p.kind == "splice") {
    p.op = Operation::Splice; p.expected = integer(rt, o, "expectedRevision");
    p.start = integer(rt, o, "startUnit"); p.deleted = integer(rt, o, "deletedUnits");
    p.bytes = copiedBytes(rt, o);
  } else if (p.kind == "save") {
    p.op = Operation::Save; p.expected = integer(rt, o, "expectedRevision");
    auto v = o.getProperty(rt, "allowStaleLayout");
    if (!v.isBool()) throw jsi::JSError(rt, "NativeExpectedAllowStaleLayout");
    p.flag = v.getBool() ? 1 : 0;
  } else if (p.kind == "history") {
    p.op = Operation::History; p.expected = integer(rt, o, "expectedRevision");
    auto v = o.getProperty(rt, "redo");
    if (!v.isBool()) throw jsi::JSError(rt, "NativeExpectedRedo");
    p.flag = v.getBool() ? 1 : 0;
  } else if (p.kind == "history-configure") { p.op = Operation::HistoryConfigure; p.expected = integer(rt, o, "expectedRevision"); p.bytes = copiedBytes(rt, o); if(p.bytes.size()>4096) throw jsi::JSError(rt,"InvalidHistoryOptions"); }
  else if (p.kind == "history-stats") p.op = Operation::HistoryStats;
  else if (p.kind == "state") p.op = Operation::State;
  else if (p.kind == "snapshot") p.op = Operation::Snapshot;
  else if (p.kind == "snapshot-window") { p.op=Operation::SnapshotWindow; p.section=integer(rt,o,"section"); p.start=integer(rt,o,"startOrdinal"); p.deleted=integer(rt,o,"count"); p.expected=integer(rt,o,"expectedRevision"); }
  else if (p.kind == "render-sources") {p.op=Operation::RenderSources;p.expected=integer(rt,o,"expectedRevision");}
  else if (p.kind == "picture-bytes") {p.op=Operation::PictureBytes;p.expected=integer(rt,o,"expectedRevision");p.section=integer(rt,o,"section");p.paragraph=integer(rt,o,"pictureNode");}
  else if (p.kind == "close") p.op = Operation::Close;
  else throw jsi::JSError(rt, "NativeUnsupportedContextPacket:" + p.kind);
  return p;
}
struct OutputLease {
  HwpNativeBridge *bridge;
  HwpNativeToken token;
  ~OutputLease() { (void)hwp_native_buffer_release(bridge, token); }
};
// Only native data. All operations run on the injected native serial queue.
class Session final {
 public:
  Session() {
    if (hwp_native_bridge_create(1, &bridge_) != HWP_NATIVE_OK) throw std::runtime_error("NativeBridgeCreateFailed");
  }
  ~Session() { (void)shutdown(); }
  HwpNativeStatus shutdown() noexcept { if(!bridge_)return HWP_NATIVE_OK;const auto status=hwp_native_bridge_destroy(bridge_);if(status==HWP_NATIVE_OK)bridge_=nullptr;return status; }
  Result run(const Packet &p) {
    Result r{}; r.kind = p.kind;
    if(p.op==Operation::Dispose){r.status=shutdown();return r;}
    if (!bridge_) { r.status = HWP_NATIVE_STALE_HANDLE; r.error = "NativeContextDisposed"; return r; }
    switch (p.op) {
      case Operation::Open:
        r.status = hwp_native_open(bridge_, p.format, p.bytes.data(), p.bytes.size(), &r.token);
        r.hasToken = r.status == HWP_NATIVE_OK;
        break;
      case Operation::Read:
        r.status = hwp_native_read(bridge_, p.token, p.section, p.paragraph, &r.buffer, sizeof r.buffer);
        break;
      case Operation::Snapshot:
#ifdef HWPJS_NATIVE_SHARED_SNAPSHOT
        r.status = hwp_native_snapshot_v2(bridge_, p.token, &r.buffer, sizeof r.buffer);
#else
        r.status = HWP_NATIVE_INVALID_ARGUMENT; r.error = "NativeSnapshotUnavailable";
#endif
        break;
      case Operation::SnapshotWindow:
#ifdef HWPJS_NATIVE_SHARED_SNAPSHOT
        r.status=hwp_native_snapshot_window_v2(bridge_,p.token,p.section,p.start,p.deleted,p.expected,&r.buffer,sizeof r.buffer);
#else
        r.status=HWP_NATIVE_INVALID_ARGUMENT;r.error="NativeSnapshotUnavailable";
#endif
        break;
      case Operation::RenderSources:
#ifdef HWPJS_NATIVE_RENDER_SOURCES
        r.status=hwp_native_render_sources(bridge_,p.token,p.expected,&r.buffer,sizeof r.buffer);
#else
        r.status=HWP_NATIVE_INVALID_ARGUMENT;r.error="NativeRenderSourcesUnavailable";
#endif
        break;
      case Operation::PictureBytes:
#ifdef HWPJS_NATIVE_RENDER_SOURCES
        r.status=hwp_native_picture_bytes(bridge_,p.token,p.expected,p.section,p.paragraph,&r.buffer,sizeof r.buffer);
#else
        r.status=HWP_NATIVE_INVALID_ARGUMENT;r.error="NativePictureBytesUnavailable";
#endif
        break;
      case Operation::Save:
        r.status = hwp_native_save(bridge_, p.token, p.expected, p.flag, &r.buffer, sizeof r.buffer);
        break;
      case Operation::Splice:
        r.status = hwp_native_splice(bridge_, p.token, p.expected, p.section, p.paragraph, p.start, p.deleted, p.bytes.data(), p.bytes.size());
        break;
      case Operation::History:
        r.status = hwp_native_history(bridge_, p.token, p.expected, p.flag);
        break;
      case Operation::HistoryConfigure:
#ifdef HWPJS_NATIVE_HISTORY_V2
        r.status = hwp_native_history_configure_v2(bridge_,p.token,p.expected,p.bytes.data(),p.bytes.size());
#else
        r.status = HWP_NATIVE_INVALID_ARGUMENT; r.error = "NativeHistoryV2Unavailable";
#endif
        break;
      case Operation::HistoryStats:
#ifdef HWPJS_NATIVE_HISTORY_V2
        r.status = hwp_native_history_stats_v2(bridge_,p.token,&r.buffer,sizeof r.buffer);
#else
        r.status = HWP_NATIVE_INVALID_ARGUMENT; r.error = "NativeHistoryV2Unavailable";
#endif
        break;
      case Operation::State:
        r.status = hwp_native_state(bridge_, p.token, &r.state, sizeof r.state);
        r.hasState = r.status == HWP_NATIVE_OK;
        break;
      case Operation::Close: r.status = hwp_native_close(bridge_, p.token); break;
      case Operation::Dispose:
        r.status = hwp_native_bridge_destroy(bridge_);
        if (r.status == HWP_NATIVE_OK) bridge_ = nullptr;
        return r;
    }
    if ((p.op == Operation::HistoryStats || p.op == Operation::Read || p.op == Operation::Save || p.op == Operation::Snapshot || p.op == Operation::SnapshotWindow || p.op == Operation::RenderSources || p.op == Operation::PictureBytes) && r.status == HWP_NATIVE_OK) {
      OutputLease lease{bridge_, r.buffer.token};
      canvasFault("buffer-copy-allocation");
      r.bytes.resize(r.buffer.length);
      size_t written = 0;
      r.status = hwp_native_buffer_copy(bridge_, r.buffer.token, r.bytes.data(), r.bytes.size(), &written);
      r.hasBytes = r.status == HWP_NATIVE_OK && written == r.bytes.size();
      if (!r.hasBytes && r.status == HWP_NATIVE_OK) r.status = HWP_NATIVE_BACKEND_ERROR;
    }
    const auto t = r.hasToken ? r.token : p.token;
    if (!r.hasState && p.op != Operation::Close && t.slot != 0) {
      r.hasState = hwp_native_state(bridge_, t, &r.state, sizeof r.state) == HWP_NATIVE_OK;
    }
    if (r.status != HWP_NATIVE_OK && r.status != HWP_NATIVE_NO_OP) {
      HwpNativeBuffer error{};
      if (t.slot != 0 && hwp_native_error_copy(bridge_, t, &error, sizeof error) == HWP_NATIVE_OK) {
        OutputLease lease{bridge_, error.token};
        std::vector<uint8_t> text(error.length);
        size_t written = 0;
        if (hwp_native_buffer_copy(bridge_, error.token, text.data(), text.size(), &written) == HWP_NATIVE_OK) {
          r.error.assign(text.begin(), text.end());
        }
      }
      if (r.error.empty()) r.error = "NativeStatus:" + std::to_string(r.status);
    }
    return r;
  }
 private:
  HwpNativeBridge *bridge_ = nullptr; // Never converted to a JS number.
};
jsi::Object errorObject(jsi::Runtime &rt, const char *message) {
  return rt.global().getPropertyAsFunction(rt, "Error").callAsConstructor(rt, jsi::String::createFromUtf8(rt, message)).asObject(rt);
}
jsi::Object tokenObject(jsi::Runtime &rt, HwpNativeToken token, const std::shared_ptr<TokenAuthority> &authority) {
  return jsi::Object::createFromHostObject(rt, std::make_shared<TokenHandle>(token, authority));
}
jsi::Object reply(jsi::Runtime &rt, const Result &r, const std::shared_ptr<TokenAuthority> &authority) {
  jsi::Object o(rt);
  o.setProperty(rt, "kind", jsi::String::createFromUtf8(rt, r.kind));
  o.setProperty(rt, "status", static_cast<double>(r.status));
  if(r.failure)o.setProperty(rt,"error",jsi::String::createFromAscii(rt,r.failure));
  else if (!r.error.empty()) o.setProperty(rt, "error", jsi::String::createFromUtf8(rt, r.error));
  if (r.hasToken) o.setProperty(rt, "token", tokenObject(rt, r.token, authority));
  if (r.hasState) {
    o.setProperty(rt, "revision", static_cast<double>(r.state.revision));
    o.setProperty(rt, "epoch", static_cast<double>(r.state.epoch));
    o.setProperty(rt, "historyRevision", static_cast<double>(r.state.history_revision));
    o.setProperty(rt, "undoCount", static_cast<double>(r.state.undo_count));
    o.setProperty(rt, "redoCount", static_cast<double>(r.state.redo_count));
  }
  if (r.hasBytes) {
    auto array = rt.global().getPropertyAsFunction(rt, "Uint8Array").callAsConstructor(rt, static_cast<double>(r.bytes.size())).asObject(rt);
    auto buffer = array.getPropertyAsObject(rt, "buffer").getArrayBuffer(rt);
    if (!r.bytes.empty()) std::memcpy(buffer.data(rt), r.bytes.data(), r.bytes.size());
    o.setProperty(rt, "bytes", std::move(array));
    o.setProperty(rt, "encoding", static_cast<double>(r.buffer.encoding));
    if (r.buffer.layout_requires_reflow == 2) o.setProperty(rt, "layoutRequiresReflow", jsi::Value::null());
    else o.setProperty(rt, "layoutRequiresReflow", r.buffer.layout_requires_reflow == 1);
    o.setProperty(rt, "outputRevision", static_cast<double>(r.buffer.revision));
    if (r.kind == "save") o.setProperty(rt, "savedRevision", static_cast<double>(r.buffer.revision));
  }
  const bool mutation = r.kind == "splice" || r.kind == "history";
  jsi::Object meta(rt);
  meta.setProperty(rt, "application", r.status == HWP_NATIVE_INDETERMINATE ? "unknown" : mutation && r.status == HWP_NATIVE_OK ? "applied" : "unapplied");
  if (r.status == HWP_NATIVE_INDETERMINATE) meta.setProperty(rt, "changed", jsi::Value::null());
  else meta.setProperty(rt, "changed", mutation && r.status == HWP_NATIVE_OK);
  o.setProperty(rt, "meta", std::move(meta));
  return o;
}
struct Completion { jsi::Function resolve, reject; bool closing; };
// Runtime-managed HostFunction captures own this state. No Runtime* is retained.
// Native tasks capture only Session, Packet, fence and a weak reference to Service.
class Service final : public std::enable_shared_from_this<Service> {
 public:
  Service(NativeContextSchedulers schedulers, std::shared_ptr<NativeRuntimeFence> fence)
      : schedulers_(std::move(schedulers)), fence_(std::move(fence)), session_(std::make_shared<Session>()) {}
  Packet readPacket(jsi::Runtime &rt, const jsi::Value &value) {
    if (terminal_ || !fence_->active()) throw jsi::JSError(rt, "NativeRuntimeDisposed");
    canvasFault("packet-parse");return parse(rt, value, authority_);
  }
  size_t pendingForTest() const {return pending_.size();}
  void prepareFailures(jsi::Runtime &rt) {
    failed_.emplace(errorObject(rt,"NativeContextException"));
    disposed_.emplace(errorObject(rt,"NativeRuntimeDisposed"));
  }
  void invalidate(jsi::Runtime &rt) {
    terminal_=true;admission_->store(false,std::memory_order_release);
    // No temporary vector: erase each completion before invoking user-visible JS.
    std::exception_ptr failure;
    for(auto it=pending_.begin();it!=pending_.end();) {
      if(it->second.closing){++it;continue;}
      auto reject=std::move(it->second.reject);it=pending_.erase(it);
      try{canvasFault("invalidation-reject");reject.call(rt,jsi::Value(rt,*disposed_));}catch(...){if(!failure)failure=std::current_exception();try{reject.call(rt,jsi::Value(rt,*failed_));}catch(...){}}
    }
    if(failure)std::rethrow_exception(failure);
  }
  jsi::Object request(jsi::Runtime &rt, Packet packet, bool closing = false) {
    if (!closing && (terminal_ || !fence_->active())) throw jsi::JSError(rt, "NativeRuntimeDisposed");
    if (pending_.size() >= 128 || nextId_ == UINT32_MAX) throw jsi::JSError(rt, "NativeRequestLimitExceeded");
    const uint32_t id = ++nextId_;
    auto self = shared_from_this();
    auto executor = jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "nativeContextPromise"), 2,
      [self, packet = std::move(packet), id, closing](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
        if (count != 2 || !args[0].isObject() || !args[1].isObject()) throw jsi::JSError(runtime, "NativeInvalidPromiseExecutor");
        try {
          // Result storage is prepared on runtime executor. Allocation failures
          // reject synchronously through Promise, before native work is admitted.
          canvasFault("result-allocation");
          auto result=std::make_shared<Result>();result->kind=packet.kind;
          canvasFault("pending-emplace");
          self->pending_.emplace(id,Completion{args[0].asObject(runtime).asFunction(runtime),args[1].asObject(runtime).asFunction(runtime),closing});
          auto weak=std::weak_ptr<Service>(self);auto native=self->session_;
          auto postRuntime=self->schedulers_.postRuntime;auto fence=self->fence_;auto admission=self->admission_;
          self->schedulers_.postNative([native,weak,postRuntime,fence,admission,packet,result,id,closing]() noexcept {
            try {
              if(!closing&&(!fence->active()||!admission->load(std::memory_order_acquire))){result->status=HWP_NATIVE_STALE_HANDLE;result->failure="NativeRuntimeDisposed";}
              else if(native){*result=native->run(packet);canvasFault("native-result-exception");}
            } catch(...) {
              // No heap work in the exceptional native path; the application
              // result may be unknown after a mutation. Existing core handles it.
              result->status=HWP_NATIVE_INDETERMINATE;result->failure="NativeOperationException";result->hasBytes=false;result->hasToken=false;
            }
            try {
              postRuntime([weak,result,id](jsi::Runtime &rt){if(auto owner=weak.lock())owner->complete(rt,id,*result);});
            } catch(...) {
              // A failed runtime executor is terminal. Do not touch JSI here.
              fence->invalidate();admission->store(false,std::memory_order_release);
              if(native)(void)native->shutdown();
            }
          });
        } catch(...) {
          // If enqueue threw after accepting a task, retaining Session in that
          // task defers destruction safely. No new operation enters this service.
          self->terminal_=true;self->admission_->store(false,std::memory_order_release);self->session_.reset();
          auto item=self->pending_.find(id);
          auto reject=args[1].asObject(runtime).asFunction(runtime);
          if(item!=self->pending_.end()){reject=std::move(item->second.reject);self->pending_.erase(item);}
          reject.call(runtime,jsi::Value(runtime,*self->failed_));
        }
        return jsi::Value::undefined();
      });
    return rt.global().getPropertyAsFunction(rt, "Promise").callAsConstructor(rt, std::move(executor)).asObject(rt);
  }
  jsi::Value dispose(jsi::Runtime &rt) {
    if (disposal_) return jsi::Value(rt, *disposal_);
    try{invalidate(rt);}catch(...){/* still enqueue the Native cleanup barrier */}
    Packet p{}; p.op = Operation::Dispose; p.kind = "dispose";
    auto promise = request(rt, std::move(p), true);
    disposal_.emplace(rt, promise);
    return jsi::Value(rt, *disposal_);
  }
 private:
  void complete(jsi::Runtime &rt, uint32_t id, const Result &result) {
    const auto item = pending_.find(id);
    if (item == pending_.end()) return; // invalidation or already settled
    auto completion = std::move(item->second); pending_.erase(item);
    try {
      if(!completion.closing&&(terminal_||!fence_->active())){completion.reject.call(rt,jsi::Value(rt,*disposed_));return;}
      canvasFault("reply-conversion");
      completion.resolve.call(rt,reply(rt,result,authority_));
    } catch(...) {
      try{completion.reject.call(rt,jsi::Value(rt,*failed_));}
      catch(...){terminal_=true;admission_->store(false,std::memory_order_release);session_.reset();}
    }
  }
  std::optional<jsi::Object> failed_,disposed_;
  std::shared_ptr<TokenAuthority> authority_ = std::make_shared<TokenAuthority>();
  NativeContextSchedulers schedulers_;
  std::shared_ptr<NativeRuntimeFence> fence_;
  std::shared_ptr<Session> session_;
  std::shared_ptr<std::atomic<bool>> admission_ = std::make_shared<std::atomic<bool>>(true);
  std::map<uint32_t, Completion> pending_;
  std::optional<jsi::Value> disposal_;
  uint32_t nextId_ = 0;
  bool terminal_ = false;
};
}
jsi::Object createNativeCanvasContextService(jsi::Runtime &rt, NativeContextSchedulers schedulers,
                                     std::shared_ptr<NativeRuntimeFence> fence) {
  if (!schedulers.postNative || !schedulers.postRuntime || !fence || !fence->active()) throw jsi::JSError(rt, "NativeInvalidContextSchedulers");
  HwpNativeAbiInfo abi{};
  if (hwp_native_abi_info(&abi, sizeof abi) != HWP_NATIVE_OK || abi.version != 1 ||
      abi.token_size != sizeof(HwpNativeToken) || abi.buffer_size != sizeof(HwpNativeBuffer) ||
      abi.state_size != sizeof(HwpNativeState) || abi.pointer_bits != 64) throw jsi::JSError(rt, "NativeAbiMismatch");
  auto service = std::make_shared<Service>(std::move(schedulers), std::move(fence));
  service->prepareFailures(rt);
  jsi::Object result(rt), descriptor(rt);
  descriptor.setProperty(rt, "protocol", "hwpjs.native-context/1");
  descriptor.setProperty(rt, "abiVersion", 1);

  descriptor.setProperty(rt, "projection", "format-native-wire");
#if defined(HWPJS_NATIVE_SHARED_SNAPSHOT) || defined(HWPJS_NATIVE_RENDER_SOURCES) || defined(HWPJS_NATIVE_HISTORY_V2)
  HwpNativeCapabilityInfo caps{};
  const bool capsValid = hwp_native_capabilities(&caps, sizeof caps) == HWP_NATIVE_OK &&
      caps.version == HWP_NATIVE_CAPS_CAPABILITY_VERSION && caps.struct_size == sizeof caps &&
      caps.abi_version == HWP_NATIVE_CAPS_ABI_VERSION;
#ifdef HWPJS_NATIVE_HISTORY_V2
  if (capsValid && (caps.flags & HWP_NATIVE_CAPS_HISTORY_V2))
    descriptor.setProperty(rt, "historyProtocol", "hwpjs.native-history/2");
#endif
#ifdef HWPJS_NATIVE_SHARED_SNAPSHOT
  if (capsValid && (caps.flags & HWP_NATIVE_CAPS_SNAPSHOT_V2) &&
      caps.snapshot_version == HWP_NATIVE_CAPS_SNAPSHOT_VERSION)
    descriptor.setProperty(rt, "snapshotProtocol", "hwpjs.native-snapshot/2");
#endif
#ifdef HWPJS_NATIVE_RENDER_SOURCES
  if (capsValid && (caps.flags & HWP_NATIVE_CAPS_RENDER_SOURCES) &&
      caps.render_sources_version == HWP_NATIVE_CAPS_RENDER_SOURCES_VERSION)
    descriptor.setProperty(rt, "renderSourcesProtocol", "hwpjs.native-render-sources/3");
#endif
#endif
  result.setProperty(rt, "descriptor", std::move(descriptor));
  result.setProperty(rt, "request", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "request"), 1,
    [service](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
      if (count != 1) throw jsi::JSError(runtime, "NativeExpectedPacket");
      try{return service->request(runtime,service->readPacket(runtime,args[0]));}catch(const jsi::JSError &){throw;}catch(...){throw jsi::JSError(runtime,"NativeContextException");}
    }));
  result.setProperty(rt, "invalidate", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "invalidate"), 0,
    [service](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value {
      try{service->invalidate(runtime);}catch(const jsi::JSError &){throw;}catch(...){throw jsi::JSError(runtime,"NativeContextException");}return jsi::Value::undefined();
    }));
  result.setProperty(rt, "dispose", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "dispose"), 0,
    [service](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value { try{return service->dispose(runtime);}catch(const jsi::JSError &){throw;}catch(...){throw jsi::JSError(runtime,"NativeContextException");} }));
#ifdef HWPJS_NATIVE_CANVAS_TEST_FAULTS
  result.setProperty(rt,"__testPending",jsi::Function::createFromHostFunction(rt,jsi::PropNameID::forAscii(rt,"__testPending"),0,[service](jsi::Runtime &,const jsi::Value &,const jsi::Value *,size_t)->jsi::Value{return (double)service->pendingForTest();}));
#endif
  return result;
}
}
namespace hwpjs {
facebook::jsi::Object createNativeJsiCanvasBinding(
    facebook::jsi::Runtime &runtime, NativeContextSchedulers schedulers,
    std::shared_ptr<NativeRuntimeFence> fence, NativeTransportCreator creator) {
  auto binding = createNativeJsiBinding(runtime, fence, std::move(creator));
  binding.setProperty(runtime, "contextProtocol", "hwpjs.native-context/1");
  binding.setProperty(runtime, "createContextPort", facebook::jsi::Function::createFromHostFunction(
      runtime, facebook::jsi::PropNameID::forAscii(runtime, "createContextPort"), 0,
      [schedulers = std::move(schedulers), fence = std::move(fence)](
          facebook::jsi::Runtime &rt, const facebook::jsi::Value &, const facebook::jsi::Value *, size_t count) -> facebook::jsi::Value {
        if (count != 0) throw facebook::jsi::JSError(rt, "NativeInvalidContextArguments");
        try{return createNativeCanvasContextService(rt,schedulers,fence);}catch(const jsi::JSError &){throw;}catch(...){throw jsi::JSError(rt,"NativeContextException");}
      }));
  return binding;
}
}
