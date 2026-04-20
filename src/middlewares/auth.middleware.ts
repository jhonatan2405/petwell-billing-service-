import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt.util';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request { user?: JwtPayload; }
    }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: 'Token no proporcionado' });
        return;
    }

    const token = authHeader.split(' ')[1];
    try {
        req.user = verifyToken(token);
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Token inválido o expirado' });
    }
}

export function authorize(...roles: JwtPayload['role'][]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, message: 'No autenticado' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ success: false, message: 'Sin permisos para esta acción' });
            return;
        }
        next();
    };
}

export function authenticateService(req: Request, res: Response, next: NextFunction): void {
    const serviceKey = req.headers['x-internal-service-key'];
    if (!serviceKey || serviceKey !== process.env.INTERNAL_SERVICE_KEY) {
        res.status(403).json({ success: false, message: 'Acceso denegado al servicio interno' });
        return;
    }
    next();
}
