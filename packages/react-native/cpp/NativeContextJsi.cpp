#include "NativeContextJsi.h"
#include "hwp_native.h"
#include <cmath>
#include <cstring>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace hwpjs {
namespace jsi = facebook::jsi;
namespace {
constexpr size_t limit = 64 * 1024 * 1024;
enum class Operation { Open, Read, Splice, Save, History, State, Snapshot, Close, Dispose };
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
  } else if (p.kind == "state") p.op = Operation::State;
  else if (p.kind == "snapshot") p.op = Operation::Snapshot;
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
  ~Session() { if (bridge_) (void)hwp_native_bridge_destroy(bridge_); }
  Result run(const Packet &p) {
    Result r{}; r.kind = p.kind;
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
        r.status = hwp_native_snapshot(bridge_, p.token, &r.buffer, sizeof r.buffer);
#else
        r.status = HWP_NATIVE_INVALID_ARGUMENT; r.error = "NativeSnapshotUnavailable";
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
    if ((p.op == Operation::Read || p.op == Operation::Save || p.op == Operation::Snapshot) && r.status == HWP_NATIVE_OK) {
      OutputLease lease{bridge_, r.buffer.token};
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
  if (!r.error.empty()) o.setProperty(rt, "error", jsi::String::createFromUtf8(rt, r.error));
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
    return parse(rt, value, authority_);
  }
  void invalidate(jsi::Runtime &rt) {
    terminal_ = true;
    admission_->store(false, std::memory_order_release);
    // Preserve a dispose completion until the native queue has really drained.
    std::vector<jsi::Function> abandoned;
    for (auto it = pending_.begin(); it != pending_.end();) {
      if (it->second.closing) { ++it; continue; }
      abandoned.push_back(std::move(it->second.reject)); it = pending_.erase(it);
    }
    for (auto &reject : abandoned) reject.call(rt, errorObject(rt, "NativeRuntimeDisposed"));
  }
  jsi::Object request(jsi::Runtime &rt, Packet packet, bool closing = false) {
    if (!closing && (terminal_ || !fence_->active())) throw jsi::JSError(rt, "NativeRuntimeDisposed");
    if (pending_.size() >= 128 || nextId_ == UINT32_MAX) throw jsi::JSError(rt, "NativeRequestLimitExceeded");
    const uint32_t id = ++nextId_;
    auto self = shared_from_this();
    auto executor = jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "nativeContextPromise"), 2,
      [self, packet = std::move(packet), id, closing](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
        if (count != 2 || !args[0].isObject() || !args[1].isObject()) throw jsi::JSError(runtime, "NativeInvalidPromiseExecutor");
        self->pending_.emplace(id, Completion{args[0].asObject(runtime).asFunction(runtime), args[1].asObject(runtime).asFunction(runtime), closing});
        auto weak = std::weak_ptr<Service>(self);
        auto native = self->session_;
        auto postRuntime = self->schedulers_.postRuntime;
        auto fence = self->fence_;
        auto admission = self->admission_;
        try {
          self->schedulers_.postNative([native, weak, postRuntime, fence, admission, packet, id, closing]() {
            auto result = std::make_shared<Result>();
            try {
              if (!closing && (!fence->active() || !admission->load(std::memory_order_acquire))) { result->kind = packet.kind; result->status = HWP_NATIVE_STALE_HANDLE; result->error = "NativeRuntimeDisposed"; }
              else *result = native->run(packet);
            } catch (const std::exception &e) {
              result->kind = packet.kind; result->status = HWP_NATIVE_INDETERMINATE; result->error = e.what();
            }
            // Executor must drop callbacks after runtime destruction; no JS data
            // is captured here, and weak state is locked only on runtime thread.
            try {
              postRuntime([weak, result, id](jsi::Runtime &runtime) {
                if (auto owner = weak.lock()) owner->complete(runtime, id, *result);
              });
            } catch (...) { /* runtime executor has stopped; no JSI access here */ }
          });
        } catch (const std::exception &e) {
          auto item = self->pending_.find(id);
          if (item != self->pending_.end()) {
            auto reject = std::move(item->second.reject); self->pending_.erase(item);
            reject.call(runtime, errorObject(runtime, e.what()));
          }
        }
        return jsi::Value::undefined();
      });
    return rt.global().getPropertyAsFunction(rt, "Promise").callAsConstructor(rt, std::move(executor)).asObject(rt);
  }
  jsi::Value dispose(jsi::Runtime &rt) {
    if (disposal_) return jsi::Value(rt, *disposal_);
    invalidate(rt);
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
    if (!completion.closing && (terminal_ || !fence_->active())) {
      completion.reject.call(rt, errorObject(rt, "NativeRuntimeDisposed")); return;
    }
    try { completion.resolve.call(rt, reply(rt, result, authority_)); }
    catch (const std::exception &e) { completion.reject.call(rt, errorObject(rt, e.what())); }
  }
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
jsi::Object createNativeContextService(jsi::Runtime &rt, NativeContextSchedulers schedulers,
                                     std::shared_ptr<NativeRuntimeFence> fence) {
  if (!schedulers.postNative || !schedulers.postRuntime || !fence || !fence->active()) throw jsi::JSError(rt, "NativeInvalidContextSchedulers");
  HwpNativeAbiInfo abi{};
  if (hwp_native_abi_info(&abi, sizeof abi) != HWP_NATIVE_OK || abi.version != 1 ||
      abi.token_size != sizeof(HwpNativeToken) || abi.buffer_size != sizeof(HwpNativeBuffer) ||
      abi.state_size != sizeof(HwpNativeState) || abi.pointer_bits != 64) throw jsi::JSError(rt, "NativeAbiMismatch");
  auto service = std::make_shared<Service>(std::move(schedulers), std::move(fence));
  jsi::Object result(rt), descriptor(rt);
  descriptor.setProperty(rt, "protocol", "hwpjs.native-context/1");
  descriptor.setProperty(rt, "abiVersion", 1);
  descriptor.setProperty(rt, "projection", "format-native-wire");
#ifdef HWPJS_NATIVE_SHARED_SNAPSHOT
  descriptor.setProperty(rt, "snapshotProtocol", "hwpjs.native-snapshot/1");
#endif
  result.setProperty(rt, "descriptor", std::move(descriptor));
  result.setProperty(rt, "request", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "request"), 1,
    [service](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
      if (count != 1) throw jsi::JSError(runtime, "NativeExpectedPacket");
      return service->request(runtime, service->readPacket(runtime, args[0]));
    }));
  result.setProperty(rt, "invalidate", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "invalidate"), 0,
    [service](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value {
      service->invalidate(runtime); return jsi::Value::undefined();
    }));
  result.setProperty(rt, "dispose", jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "dispose"), 0,
    [service](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value { return service->dispose(runtime); }));
  return result;
}
}
namespace hwpjs {
facebook::jsi::Object createNativeJsiContextBinding(
    facebook::jsi::Runtime &runtime, NativeContextSchedulers schedulers,
    std::shared_ptr<NativeRuntimeFence> fence, NativeTransportCreator creator) {
  auto binding = createNativeJsiBinding(runtime, fence, std::move(creator));
  binding.setProperty(runtime, "contextProtocol", "hwpjs.native-context/1");
  binding.setProperty(runtime, "createContextPort", facebook::jsi::Function::createFromHostFunction(
      runtime, facebook::jsi::PropNameID::forAscii(runtime, "createContextPort"), 0,
      [schedulers = std::move(schedulers), fence = std::move(fence)](
          facebook::jsi::Runtime &rt, const facebook::jsi::Value &, const facebook::jsi::Value *, size_t count) -> facebook::jsi::Value {
        if (count != 0) throw facebook::jsi::JSError(rt, "NativeInvalidContextArguments");
        return createNativeContextService(rt, schedulers, fence);
      }));
  return binding;
}
}
