import { Module } from '@nestjs/common';
import {ChatModule} from "./chat/chat.module";
import {WebRtcModule} from "./webrtc/webrtc.module";
import {ServeStaticModule} from "@nestjs/serve-static";
import { join } from 'path';
import {AppController} from "./app.controller";

@Module({
  imports: [
    ...(process.env.NODE_ENV === 'production' ? [
      ServeStaticModule.forRoot({
        rootPath: join(__dirname, '../..', 'client'),
      }),
    ] : []),
    ChatModule,
    WebRtcModule,
  ],
  controllers: process.env.NODE_ENV === 'production' ? [AppController] : [],
})
export class AppModule {}
