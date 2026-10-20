import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

let io;
let pubClient;
let subClient;

export const initSocket = async (httpServer) => {
  if (io) return io;
  
  io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
  if (redisUrl) {
    pubClient = new Redis(redisUrl, {
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('Redis Pub Client Error', err));
    subClient.on('error', (err) => console.error('Redis Sub Client Error', err));

    io.adapter(createAdapter(pubClient, subClient));
  }

  io.on('connection', (socket) => {
    socket.on('join_tenant', (tenantId) => {
      if (tenantId) {
        socket.join(tenantId);
      }
    });

    socket.on('broadcast_drafts', ({ tenantId, drafts }) => {
      if (tenantId) {
        socket.to(tenantId).emit('sync_drafts', drafts);
      }
    });

    // Customer Facing Display (CFD) Real-time Synchronization
    socket.on('cfd_update', (payload) => {
      const tenantId = payload?.tenantId || 'TID-DEMO-123';
      socket.to(tenantId).emit('cfd_cart_update', payload);
    });

    socket.on('cfd_request_state', (payload) => {
      const tenantId = payload?.tenantId || 'TID-DEMO-123';
      socket.to(tenantId).emit('cfd_send_current_state');
    });
  });

  return io;
};

export const getIo = () => io;
