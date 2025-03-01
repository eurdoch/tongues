package com.tongues

import android.content.Context
import android.provider.Settings
import android.os.Build
import android.app.ActivityManager
import android.content.Intent

/**
 * Utility class to help disable clipboard access notifications on Android
 */
object ClipboardNotificationHelper {
    
    /**
     * Attempt to disable clipboard access notifications in MainActivity
     */
    fun disableClipboardNotifications(context: Context) {
        try {
            // For Android 12+ (API 31+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Unfortunately we can't programmatically disable clipboard notifications
                // on Android 12+, but we can show instructions to the user
                
                // This is a no-op for now, as we don't want to annoy users with a popup
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}