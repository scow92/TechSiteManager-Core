import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    user?: {
      readonly id: number;
      readonly public_id: string;
      readonly username: string;
      readonly role: 'admin' | 'manager' | 'engineer' | 'viewer';
      readonly active: number;
      readonly [key: string]: unknown;
    };
  }
}
