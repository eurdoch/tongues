package com.tongues

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.ReactInstanceManager
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "tongues"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
      
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent) {
    val action = intent.action
    val type = intent.type
    val data = intent.data
    
    if (Intent.ACTION_VIEW == action && data != null) {
      // Check file path directly
      val path = data.path?.lowercase() ?: ""
      val isEpub = path.endsWith(".epub") || type == "application/epub+zip"
      
      if (isEpub) {
        Log.d("TonguesApp", "Opening EPUB file: $data type=$type path=$path")
        val filePath = getFilePathFromUri(data)
        if (filePath != null) {
          sendEventToJS("openEpubFile", filePath)
        } else {
          Log.e("TonguesApp", "Failed to get file path from URI: $data")
        }
      }
    }
  }

  private fun getFilePathFromUri(uri: Uri): String? {
    Log.d("TonguesApp", "Getting file path from URI: $uri scheme=${uri.scheme}")
    return when (uri.scheme) {
      "content" -> {
        try {
          // For content URIs, just return the full URI string
          // React Native can handle content:// URIs
          uri.toString()
        } catch (e: Exception) {
          Log.e("TonguesApp", "Error handling content URI", e)
          null
        }
      }
      "file" -> {
        // Return the path for file URIs
        uri.path
      }
      else -> {
        // Return the complete URI as string for React Native to handle
        uri.toString()
      }
    }
  }

  private fun sendEventToJS(eventName: String, filePath: String) {
    try {
      val reactContext = this.reactInstanceManager.currentReactContext
      if (reactContext != null) {
        val params = Arguments.createMap().apply {
          putString("uri", filePath)
        }
        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(eventName, params)
      } else {
        // Store the file path to be processed when React context is ready
        // This would need additional code to track and process later
        Log.d("TonguesApp", "React context not available yet. Storing path: $filePath")
      }
    } catch (e: Exception) {
      Log.e("TonguesApp", "Error sending event to JS", e)
    }
  }
}
