package com.tongues

import android.content.ClipboardManager
import android.content.Context
import android.view.View
import android.widget.TextView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class TextSelectionModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "TextSelectionModule"

    @ReactMethod
    fun getSelectedText(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("ERROR", "Activity not found")
            return
        }

        try {
            // Try getting text via current focus
            val currentFocus = activity.window.currentFocus
            if (currentFocus is TextView) {
                val selStart = currentFocus.selectionStart
                val selEnd = currentFocus.selectionEnd
                
                if (selStart != -1 && selEnd != -1 && selStart != selEnd) {
                    val selectedText = currentFocus.text.substring(selStart, selEnd)
                    if (selectedText.isNotEmpty()) {
                        promise.resolve(selectedText)
                        return
                    }
                }
            }

            // Fallback to clipboard
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            if (clipboard?.hasPrimaryClip() == true) {
                val clipText = clipboard.primaryClip?.getItemAt(0)?.text
                if (clipText?.isNotEmpty() == true) {
                    promise.resolve(clipText.toString())
                    return
                }
            }
            
            promise.resolve(null)
            
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun hasSelectedText(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("ERROR", "Activity not found")
            return
        }

        try {
            val currentFocus = activity.window.currentFocus
            if (currentFocus is TextView) {
                val selStart = currentFocus.selectionStart
                val selEnd = currentFocus.selectionEnd
                
                if (selStart != -1 && selEnd != -1 && selStart != selEnd) {
                    val selectedText = currentFocus.text.substring(selStart, selEnd)
                    if (selectedText.isNotEmpty()) {
                        promise.resolve(true)
                        return
                    }
                }
            }
            
            promise.resolve(false)
            
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}