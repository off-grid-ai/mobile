package ai.offgridmobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val OledBlack = Color(0xFF000000)
val OledSurface = Color(0xFF0A0A0A)
val OledSurfaceVariant = Color(0xFF1A1A1A)
val TealPrimary = Color(0xFF00BCD4)
val TealDark = Color(0xFF00ACC1)
val OnBackground = Color(0xFFE0E0E0)
val OnSurfaceVariant = Color(0xFFB0B0B0)
val ErrorColor = Color(0xFFCF6679)

private val OffGridColorScheme = darkColorScheme(
    primary = TealPrimary,
    onPrimary = OledBlack,
    primaryContainer = Color(0xFF004F5A),
    onPrimaryContainer = Color(0xFFB2EBF2),
    secondary = TealDark,
    onSecondary = OledBlack,
    secondaryContainer = Color(0xFF003D47),
    onSecondaryContainer = Color(0xFFB2EBF2),
    tertiary = Color(0xFF80DEEA),
    onTertiary = OledBlack,
    background = OledBlack,
    onBackground = OnBackground,
    surface = OledSurface,
    onSurface = OnBackground,
    surfaceVariant = OledSurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    surfaceContainer = Color(0xFF0F0F0F),
    surfaceContainerHigh = Color(0xFF141414),
    surfaceContainerHighest = Color(0xFF1E1E1E),
    error = ErrorColor,
    onError = OledBlack,
    errorContainer = Color(0xFF4A1020),
    onErrorContainer = Color(0xFFFFDAD6),
    outline = Color(0xFF424242),
    outlineVariant = Color(0xFF2A2A2A),
    scrim = Color(0x99000000),
    inverseSurface = Color(0xFFE0E0E0),
    inverseOnSurface = OledBlack,
    inversePrimary = TealDark,
)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = OffGridColorScheme,
        typography = Typography(),
        content = content,
    )
}
