import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

let io;
const pubClient = createClient();
const subClient = pubClient.duplicate();

export const initSocket = async (httpServer) => {
  if (io) return io;
  
  await Promise.all([pubClient.connect(), subClient.connect()]).catch(console.error);

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
