import { io } from 'socket.io-client';

const socket = io('/', {
  path: '/ws',
  withCredentials: true,
});

export default socket;