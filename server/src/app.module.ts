import { Module } from '@nestjs/common';
import {ChatModule} from "./chat/chat.module";
import {WebRtcModule} from "./webrtc/webrtc.module";
import {ServeStaticModule} from "@nestjs/serve-static";
import { join } from 'path';

@Module({
  imports: [
    ...(process.env.NODE_ENV === 'production' ? [
      ServeStaticModule.forRoot({
        renderPath: '*',
        rootPath: join(__dirname, '../..', 'client'),
      }),
    ] : []),
    ChatModule,
    WebRtcModule,
  ],
})
export class AppModule {}
