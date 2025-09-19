import { expressConnectMiddleware } from "@connectrpc/connect-express";
import { createContextValues, type Interceptor } from "@connectrpc/connect";
import { expressjwt as jwtMiddleware, type Request } from "express-jwt";
import http from "http";
import express from "express";
import { authRoutes, viewRoutes } from "./routes";
import cors from "cors";
import { uidKey } from "./utils";
import { env } from "./env";

type Jwt = { uid: string };

const logger: Interceptor = (next) => async (req) => {
   console.log(`received message on ${req.url}`);
   return await next(req);
};
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

http
   .createServer(app)
   .listen(env.PORT, env.HOST, () => {
      console.log(`TradView Server running on ${env.HOST}:${env.PORT}`);
      console.log(`CORS Origin: ${env.CORS_ORIGIN}`);
   });
