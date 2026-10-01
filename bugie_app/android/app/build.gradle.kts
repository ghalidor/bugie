plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // Plugin que procesa google-services.json y configura Firebase.
    id("com.google.gms.google-services")
}

android {
    namespace = "pe.bugie.bugie_app"
    compileSdk = 36
    ndkVersion = "27.0.12077973"

    compileOptions {
        // Core library desugaring: requerido por flutter_local_notifications
        // (usa java.time APIs que en Android viejos no existen). El plugin
        // de Android los emula en runtime para soportar API levels bajos.
        isCoreLibraryDesugaringEnabled = true

        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "pe.bugie.bugie_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Soporta vector drawables y multidex (necesario al agregar Firebase
        // + flutter_local_notifications que tienen muchos métodos).
        multiDexEnabled = true
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

// Dependencia de desugaring usada por flutter_local_notifications.
// La versión 2.0.4+ es la que recomienda actualmente el plugin.
dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")
}

flutter {
    source = "../.."
}