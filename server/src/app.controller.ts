import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { join } from 'path';

@Controller()
export class AppController {
  @Get('*')
  renderClient(@Res() reply: FastifyReply) {
    return reply.sendFile('index.html', { root: join(__dirname, '../..', 'client') });
  }
}
