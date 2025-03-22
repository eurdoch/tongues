#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface TonguesModule : RCTEventEmitter <RCTBridgeModule>

- (void)sendOpenEpubFileEvent:(NSString *)filePath;

@end