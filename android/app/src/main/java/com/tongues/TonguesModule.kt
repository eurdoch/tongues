package com.tongues

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise

/**
 * Module to handle EPUB file operations and access pending files
 */
class TonguesModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "TonguesModule"
    
    @ReactMethod
    fun checkPendingFiles(promise: Promise? = null) {
        Log.d("TonguesModule", "Checking for pending files")
        
        try {
            // Access MainActivity to check for pending files
            val mainActivity = reactContext.currentActivity as? MainActivity
            if (mainActivity != null) {
                val pendingUri = mainActivity.getAndClearPendingFileUri()
                if (pendingUri != null) {
                    Log.d("TonguesModule", "Found pending file: $pendingUri")
                    
                    // Emit event to JavaScript
                    val params = Arguments.createMap().apply {
                        putString("uri", pendingUri)
                    }
                    
                    try {
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("openEpubFile", params)
                        
                        Log.d("TonguesModule", "Successfully sent openEpubFile event")
                    } catch (e: Exception) {
                        Log.e("TonguesModule", "Error sending event", e)
                    }
                    
                    promise?.resolve(true)
                } else {
                    Log.d("TonguesModule", "No pending files found")
                    promise?.resolve(false)
                }
            } else {
                Log.e("TonguesModule", "MainActivity is not available")
                promise?.resolve(false)
            }
        } catch (e: Exception) {
            Log.e("TonguesModule", "Error checking pending files", e)
            promise?.reject("ERROR", e.message)
        }
    }
    
}