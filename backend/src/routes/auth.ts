import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("SERVER CONFIGURATION ERROR: JWT_SECRET environment variable is missing.");
}

const requiredUsers = [
  { username: 'edge_superadmin', password: process.env.EDGE_SUPERADMIN_PASSWORD, permissions: ['EDGE_SUPERADMIN'] },
  { username: 'superadmin', password: process.env.SUPERADMIN_PASSWORD, permissions: ['BULL_RING_SUPERADMIN', 'BULL_RING_ADMIN'] },
  { username: 'admin', password: process.env.ADMIN_PASSWORD, permissions: ['BULL_RING_ADMIN'] },
  { username: 'att_admin', password: process.env.ATTENDANCE_ADMIN_PASSWORD, permissions: ['ATTENDANCE_ADMIN', 'ATTENDANCE_VERIFIER'] },
  { username: 'att_scanner', password: process.env.ATTENDANCE_SCANNER_PASSWORD, permissions: ['ATTENDANCE_VERIFIER'] },
  { username: 'betting_admin', password: process.env.BETTING_ADMIN_PASSWORD, permissions: ['BETTING_ADMIN'] },
  { username: 'auction_admin', password: process.env.AUCTION_ADMIN_PASSWORD, permissions: ['AUCTION_ADMIN'] },
  { username: 'multi_user', password: process.env.MULTI_ADMIN_PASSWORD, permissions: ['BULL_RING_ADMIN', 'ATTENDANCE_ADMIN', 'BETTING_ADMIN'] }
];

const missingCredentials = requiredUsers.filter(u => !u.password).map(u => u.username);
if (missingCredentials.length > 0) {
  throw new Error(`SERVER CONFIGURATION ERROR: Missing password environment variables for users: ${missingCredentials.join(', ')}`);
}

export const USERS = requiredUsers;

// Basic in-memory rate limiter for login
const loginAttempts = new Map<string, { count: number, resetTime: number }>();
const MAX_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function verifyToken(req: Request, res: Response, requiredPermissions: string[]) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized. Token missing.', status: 401 };
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as any;
    const userPermissions = decoded.permissions || [];
    
    // EDGE_SUPERADMIN has access to everything
    if (userPermissions.includes('EDGE_SUPERADMIN')) {
      (req as any).user = decoded;
      return { success: true };
    }

    const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
    if (!hasPermission) {
      return { error: 'Forbidden. Insufficient privileges.', status: 403 };
    }
    
    (req as any).user = decoded;
    return { success: true };
  } catch (err) {
    return { error: 'Invalid or expired token.', status: 401 };
  }
}

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const result = verifyToken(req, res, ['BULL_RING_ADMIN', 'BULL_RING_SUPERADMIN']);
  if (result.error) return res.status(result.status!).json({ error: result.error });
  next();
}

export function authenticateSuperadmin(req: Request, res: Response, next: NextFunction) {
  const result = verifyToken(req, res, ['BULL_RING_SUPERADMIN']);
  if (result.error) return res.status(result.status!).json({ error: result.error });
  next();
}

export function authenticateAttendanceAdmin(req: Request, res: Response, next: NextFunction) {
  const result = verifyToken(req, res, ['ATTENDANCE_ADMIN']);
  if (result.error) return res.status(result.status!).json({ error: result.error });
  next();
}

export function authenticateAttendanceScanner(req: Request, res: Response, next: NextFunction) {
  const result = verifyToken(req, res, ['ATTENDANCE_VERIFIER', 'ATTENDANCE_ADMIN']);
  if (result.error) return res.status(result.status!).json({ error: result.error });
  next();
}

router.post('/login', (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  const record = loginAttempts.get(ip);
  if (record && now < record.resetTime) {
    if (record.count >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }
  } else if (record && now >= record.resetTime) {
    loginAttempts.delete(ip);
  }

  const { username, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  let matchedUser = null;

  if (username) {
    let cleanUsername = username.trim().toLowerCase();
    if (cleanUsername === 'attendance_scanner') cleanUsername = 'att_scanner';
    matchedUser = USERS.find(u => u.username.toLowerCase() === cleanUsername && u.password === password);
  } else {
    // Backward compatibility: Find by password only
    matchedUser = USERS.find(u => u.password === password);
  }

  if (!matchedUser) {
    const newCount = (loginAttempts.get(ip)?.count || 0) + 1;
    loginAttempts.set(ip, { count: newCount, resetTime: now + LOCKOUT_WINDOW_MS });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Clear attempts on success
  loginAttempts.delete(ip);

  const token = jwt.sign({ 
    username: matchedUser.username, 
    permissions: matchedUser.permissions 
  }, JWT_SECRET as string, { expiresIn: '12h' });

  return res.json({ 
    token, 
    permissions: matchedUser.permissions, 
    username: matchedUser.username,
    message: 'Authentication successful' 
  });
});

router.get('/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as any;
    res.json({ valid: true, permissions: decoded.permissions || [], username: decoded.username });
  } catch (err) {
    res.status(401).json({ valid: false });
  }
});

export default router;
