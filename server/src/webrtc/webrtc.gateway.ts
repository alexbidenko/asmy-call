import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  pingInterval: 5000,
  pingTimeout: 3000,
})
export class WebRtcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private rooms: Record<string, { id: string; username: string }[]> = {};

  handleConnection(client: Socket) {
    console.log('[WebRTC] Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('[WebRTC] Client disconnected:', client.id);
    for (const room in this.rooms) {
      const before = this.rooms[room].length;
      this.rooms[room] = this.rooms[room].filter((u) => u.id !== client.id);
      const after = this.rooms[room].length;
      if (before !== after) {
        console.log(`[handleDisconnect] in room=${room}, removed client=${client.id}`);
        client.to(room).emit('user-left', { socketId: client.id });
      }
    }
  }

  @SubscribeMessage('joinWebrtcRoom')
  handleJoinWebrtcRoom(client: Socket, payload: { room: string; username: string }) {
    console.log(`[joinWebrtcRoom] client=${client.id}, room=${payload.room}, user=${payload.username}`);
    const { room, username } = payload;
    client.join(room);

    // Если вдруг client.id уже есть - убираем прежнюю запись
    this.rooms[room] = (this.rooms[room] || []).filter(u => u.id !== client.id);

    client.to(room).emit('user-joined', { socketId: client.id, username });
    const existing = this.rooms[room].map((u) => ({
      socketId: u.id,
      username: u.username,
    }));
    client.emit('existingUsers', existing);

    this.rooms[room].push({ id: client.id, username });
    console.log(`[joinWebrtcRoom] now room=${room}, total=${this.rooms[room].length} users`);
  }

  @SubscribeMessage('webrtcSignal')
  handleWebrtcSignal(client: Socket, payload: {
    room: string;
    from: string;
    to: string;
    signalData: any;
  }) {
    console.log(
      `[webrtcSignal] from=${payload.from} to=${payload.to} in room=${payload.room}, signalType=${
        payload.signalData?.sdp?.type || (payload.signalData?.candidate ? 'candidate' : 'unknown')
      }`
    );
    this.server.to(payload.to).emit('webrtcSignal', payload);
  }

  // +++ добавим событие requestRenegotiation
  @SubscribeMessage('requestRenegotiation')
  handleRequestRenegotiation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string; from: string; to: string }
  ) {
    // Просто пересылаем "master, прошу оффер"
    this.server.to(data.to).emit('pleaseRenegotiate', data);
  }
}
