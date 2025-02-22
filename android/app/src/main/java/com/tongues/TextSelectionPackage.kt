package com.tongues

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class TextSelectionPackage : ReactPackage {
    override fun createViewManagers(reactContext: ReactApplicationContext) = 
        emptyList<ViewManager<*, *>>()

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(TextSelectionModule(reactContext))
}
