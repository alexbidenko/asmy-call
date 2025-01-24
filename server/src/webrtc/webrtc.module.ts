import { Module } from '@nestjs/common';
import { WebRtcGateway } from './webrtc.gateway';

@Module({
    providers: [WebRtcGateway],
})
export class WebRtcModule {}
