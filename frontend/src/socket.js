import { io } from 'socket.io-client';
import { getToken } from './api';

// Single shared socket so every component listens to the same real-time stream.
// The JWT is attached to the handshake for authentication.
export const socket = io('/', {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  auth: { token: getToken() }
});

// If the token changes (login/logout) while already connected, re-authenticate.
export function setSocketAuth(token) {
  socket.auth = { token };
}