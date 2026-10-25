#include "NativeJsiBinding.h"
#include "hwp_native.h"
#include <utility>

namespace hwpjs {
namespace jsi = facebook::jsi;

jsi::Object createNativeJsiBinding(jsi::Runtime &runtime,
                                 std::shared_ptr<NativeRuntimeFence> fence,
                                 NativeTransportCreator creator) {
  if (!fence || !fence->active()) throw jsi::JSError(runtime, "NativeRuntimeDisposed");
  HwpNativeAbiInfo abi{};
  if (hwp_native_abi_info(&abi, sizeof abi) != HWP_NATIVE_OK || abi.version != 1 ||
      abi.struct_size != sizeof abi || abi.token_size != sizeof(HwpNativeToken) ||
      abi.buffer_size != sizeof(HwpNativeBuffer) || abi.state_size != sizeof(HwpNativeState) ||
      abi.pointer_bits != sizeof(void *) * 8) {
    throw jsi::JSError(runtime, "NativeAbiMismatch");
  }
  jsi::Object info(runtime);
  info.setProperty(runtime, "abiVersion", static_cast<double>(abi.version));
  info.setProperty(runtime, "tokenSize", static_cast<double>(abi.token_size));
  info.setProperty(runtime, "bufferSize", static_cast<double>(abi.buffer_size));
  info.setProperty(runtime, "stateSize", static_cast<double>(abi.state_size));
  info.setProperty(runtime, "pointerBits", static_cast<double>(abi.pointer_bits));
  // Pointer WIDTH is metadata, never an address or a context handle.
  jsi::Object binding(runtime);
  binding.setProperty(runtime, "abiInfo", std::move(info));
  binding.setProperty(runtime, "transportState", creator ? "configured" : "unavailable");
  binding.setProperty(runtime, "canvasAvailable", false);
  binding.setProperty(runtime, "nativeImeAvailable", false);
  binding.setProperty(runtime, "createTransport", jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "createTransport"), 0,
      [fence = std::move(fence), creator = std::move(creator)](
          jsi::Runtime &rt, const jsi::Value &, const jsi::Value *, size_t count) -> jsi::Value {
        if (!fence->active()) throw jsi::JSError(rt, "NativeRuntimeDisposed");
        if (count != 0) throw jsi::JSError(rt, "NativeInvalidTransportArguments");
        if (!creator) throw jsi::JSError(rt, "NativeBackendUnavailable: shared provider is not installed");
        // Reuse shared command/codec projection. No Worker/format router here.
        return creator(rt);
      }));
  return binding;
}
} // namespace hwpjs
