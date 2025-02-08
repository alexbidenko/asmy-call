import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { join } from 'path';

declare module 'fastify' {
  interface FastifyReply {
    sendFile(filePath: string, options?: { root: string }): FastifyReply;
  }
}

@Controller()
export class AppController {
  @Get('*')
  renderClient(@Res() reply: FastifyReply) {
    return reply.sendFile('index.html', { root: join(__dirname, '../..', 'client') });
  }
}
