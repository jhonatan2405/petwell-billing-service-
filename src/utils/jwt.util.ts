import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole =
    | 'DUENO_MASCOTA'
    | 'CLINIC_ADMIN'
    | 'VETERINARIO'
    | 'RECEPCIONISTA'
    | 'PETWELL_ADMIN';

export interface JwtPayload {
    sub: string;
    id?: string;
    email: string;
    role: UserRole;
    clinic_id?: string;
    iat?: number;
    exp?: number;
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
