package com.privacycall.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // packages.add(new MyReactNativePackage());
            return PackageList(this).packages
          }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    
    // Create notification channels for Android 8.0+
    createNotificationChannels()
  }
  
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(NotificationManager::class.java)
      
      // Create high-priority channel for incoming calls
      val incomingCallsChannel = NotificationChannel(
        "incoming_calls",
        "Incoming Calls",
        NotificationManager.IMPORTANCE_HIGH // Critical for heads-up notifications
      )
      
      // Configure for VoIP calls
      incomingCallsChannel.description = "Notifications for incoming VoIP calls"
      incomingCallsChannel.enableLights(true)
      incomingCallsChannel.lightColor = android.graphics.Color.RED
      incomingCallsChannel.enableVibration(true)
      incomingCallsChannel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      
      // Disable notification channel sound to prevent continuous ringing
      incomingCallsChannel.setSound(null, null)
      
      notificationManager.createNotificationChannel(incomingCallsChannel)
      
      // Create general channel for other notifications
      val generalChannel = NotificationChannel(
        "general",
        "General Notifications", 
        NotificationManager.IMPORTANCE_DEFAULT
      )
      generalChannel.description = "General app notifications"
      
      notificationManager.createNotificationChannel(generalChannel)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
