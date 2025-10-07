import type { ConnectRouter } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { AuthService } from "@tradview/proto";
import jwt from 'jsonwebtoken';
import { v7 } from 'uuid';
import { env } from '../env';


export default (router: ConnectRouter) =>
  router.service(AuthService, {
    generateToken: async (_req, _context) => {
      console.log(`[Auth] 🔑 Generating new JWT token...`);

      const uid = v7();
      if (!uid) {
        console.error(`[Auth] ❌ Failed to generate UUID`);
        throw new ConnectError("Failed to generate uid", Code.Internal);
      }

      const token = jwt.sign({ uid }, env.JWT_SECRET, { algorithm: "HS256" });

      if (!token) {
        console.error(`[Auth] ❌ Failed to sign JWT for uid: ${uid}`);
        throw new ConnectError("Failed to generate JWT", Code.Internal);
      }

      console.log(`[Auth] ✅ JWT token successfully generated for uid: ${uid.substring(0, 8)}...`);
      return { token };
    },
  });
