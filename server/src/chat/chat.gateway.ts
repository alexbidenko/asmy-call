import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface ChatMessage {
  name: string;
  text: string;
  socketId: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // Простейшее хранение сообщений в памяти: room -> массив сообщений
  private roomMessages: Record<string, ChatMessage[]> = {};
  private members: Record<string, string[]> = {};

  handleConnection(client: Socket) {
    console.log('[Chat] Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('[Chat] Client disconnected:', client.id);
    // По желанию можно чистить roomMessages, если все вышли

    const rooms = Object.entries(this.members).filter(([, sockets]) => sockets.includes(client.id));
    for (const [room, sockets] of rooms) {
      this.members[room] = sockets.filter((id) => id !== client.id);
      if (this.members[room].length === 0) {
        delete this.members[room];
        delete this.roomMessages[room];
      }
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room: string }
  ) {
    void client.join(payload.room);
    const history = this.roomMessages[payload.room] || [];
    client.emit('roomHistory', history);

    this.members[payload.room] = [...(this.members[payload.room] || []), client.id];
  }

  @SubscribeMessage('sendMessage')
  handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room: string; name: string; text: string }
  ) {
    const { room, name, text } = payload;
    if (!this.roomMessages[room]) {
      this.roomMessages[room] = [];
    }
    const newMessage = { name, text, socketId: client.id };
    this.roomMessages[room].push(newMessage);
    this.server.to(room).emit('newMessage', newMessage);
  }
}
