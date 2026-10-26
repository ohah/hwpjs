#import "HwpCanvasHost.h"
#import "HwpCanvasReplay.h"
#include <cmath>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
namespace jsi=facebook::jsi;
namespace {
struct Geometry {std::mutex mutex;CGRect bounds;};
struct RuntimeState {std::optional<jsi::Function> handler;};
std::string json(id dto){NSData *data=[NSJSONSerialization dataWithJSONObject:dto options:0 error:nil];return std::string((const char *)data.bytes,data.length);}
jsi::Value parse(jsi::Runtime &rt,const std::string &text){return rt.global().getPropertyAsObject(rt,"JSON").getPropertyAsFunction(rt,"parse").call(rt,jsi::String::createFromUtf8(rt,text));}
uint32_t integer(jsi::Runtime &rt,const jsi::Value &v){if(!v.isNumber()||!std::isfinite(v.getNumber())||v.getNumber()<0||v.getNumber()>UINT32_MAX||std::floor(v.getNumber())!=v.getNumber())throw jsi::JSError(rt,"InvalidCanvasInteger");return (uint32_t)v.getNumber();}
NSString *string(jsi::Runtime &rt,const jsi::Value &v){if(!v.isString())throw jsi::JSError(rt,"InvalidCanvasString");auto s=v.asString(rt).utf8(rt);NSString *result=[[NSString alloc] initWithBytes:s.data() length:s.size() encoding:NSUTF8StringEncoding];if(!result)throw jsi::JSError(rt,"InvalidCanvasUTF8");return result;}
}
jsi::Object createHwpCanvasHost(jsi::Runtime &rt,HwpNativeCanvas *view,CGRect initialBounds,
 std::function<void(std::function<void(jsi::Runtime &)>)> postRuntime,std::shared_ptr<std::atomic<bool>> alive) {
 auto state=std::make_shared<RuntimeState>();auto geometry=std::make_shared<Geometry>();geometry->bounds=initialBounds;
 auto local=std::make_shared<std::atomic<bool>>(true);std::weak_ptr<RuntimeState> weak=state;__weak HwpNativeCanvas *weakView=view;
 // This emitter captures no JSI values and can run on the main queue.
 auto emit=[weak,postRuntime,alive,local](id dto){if(!alive->load()||!local->load())return;auto text=json(dto);postRuntime([weak,alive,local,text=std::move(text)](jsi::Runtime &runtime){if(!alive->load()||!local->load())return;auto s=weak.lock();if(s&&s->handler)s->handler->call(runtime,parse(runtime,text));});};
 dispatch_async(dispatch_get_main_queue(),^{HwpNativeCanvas *target=weakView;if(!target)return;
  target.onBoundsChanged=^(CGRect b){{std::lock_guard<std::mutex> guard(geometry->mutex);geometry->bounds=b;}emit(@{@"event":@"bounds",@"width":@(b.size.width),@"height":@(b.size.height)});};
  target.onBoundsChanged(target.bounds);
  target.onDocumentPoint=^(NSDictionary *point){emit(@{@"event":@"point",@"point":point});};
 });
 jsi::Object host(rt);
 host.setProperty(rt,"resourceProtocol","hwpjs.native-image-resources/2");
 auto add=[&](const char *name,unsigned arity,auto fn){host.setProperty(rt,name,jsi::Function::createFromHostFunction(rt,jsi::PropNameID::forAscii(rt,name),arity,fn));};
 add("setReplyHandler",1,[state,alive,local](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{if(!alive->load()||!local->load()||n!=1||!a[0].isObject()||!a[0].asObject(r).isFunction(r))throw jsi::JSError(r,"InvalidCanvasReplyHandler");state->handler=a[0].asObject(r).asFunction(r);return {};});
 add("bounds",0,[geometry](jsi::Runtime &r,const jsi::Value &,const jsi::Value *,size_t)->jsi::Value{std::lock_guard<std::mutex> guard(geometry->mutex);return parse(r,json(@{@"width":@(geometry->bounds.size.width),@"height":@(geometry->bounds.size.height)}));});
 add("measureText",2,[](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{if(n!=2)throw jsi::JSError(r,"InvalidMeasureArguments");return parse(r,json([HwpCanvasReplay measure:string(r,a[0]) font:string(r,a[1])]));});
 add("segmentText",1,[alive,local](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{
  if(!alive->load()||!local->load())throw jsi::JSError(r,"Disposed");if(n!=1)throw jsi::JSError(r,"InvalidSegmentText");NSString *text=string(r,a[0]);if(text.length>1000000)throw jsi::JSError(r,"SegmentTextBudget");NSMutableArray *parts=[NSMutableArray new];
  [text enumerateSubstringsInRange:NSMakeRange(0,text.length) options:NSStringEnumerationByComposedCharacterSequences usingBlock:^(NSString *substring,NSRange range,NSRange enclosing,BOOL *stop){(void)enclosing;(void)stop;[parts addObject:@{@"segment":substring,@"index":@(range.location)}];}];return parse(r,json(parts));
 });
 add("encodeUTF8",1,[](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{if(n!=1)throw jsi::JSError(r,"InvalidEncodeText");NSData *data=[string(r,a[0]) dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];if(!data||data.length>64*1024*1024)throw jsi::JSError(r,"UTF8Budget");jsi::Array result(r,data.length);const uint8_t *bytes=(const uint8_t *)data.bytes;for(size_t i=0;i<data.length;i++)result.setValueAtIndex(r,i,static_cast<double>(bytes[i]));return result;});
 add("decodeUTF8",1,[](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{if(n!=1||!a[0].isObject())throw jsi::JSError(r,"InvalidDecodeBytes");auto v=a[0].asObject(r);auto b=v.getPropertyAsObject(r,"buffer").getArrayBuffer(r);auto off=integer(r,v.getProperty(r,"byteOffset")),len=integer(r,v.getProperty(r,"byteLength"));if(len>64*1024*1024||off>b.size(r)||len>b.size(r)-off)throw jsi::JSError(r,"UTF8ByteBounds");NSString *text=[[NSString alloc] initWithBytes:(len?b.data(r)+off:nullptr) length:len encoding:NSUTF8StringEncoding];if(!text)throw jsi::JSError(r,"InvalidUTF8");NSData *encoded=[text dataUsingEncoding:NSUTF8StringEncoding];return jsi::String::createFromUtf8(r,(const uint8_t *)encoded.bytes,encoded.length);});
 add("beginResources",2,[weakView,alive,local](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{if((n!=1&&n!=2)||!alive->load()||!local->load())throw jsi::JSError(r,"Disposed");auto epoch=integer(r,a[0]);NSString *document=n==2?string(r,a[1]):nil;dispatch_async(dispatch_get_main_queue(),^{if(alive->load()&&local->load()){if(document)[weakView beginResources:epoch document:document];else [weakView beginResources:epoch];}});return {};});
 add("present",2,[weakView,alive,local,emit](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{
  if(n!=2||!alive->load()||!local->load())throw jsi::JSError(r,"Disposed");auto requestId=integer(r,a[0]);NSString *text=string(r,a[1]);NSData *bytes=[text dataUsingEncoding:NSUTF8StringEncoding];if(bytes.length>32*1024*1024)throw jsi::JSError(r,"CanvasFrameBudget");
  NSError *error=nil;id dto=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:&error];if(![dto isKindOfClass:NSDictionary.class])throw jsi::JSError(r,"InvalidCanvasFrame");
  dispatch_async(dispatch_get_main_queue(),^{if(!alive->load()||!local->load())return;HwpNativeCanvas *target=weakView;if(!target){emit(@{@"id":@(requestId),@"error":@"Disposed"});return;}
   if(target.onFrameDrawn)target.onFrameDrawn(-1,NO);
   __block BOOL completed=NO;NSInteger expected=[dto[@"revision"] integerValue];
   target.onFrameDrawn=^(NSInteger revision,BOOL painted){if(completed)return;completed=YES;emit(painted&&revision==expected?@{@"id":@(requestId),@"ok":@YES}:@{@"id":@(requestId),@"error":@"StalePresentation"});};
   NSError *paintError=nil;if(![target presentFrame:dto error:&paintError]){target.onFrameDrawn(-1,NO);emit(@{@"event":@"error",@"error":paintError.localizedDescription?:@"PaintRejected"});}
  });return {};
 });
 add("decodeImage",4,[weakView,alive,local,emit](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{
  if(n!=4||!alive->load()||!local->load()||!a[2].isObject())throw jsi::JSError(r,"InvalidImageRequest");auto requestId=integer(r,a[0]);NSString *key=string(r,a[1]);auto array=a[2].asObject(r);auto buffer=array.getPropertyAsObject(r,"buffer").getArrayBuffer(r);auto offset=integer(r,array.getProperty(r,"byteOffset")),length=integer(r,array.getProperty(r,"byteLength")),revision=integer(r,a[3]);if(length>32*1024*1024||offset>buffer.size(r)||length>buffer.size(r)-offset)throw jsi::JSError(r,"ImageByteBounds");NSData *bytes=[NSData dataWithBytes:(length?buffer.data(r)+offset:nullptr) length:length];
  dispatch_async(dispatch_get_main_queue(),^{if(!alive->load()||!local->load())return;HwpNativeCanvas *target=weakView;if(!target){emit(@{@"id":@(requestId),@"error":@"Disposed"});return;}[target decodeImage:bytes key:key revision:revision completion:^(BOOL ok){if(ok)emit(@{@"id":@(requestId),@"ok":@YES,@"size":[target imageSize:key]});else emit(@{@"id":@(requestId),@"error":@"ImageDecodeRejected"});}];});return {};
 });
 add("releaseImage",2,[weakView](jsi::Runtime &r,const jsi::Value &,const jsi::Value *a,size_t n)->jsi::Value{if(n!=1&&n!=2)throw jsi::JSError(r,"InvalidImageKey");NSString *key=string(r,a[0]);NSNumber *version=n==2?@(integer(r,a[1])):nil;dispatch_async(dispatch_get_main_queue(),^{[weakView releaseImage:key version:version];});return {};});
 add("dispose",0,[weakView,state,local](jsi::Runtime &,const jsi::Value &,const jsi::Value *,size_t)->jsi::Value{local->store(false);state->handler.reset();dispatch_async(dispatch_get_main_queue(),^{[weakView dispose];});return {};});
 return host;
}
