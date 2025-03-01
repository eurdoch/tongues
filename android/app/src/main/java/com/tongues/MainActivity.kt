package com.tongues

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.ReactInstanceManager
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.ReactInstanceEventListener

class MainActivity : ReactActivity(), ReactInstanceEventListener {

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
      
  private var pendingFileUri: String? = null
  
  // Method for TonguesModule to access and clear pending file URIs
  fun getAndClearPendingFileUri(): String? {
    val uri = pendingFileUri
    if (uri != null) {
      Log.d("TonguesApp", "Getting and clearing pending file URI: $uri")
      pendingFileUri = null
    }
    return uri
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Try to disable clipboard notifications (no-op on Android 12+)
    ClipboardNotificationHelper.disableClipboardNotifications(this)
    
    try {
      // Store the intent for processing after React is ready
      if (intent?.action == Intent.ACTION_VIEW && intent.data != null) {
        val data = intent.data
        val path = data?.path?.lowercase() ?: ""
        val mimeType = intent.type ?: ""
        val isEpub = path.endsWith(".epub") || mimeType == "application/epub+zip"
        
        if (isEpub) {
          Log.d("TonguesApp", "Storing EPUB URI for when React is ready: $data with type $mimeType")
          pendingFileUri = getFilePathFromUri(data!!)
          
          // Set the current intent to a MAIN intent to avoid processing this VIEW intent again
          val mainIntent = Intent(Intent.ACTION_MAIN)
          mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
          mainIntent.setPackage(packageName)
          intent = mainIntent
        }
      }
    } catch (e: Exception) {
      Log.e("TonguesApp", "Error in onCreate", e)
    }
  }
  
  override fun onResume() {
    super.onResume()
    
    try {
      // Register as a ReactInstanceEventListener to get notified when React is ready
      reactInstanceManager?.addReactInstanceEventListener(this)
    } catch (e: Exception) {
      Log.e("TonguesApp", "Error adding ReactInstanceEventListener", e)
    }
    
    // Process pending URI if we have one
    pendingFileUri?.let { uri ->
      try {
        Log.d("TonguesApp", "Trying to process pending URI in onResume: $uri")
        
        // We'll use a delayed handler to wait for React Native to initialize
        Handler(Looper.getMainLooper()).postDelayed({
          try {
            // Check if React context is available
            val reactContext = reactInstanceManager?.currentReactContext
            if (reactContext != null) {
              sendEventToJS("openEpubFile", uri)
            } else {
              Log.d("TonguesApp", "React context still not available, URI will be handled by ReactInstanceEventListener")
            }
          } catch (e: Exception) {
            Log.e("TonguesApp", "Error processing URI in delayed handler", e)
          }
        }, 2000) // Wait 2 seconds to give React Native time to initialize
      } catch (e: Exception) {
        Log.e("TonguesApp", "Error setting up delayed URI processing", e)
      }
    }
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
          // Copy the file to app data directory for persistence
          copyEpubToAppData(filePath)
          
          // Send event to open it
          sendEventToJS("openEpubFile", filePath)
        } else {
          Log.e("TonguesApp", "Failed to get file path from URI: $data")
        }
      }
    }
  }
  
  private fun copyEpubToAppData(inputFilePath: String) {
    try {
      // Extract filename from the path or use a timestamp
      val fileName = if (inputFilePath.contains("/")) {
        inputFilePath.substring(inputFilePath.lastIndexOf("/") + 1)
      } else {
        "book_${System.currentTimeMillis()}.epub"
      }
      
      // If the filename doesn't end with .epub, append it
      val targetFileName = if (!fileName.lowercase().endsWith(".epub")) {
        "$fileName.epub"
      } else {
        fileName
      }
      
      // Get path to app's document directory
      val targetDir = applicationContext.filesDir.absolutePath
      val targetPath = "$targetDir/$targetFileName"
      
      Log.d("TonguesApp", "Copying EPUB from $inputFilePath to $targetPath")
      
      // For content URIs, we need to use content resolver
      if (inputFilePath.startsWith("content://")) {
        try {
          val uri = Uri.parse(inputFilePath)
          contentResolver.openInputStream(uri)?.use { inputStream ->
            java.io.FileOutputStream(targetPath).use { outputStream ->
              inputStream.copyTo(outputStream)
            }
          }
          Log.d("TonguesApp", "Successfully copied content URI to app data")
        } catch (e: Exception) {
          Log.e("TonguesApp", "Error copying from content URI", e)
        }
      } else {
        // For file:// URIs and regular file paths
        try {
          val cleanPath = inputFilePath.replace("file://", "")
          java.io.File(cleanPath).copyTo(java.io.File(targetPath), overwrite = true)
          Log.d("TonguesApp", "Successfully copied file to app data")
        } catch (e: Exception) {
          Log.e("TonguesApp", "Error copying file", e)
        }
      }
    } catch (e: Exception) {
      Log.e("TonguesApp", "Error in copyEpubToAppData", e)
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
      val reactContext = this.reactInstanceManager?.currentReactContext
      if (reactContext != null) {
        val params = Arguments.createMap().apply {
          putString("uri", filePath)
        }
        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(eventName, params)
        
        Log.d("TonguesApp", "Successfully sent EPUB file path to React: $filePath")
      } else {
        // Store the file path to be processed when React context is ready
        pendingFileUri = filePath
        Log.d("TonguesApp", "React context not available yet. Storing path: $filePath")
      }
    } catch (e: Exception) {
      Log.e("TonguesApp", "Error sending event to JS", e)
      // Store the file path to be processed when React context is ready
      pendingFileUri = filePath
    }
  }
  
  /**
   * Called when React context is created - this is the most reliable place to send events to React
   * This is implementation of ReactInstanceEventListener interface
   */
  override fun onReactContextInitialized(context: ReactContext) {
    pendingFileUri?.let { uri ->
      Log.d("TonguesApp", "React context initialized, sending URI: $uri")
      
      // Small delay to make sure everything is ready
      Handler(Looper.getMainLooper()).postDelayed({
        val params = Arguments.createMap().apply {
          putString("uri", uri)
        }
        
        try {
          context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("openEpubFile", params)
          Log.d("TonguesApp", "Successfully sent EPUB file path to React from onReactContextInitialized: $uri")
          pendingFileUri = null
        } catch (e: Exception) {
          Log.e("TonguesApp", "Error sending event from onReactContextInitialized", e)
        }
      }, 1000)
    }
  }
}
