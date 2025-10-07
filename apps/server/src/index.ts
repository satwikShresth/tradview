import { expressConnectMiddleware } from "@connectrpc/connect-express";
import { createContextValues } from "@connectrpc/connect";
import { expressjwt as jwtMiddleware, type Request } from "express-jwt";
import http from "http";
import express from "express";
import { authRoutes, viewRoutes } from "./routes";
import cors from "cors";
import { errorHandler, logger, notFoundHandler, uidKey } from "./utils";
import { env } from "./env";


type Jwt = { uid: string };
const app = express()
   .use(cors())
   .use(express.json())
   .use(expressConnectMiddleware({
      routes: authRoutes,
      interceptors: [logger],
   }))
   .use(jwtMiddleware({ secret: env.JWT_SECRET, algorithms: ["HS256"] }))
   .use(expressConnectMiddleware({
      routes: viewRoutes,
      interceptors: [logger],
      contextValues: (req: Request<Jwt>) => createContextValues().set(uidKey, { uid: req.auth?.uid! })
   }))
   .use(notFoundHandler)
   .use(errorHandler)

http
   .createServer(app)
   .listen(
      env.PORT,
      env.HOST,
      () => {
         console.log('\n🚀 ===============================================');
         console.log('🎯 TradView Server Successfully Started!');
         console.log('===============================================');
         console.log(`📍 Server URL: http://${env.HOST}:${env.PORT}`);
         console.log(`🌐 CORS Origin: ${env.CORS_ORIGIN}`);
         console.log(`🔧 Environment: ${env.NODE_ENV}`);
         console.log(`🕒 Started at: ${new Date().toISOString()}`);
         console.log('===============================================\n');
      }
   );

