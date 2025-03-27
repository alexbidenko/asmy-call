import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { WebRtcModule } from './webrtc/webrtc.module';

@Module({
  imports: [ChatModule, WebRtcModule],
})
export class AppModule {}
