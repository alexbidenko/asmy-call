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
}

@WebSocketGateway({
    cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;

    // Простейшее хранение сообщений в памяти: room -> массив сообщений
    private roomMessages: Record<string, ChatMessage[]> = {};

    handleConnection(client: Socket) {
        console.log('[Chat] Client connected:', client.id);
    }

    handleDisconnect(client: Socket) {
        console.log('[Chat] Client disconnected:', client.id);
        // По желанию можно чистить roomMessages, если все вышли
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { room: string }
    ) {
        client.join(payload.room);
        const history = this.roomMessages[payload.room] || [];
        client.emit('roomHistory', history);
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
        const newMessage = { name, text };
        this.roomMessages[room].push(newMessage);
        this.server.to(room).emit('newMessage', newMessage);
    }
}
