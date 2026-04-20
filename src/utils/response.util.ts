import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, message = 'OK', statusCode = 200): void {
    res.status(statusCode).json({ success: true, message, data });
}

export function sendError(res: Response, message: string, statusCode = 500): void {
    res.status(statusCode).json({ success: false, message });
}
