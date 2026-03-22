package ai.offgridmobile.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import ai.offgridmobile.R
import ai.offgridmobile.ui.screens.ChatScreen
import ai.offgridmobile.ui.screens.HomeScreen
import ai.offgridmobile.ui.screens.ModelsScreen
import ai.offgridmobile.ui.screens.SettingsScreen
import ai.offgridmobile.ui.theme.OledBlack
import ai.offgridmobile.ui.theme.OledSurface
import ai.offgridmobile.ui.theme.TealPrimary
import ai.offgridmobile.ui.theme.OnSurfaceVariant

sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Chat : Screen("chat/{conversationId}") {
        fun createRoute(id: Long) = "chat/$id"
    }
    data object Models : Screen("models")
    data object Settings : Screen("settings")
}

private data class BottomNavItem(
    val screen: Screen,
    val labelRes: Int,
    val icon: @Composable () -> Unit,
)

@Composable
fun OffGridApp(modifier: Modifier = Modifier) {
    val navController = rememberNavController()

    val bottomNavItems = listOf(
        BottomNavItem(Screen.Home, R.string.nav_chat) { Icon(Icons.Filled.Chat, contentDescription = null) },
        BottomNavItem(Screen.Models, R.string.nav_models) { Icon(Icons.Filled.Download, contentDescription = null) },
        BottomNavItem(Screen.Settings, R.string.nav_settings) { Icon(Icons.Filled.Settings, contentDescription = null) },
    )

    Scaffold(
        modifier = modifier,
        containerColor = OledBlack,
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination
            val showBottomBar = bottomNavItems.any { item ->
                currentDestination?.hierarchy?.any { it.route == item.screen.route } == true
            }
            if (showBottomBar) {
                NavigationBar(
                    containerColor = OledSurface,
                    contentColor = TealPrimary,
                ) {
                    bottomNavItems.forEach { item ->
                        val selected = currentDestination?.hierarchy?.any {
                            it.route == item.screen.route
                        } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(item.screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = item.icon,
                            label = { Text(stringResource(item.labelRes)) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = TealPrimary,
                                selectedTextColor = TealPrimary,
                                unselectedIconColor = OnSurfaceVariant,
                                unselectedTextColor = OnSurfaceVariant,
                                indicatorColor = Color(0xFF003D47),
                            ),
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    onConversationClick = { id ->
                        navController.navigate(Screen.Chat.createRoute(id))
                    },
                )
            }
            composable(
                route = Screen.Chat.route,
                arguments = listOf(
                    navArgument("conversationId") { type = NavType.LongType },
                ),
            ) { backStackEntry ->
                val id = backStackEntry.arguments?.getLong("conversationId") ?: -1L
                ChatScreen(
                    conversationId = id,
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.Models.route) {
                ModelsScreen()
            }
            composable(Screen.Settings.route) {
                SettingsScreen()
            }
        }
    }
}
