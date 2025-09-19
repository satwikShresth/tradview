import type { ConnectRouter } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { AuthService } from "@tradview/proto";
import jwt from 'jsonwebtoken';
import { v7 } from 'uuid';
import { env } from '../env';


type JwtPayload = { uid: string };
export default (router: ConnectRouter) =>
  router.service(AuthService, {
    generateToken: async (_req, _context) => {
      console.log(`[GenerateToken] Generating new token`);

      const uid = v7();
      if (!uid) {
        throw new ConnectError("Failed to generate uid", Code.Internal);
      }

      const token = jwt.sign({ uid }, env.JWT_SECRET, { algorithm: "HS256" });

      if (!token) {
        throw new ConnectError("Failed to generate JWT", Code.Internal);
      }

      console.log(`[GenerateToken] Token generated for uid: ${uid}`);
      return { token };
    },

    verifyToken: async (req, _context) => {
      console.log(`[VerifyToken] Verifying token`);

      if (!req.token) {
        return { valid: false, message: "Token is required" };
      }

      try {
        const decoded = jwt.verify(req.token, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
        console.log(`[VerifyToken] Token is valid for uid: ${decoded.uid}`);
        return {
          valid: true,
          uid: decoded.uid,
          message: "Token is valid"
        };
      } catch (error) {
        console.log(`[VerifyToken] Token verification failed: ${(error as Error).message}`);
        return {
          valid: false,
          message: error instanceof Error ? error.message : "Invalid token"
        };
      }
    },
  });
