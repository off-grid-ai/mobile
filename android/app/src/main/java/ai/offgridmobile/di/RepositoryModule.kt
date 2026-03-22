package ai.offgridmobile.di

import ai.offgridmobile.data.repository.ImageGenRepository
import ai.offgridmobile.data.repository.ImageGenRepositoryImpl
import ai.offgridmobile.data.repository.ModelRepository
import ai.offgridmobile.data.repository.ModelRepositoryImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindModelRepository(impl: ModelRepositoryImpl): ModelRepository

    @Binds
    @Singleton
    abstract fun bindImageGenRepository(impl: ImageGenRepositoryImpl): ImageGenRepository
}
