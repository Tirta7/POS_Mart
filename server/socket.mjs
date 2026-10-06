import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

let io;
const pubClient = new Redis({
  retryStrategy: (times) => Math.min(times * 50, 2000)
});
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => console.error('Redis Pub Client Error', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error', err));

export const initSocket = async (httpServer) => {
  if (io) return io;
  
  io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket) => {
    socket.on('join_tenant', (tenantId) => {
      if (tenantId) {
        socket.join(tenantId);
        // console.log(`Socket ${socket.id} joined tenant ${tenantId}`);
      }
    });
  });

  return io;
};

export const getIo = () => io;
