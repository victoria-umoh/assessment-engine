import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';

// Deliberately NOT @Global(): consumers import it explicitly so isolated
// module tests (e.g. categories.service.spec) keep compiling without AppModule.
// Bare ConfigModule import makes ConfigService resolvable in those tests too.
@Module({
  imports: [ConfigModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
