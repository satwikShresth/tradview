import type { Interceptor } from "@connectrpc/connect";
import { env } from "../env";

export const logger: Interceptor = (next) => async (req) => {
   const start = Date.now();
   console.log(`[${new Date().toISOString()}] 📨 Incoming request: ${req.method} ${req.url}`);

   try {
      const result = await next(req);
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ✅ Request completed: ${req.method} ${req.url} (${duration}ms)`);
      return result;
   } catch (error) {
      const duration = Date.now() - start;
      console.error(`[${new Date().toISOString()}] ❌ Request failed: ${req.method} ${req.url} (${duration}ms)`, error);
      throw error;
   }
};

export function notFoundHandler(req: any, _: any, next: any) {
   const error = new Error(`Route not found: ${req.method} ${req.url}`);
   (error as any).status = 404;
   next(error);
};


export function errorHandler(err: any, req: any, res: any, next: any) {
   if (res.headersSent) {
      return next(err);
   }
   console.error(`[Error] ${req.method} ${req.url}:`, err.message);
   const statusCode = err.status || err.statusCode || 500;
   res.status(statusCode).json({
      error: {
         message: env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
         status: statusCode,
         ...(env.NODE_ENV === 'development' && { stack: err.stack })
      }
   });
};
