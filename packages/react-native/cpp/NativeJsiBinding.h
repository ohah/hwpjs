#pragma once
#include <atomic>
#include <functional>
#include <memory>
#include <jsi/jsi.h>

namespace hwpjs {
// Contains no Runtime*, jsi::Value or native pointer encoded as a JS number.
// The platform host invalidates this before tearing down the runtime executor.
class NativeRuntimeFence final {
 public:
  void invalidate() noexcept { active_.store(false, std::memory_order_release); }
  bool active() const noexcept { return active_.load(std::memory_order_acquire); }
 private:
  std::atomic<bool> active_{true};
};

// A shared-provider owner supplies the actual EditorRuntime transport factory.
// Construct only its JSI wrapper here; parse/save must run on native serial work.
// The closure must not retain unmanaged JSI objects across runtime teardown.
using NativeTransportCreator = std::function<facebook::jsi::Object(facebook::jsi::Runtime &)>;

// Call only on the RN runtime executor. No global is installed at module import.
// An absent creator is explicitly unavailable, not a fake native editor backend.
facebook::jsi::Object createNativeJsiBinding(
    facebook::jsi::Runtime &, std::shared_ptr<NativeRuntimeFence>,
    NativeTransportCreator creator = {});
} // namespace hwpjs
