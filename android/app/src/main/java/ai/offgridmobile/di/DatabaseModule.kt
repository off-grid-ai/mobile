package ai.offgridmobile.di

import android.content.Context
import androidx.room.Room
import ai.offgridmobile.data.local.OffGridDatabase
import ai.offgridmobile.data.local.dao.ConversationDao
import ai.offgridmobile.data.local.dao.MessageDao
import ai.offgridmobile.data.local.dao.ModelDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): OffGridDatabase =
        Room.databaseBuilder(
            context,
            OffGridDatabase::class.java,
            "offgrid.db",
        ).build()

    @Provides
    fun provideConversationDao(db: OffGridDatabase): ConversationDao = db.conversationDao()

    @Provides
    fun provideMessageDao(db: OffGridDatabase): MessageDao = db.messageDao()

    @Provides
    fun provideModelDao(db: OffGridDatabase): ModelDao = db.modelDao()
}
